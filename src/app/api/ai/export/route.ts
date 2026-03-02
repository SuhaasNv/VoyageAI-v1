/**
 * POST /api/ai/export
 *
 * Streaming AI content generation for trip export formats.
 * Formats: "instagram" | "blog" | "summary"
 *
 * Auth required. Rate-limited per user + format.
 * Response: text/plain; charset=utf-8 (streaming chunks).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { logError } from "@/lib/logger";
import { sanitizeUserInput } from "@/lib/ai/safety";

export const runtime = "nodejs";

const EXPORT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";
const EXPORT_TIMEOUT_MS = 30_000;

// ─── Request schema ───────────────────────────────────────────────────────────

const ExportRequestSchema = z.object({
    format:      z.enum(["instagram", "blog", "summary"]),
    destination: z.string().min(1).max(200),
    dates:       z.string().max(100),
    days:        z.number().int().positive().max(60),
    budget:      z.number().nonnegative().optional(),
    currency:    z.string().length(3).optional(),
    highlights:  z.array(z.string().max(120)).max(15),
});

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildInstagramPrompt(dest: string, dates: string, highlights: string[]): string {
    const acts = highlights.slice(0, 5).join(", ");
    return `Write an Instagram caption for a trip to ${dest} (${dates}).
Top activities: ${acts}.

Requirements:
- Main caption: 2–3 engaging sentences, first-person voice, max 220 characters
- Include 3–4 emojis woven naturally into the text
- New line after the caption
- 8–10 relevant travel hashtags on the final line (e.g. #travel #${dest.replace(/\s+/g, "")} ...)
- Tone: excited, personal, inspiring — NOT generic

Return ONLY the caption + hashtags. No extra commentary.`;
}

function buildBlogPrompt(dest: string, dates: string, days: number, budget: number | undefined, currency: string | undefined, highlights: string[]): string {
    const budgetLine = budget && budget > 0
        ? `Total trip budget: ${currency ?? "USD"} ${budget.toLocaleString()}`
        : "";
    const dayHighlights = highlights.map((h, i) => `  Day ${i + 1}: ${h}`).join("\n");

    return `Write a first-person travel blog post about a trip to ${dest} from ${dates}.

Trip context:
- Duration: ${days} days
${budgetLine}
Itinerary highlights:
${dayHighlights}

Requirements:
- 600–800 words
- Markdown format with ## section headings
- First-person ("I", "we")
- Structure: hook opening → destination intro → day highlights → memorable moment → practical tips → inspiring close
- Vivid, specific language — use activity names from the highlights
- Conversational but polished tone

Return ONLY the blog post in Markdown. No preamble.`;
}

function buildSummaryPrompt(dest: string, dates: string, days: number, highlights: string[]): string {
    const acts = highlights.slice(0, 6).join(", ");
    return `Write a 3-sentence trip summary for ${dest} (${dates}, ${days} days).

Top activities: ${acts}.

Requirements:
- Sentence 1: destination, dates, and duration
- Sentence 2: standout activities and experiences
- Sentence 3: overall vibe / who would love this trip
- Friendly, shareable tone — suitable for texting friends or a travel note
- Max 120 words total

Return ONLY the summary. No extra text.`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({ success: false, error: { message: "Invalid JSON" } }), { status: 400 });
        }

        const parsed = ExportRequestSchema.safeParse(body);
        if (!parsed.success) {
            return new Response(
                JSON.stringify({ success: false, error: { message: "Invalid request", details: parsed.error.flatten() } }),
                { status: 422, headers: { "Content-Type": "application/json" } }
            );
        }

        const { format, destination, dates, days, budget, currency, highlights } = parsed.data;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:export:${format}`);
        } catch {
            return new Response(
                JSON.stringify({ success: false, error: { message: "Rate limit exceeded. Please wait before generating again." } }),
                { status: 429, headers: { "Content-Type": "application/json" } }
            );
        }

        const cleanDest   = sanitizeUserInput(destination);
        const cleanDates  = sanitizeUserInput(dates);
        const cleanHigh   = highlights.map(h => sanitizeUserInput(h));

        let prompt: string;
        switch (format) {
            case "instagram":
                prompt = buildInstagramPrompt(cleanDest, cleanDates, cleanHigh);
                break;
            case "blog":
                prompt = buildBlogPrompt(cleanDest, cleanDates, days, budget, currency, cleanHigh);
                break;
            case "summary":
                prompt = buildSummaryPrompt(cleanDest, cleanDates, days, cleanHigh);
                break;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response("AI service unavailable", { status: 503 });
        }

        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), EXPORT_TIMEOUT_MS);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const genAI  = new GoogleGenerativeAI(apiKey);
                    const model  = genAI.getGenerativeModel({ model: EXPORT_MODEL });
                    const result = await model.generateContentStream(prompt);

                    for await (const chunk of result.stream) {
                        if (abort.signal.aborted) break;
                        const text = chunk.text();
                        if (text) controller.enqueue(encoder.encode(text));
                    }
                } catch (err) {
                    logError("[Export] stream error", err);
                    controller.enqueue(encoder.encode("\n\n[Generation failed. Please try again.]"));
                } finally {
                    clearTimeout(timeout);
                    controller.close();
                }
            },
            cancel() {
                abort.abort();
                clearTimeout(timeout);
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type":  "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Export-Format": format,
            },
        });
    });
}
