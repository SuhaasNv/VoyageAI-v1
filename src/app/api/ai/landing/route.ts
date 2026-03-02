/**
 * POST /api/ai/landing
 *
 * Public-accessible AI endpoint for the landing page prompt bar.
 *
 * Intent routing:
 *  CREATE_TRIP  (prompt contains "create"|"plan"|"trip to")
 *    – Unauthenticated → stream capped itinerary preview (2 days / 8 activities)
 *                        ends with \x00ACTION:AUTH_REQUIRED_CREATE sentinel
 *    – Authenticated   → creates trip via LLM → { action:"redirect", tripId } (JSON, 201)
 *
 *  QUESTION (everything else)
 *    – Public → streaming text/plain response (chunked)
 *
 * Rate limit: separate "landing:" bucket — 15 req / 60 s per user/IP.
 * AbortController: generation cancelled on client disconnect or after 25 s (Q) / 50 s (preview).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContext, getClientIp } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit, RateLimitError } from "@/lib/rateLimiter";
import { getLLMClient, executeWithRetry, parseJSONResponse, AIServiceError } from "@/lib/ai/llm";
import { getDestinationImage } from "@/lib/services/image.service";
import { serializeTrip } from "@/lib/services/trips";
import { logInfo, logError } from "@/lib/logger";
import { generateItinerary } from "@/services/ai/itinerary.service";
import type { Itinerary, ItineraryDay } from "@/lib/ai/schemas";
import { updateMemory, buildMemoryContext } from "@/lib/ai/memory";
import { sanitizeUserInput, validateLLMOutput } from "@/lib/ai/safety";
import { selectModelConfig } from "@/lib/ai/modelRouter";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANDING_RATE_LIMIT = 15;
const LANDING_RATE_WINDOW_SEC = 60;
const GENERATION_TIMEOUT_MS = 25_000;
const PREVIEW_TIMEOUT_MS = 50_000;

/** Max days shown in an unauthenticated preview. */
const PREVIEW_MAX_DAYS = 2;
/** Max activities per day in a preview. */
const PREVIEW_MAX_ACTS_PER_DAY = 4;
/** Hard cap on total activities across all preview days. */
const PREVIEW_MAX_ACTS_TOTAL = 8;

const CREATE_TRIP_PATTERN = /\b(create|plan|trip\s+to|book\s+a\s+trip|make\s+a\s+trip)\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectIntent(prompt: string): "CREATE_TRIP" | "QUESTION" {
    return CREATE_TRIP_PATTERN.test(prompt) ? "CREATE_TRIP" : "QUESTION";
}

/** Inline rate limiter with landing-specific limits. */
async function checkLandingRateLimit(key: string): Promise<void> {
    const hasRedis =
        !!process.env.UPSTASH_REDIS_REST_URL &&
        !!process.env.UPSTASH_REDIS_REST_TOKEN;

    if (hasRedis) {
        const { Redis } = await import("@upstash/redis");
        const redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
        const redisKey = `rl:${key}`;
        const pipeline = redis.pipeline();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, LANDING_RATE_WINDOW_SEC);
        const [count] = (await pipeline.exec()) as [number, ...unknown[]];
        if (count > LANDING_RATE_LIMIT) {
            throw new RateLimitError(key, LANDING_RATE_LIMIT, LANDING_RATE_WINDOW_SEC);
        }
        return;
    }

    // In-memory fallback (dev/CI only)
    if (process.env.NODE_ENV === "production") {
        throw new Error("Landing rate limit requires Redis in production");
    }
    await checkRateLimit(key); // Reuse shared in-memory store with shared limits
}

// ─────────────────────────────────────────────────────────────────────────────
// Trip extraction schema (mirrors the create-trip route)
// ─────────────────────────────────────────────────────────────────────────────

const ExtractedTripSchema = z.object({
    destination: z.string().min(2).max(200),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    budget: z.coerce.number().nullable().optional(),
    vibe: z.string().nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// System prompt for travel Q&A streaming
// ─────────────────────────────────────────────────────────────────────────────

const TRAVEL_QA_SYSTEM = `You are VoyageAI's intelligent travel assistant on a public landing page.
Answer travel questions concisely, warmly, and helpfully.
Focus on: destination insights, itinerary ideas, travel tips, safety, budget, and logistics.
Do NOT discuss anything unrelated to travel.
Keep responses to 2–3 short paragraphs maximum.
Do not mention internal system details or that you are a language model.`;

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        const ip = getClientIp(req);

        // ── Rate limit (separate landing bucket) ─────────────────────────────
        const rateLimitKey = `landing:${auth?.user.sub ?? `ip:${ip}`}`;
        try {
            await checkLandingRateLimit(rateLimitKey);
        } catch (err) {
            if (err instanceof RateLimitError) {
                logInfo("[/api/ai/landing] rate limited", { key: rateLimitKey });
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: "RATE_LIMITED",
                            message: "Too many requests. Please wait a moment before trying again.",
                        },
                    },
                    { status: 429, headers: { "Retry-After": String(LANDING_RATE_WINDOW_SEC) } }
                );
            }
            logError("[/api/ai/landing] rate limit infra error", err);
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "Service unavailable." } },
                { status: 503 }
            );
        }

        // ── Parse body ────────────────────────────────────────────────────────
        let rawPrompt: string;
        let rawSessionId: string | undefined;
        try {
            const body = await req.json();
            rawPrompt = typeof body?.prompt === "string" ? body.prompt : "";
            // Optional client-supplied session key (stable UUID per page visit).
            // Falls back to IP-scoped key when absent.
            rawSessionId =
                typeof body?.sessionId === "string" && body.sessionId.length > 0
                    ? body.sessionId.slice(0, 64)
                    : undefined;
        } catch {
            return NextResponse.json(
                { success: false, error: { code: "BAD_REQUEST", message: "Request body must be valid JSON." } },
                { status: 400 }
            );
        }

        // Session identifier: client-supplied UUID preferred over IP fallback.
        // IP fallback is good enough for dev/demo; in production the client always sends sessionId.
        const sessionId = rawSessionId ?? `ip:${ip}`;

        // ── Sanitize ──────────────────────────────────────────────────────────
        const prompt = sanitizeUserInput(rawPrompt);
        if (!prompt) {
            return NextResponse.json(
                { success: false, error: { code: "INVALID_INPUT", message: "Prompt contains disallowed content." } },
                { status: 400 }
            );
        }

        const intent = detectIntent(prompt);
        logInfo("[/api/ai/landing] request", {
            intent,
            authenticated: !!auth,
            ip: ip.slice(0, 8) + "***",
        });

        // ── Intent: CREATE_TRIP ───────────────────────────────────────────────
        if (intent === "CREATE_TRIP") {
            if (!auth) {
                // Unauthenticated: stream a capped itinerary preview.
                // Record the user turn now; the preview stream saves the assistant turn.
                updateMemory(sessionId, "user", prompt);
                return buildPreviewStream(req, prompt, sessionId);
            }

            // Authenticated — extract trip params and create
            try {
                await checkRateLimit(`ai:${auth.user.sub}:landing-create`);

                const extractionPrompt = `Extract structured travel data from this text. Return strict JSON only.
Assume the current year is ${new Date().getFullYear()} if not specified.
Schema:
{
  "destination": "string (city or country)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "budget": "number or null",
  "vibe": "relaxed | creative | exciting | luxury | budget | null"
}
Text: ${prompt}`;

                const client = getLLMClient();
                const llmResponse = await executeWithRetry(
                    client,
                    [{ role: "user", content: extractionPrompt }],
                    { ...selectModelConfig({ endpoint: "landing", intent: "CREATE_TRIP" }), responseFormat: "json" as const, retries: 2 }
                );

                validateLLMOutput(llmResponse.content, "json");
                const extracted = ExtractedTripSchema.parse(
                    parseJSONResponse<unknown>(llmResponse.content)
                );

                let imageUrl: string | null = null;
                try {
                    imageUrl = await getDestinationImage(extracted.destination);
                } catch {
                    // non-fatal — trip created without image
                }

                const trip = await prisma.trip.create({
                    data: {
                        userId: auth.user.sub,
                        destination: extracted.destination,
                        startDate: new Date(extracted.startDate),
                        endDate: new Date(extracted.endDate),
                        budgetTotal: extracted.budget ?? 0,
                        style: extracted.vibe ?? undefined,
                        imageUrl: imageUrl ?? undefined,
                    },
                });

                // Record the completed exchange so follow-up questions carry context.
                updateMemory(sessionId, "user", prompt);
                updateMemory(
                    sessionId,
                    "assistant",
                    `Trip created for ${extracted.destination} (${extracted.startDate} to ${extracted.endDate}).`
                );

                return NextResponse.json(
                    { success: true, data: { action: "redirect", tripId: trip.id, trip: serializeTrip(trip) } },
                    { status: 201 }
                );
            } catch (err) {
                logError("[/api/ai/landing] trip creation error", err);
                if (err instanceof RateLimitError) {
                    return NextResponse.json(
                        { success: false, error: { code: "RATE_LIMITED", message: "Too many trip creations. Try again shortly." } },
                        { status: 429 }
                    );
                }
                if (err instanceof AIServiceError) {
                    return NextResponse.json(
                        { success: false, error: { code: err.code, message: "Unable to process trip request. Please try again." } },
                        { status: 503 }
                    );
                }
                return NextResponse.json(
                    { success: false, error: { code: "INTERNAL_ERROR", message: "An error occurred creating your trip." } },
                    { status: 500 }
                );
            }
        }

        // ── Intent: QUESTION → streaming text response ────────────────────────
        // Capture prior context BEFORE recording the new user turn so the
        // injected block only contains previous exchanges, not the current one.
        const memCtx = buildMemoryContext(sessionId);

        const encoder = new TextEncoder();
        const abort = new AbortController();
        const generationTimeout = setTimeout(() => abort.abort(), GENERATION_TIMEOUT_MS);

        // Propagate client disconnect to abort controller
        req.signal.addEventListener("abort", () => {
            abort.abort();
            clearTimeout(generationTimeout);
        });

        // Accumulate the full response so we can save it to memory after streaming.
        let accumulated = "";

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const apiKey = process.env.GEMINI_API_KEY;
                    const provider = process.env.LLM_PROVIDER ?? "mock";

                    if (provider === "mock") {
                        // ── Mock streaming (dev/CI) ───────────────────────────
                        const mockText = buildMockQAResponse(prompt);
                        for (let i = 0; i < mockText.length; i++) {
                            if (abort.signal.aborted) break;
                            accumulated += mockText[i];
                            controller.enqueue(encoder.encode(mockText[i]));
                            await sleep(12);
                        }
                    } else {
                        // ── Groq / other non-streaming provider ───────────────
                        const client = getLLMClient();
                        const qaCfg = selectModelConfig({ endpoint: "landing", intent: "QUESTION" });
                        const response = await executeWithRetry(
                            client,
                            [
                                {
                                    role: "system",
                                    content:
                                        TRAVEL_QA_SYSTEM + (memCtx ? `\n\n${memCtx}` : ""),
                                },
                                { role: "user", content: prompt },
                            ],
                            { ...qaCfg }
                        );
                        accumulated = response.content;
                        for (let i = 0; i < response.content.length; i++) {
                            if (abort.signal.aborted) break;
                            controller.enqueue(encoder.encode(response.content[i]));
                            // Flush every 25 chars to keep streaming feel
                            if (i % 25 === 0) await sleep(0);
                        }
                    }

                    // Persist both turns only on successful, non-aborted generation.
                    if (!abort.signal.aborted && accumulated) {
                        updateMemory(sessionId, "user", prompt);
                        updateMemory(sessionId, "assistant", accumulated);
                    }

                    controller.close();
                } catch (err) {
                    logError("[/api/ai/landing] stream error", err);
                    const safe =
                        err instanceof AIServiceError
                            ? err.message
                            : "AI service temporarily unavailable. Please try again.";
                    // Emit error signal as a special prefix so the client can detect it
                    controller.enqueue(encoder.encode(`\x00ERROR:${safe}`));
                    controller.close();
                } finally {
                    clearTimeout(generationTimeout);
                }
            },
            cancel() {
                abort.abort();
                clearTimeout(generationTimeout);
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "X-Content-Type-Options": "nosniff",
                "Transfer-Encoding": "chunked",
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Unauthenticated CREATE_TRIP — itinerary preview stream
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp the endDate so the itinerary generation covers at most `maxDays`.
 * Keeps token usage low — we only need 2-3 days for the preview.
 */
function clampEndDate(startDate: string, endDate: string, maxDays: number): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const cap = new Date(start);
    cap.setDate(start.getDate() + maxDays - 1);
    return (end <= cap ? end : cap).toISOString().slice(0, 10);
}

/**
 * Cap a full itinerary to PREVIEW_MAX_DAYS days and PREVIEW_MAX_ACTS_TOTAL
 * activities without altering the schema shape of the retained objects.
 */
function capItineraryPreview(itinerary: Itinerary): Itinerary {
    let totalActivities = 0;
    const cappedDays: ItineraryDay[] = [];

    for (const day of itinerary.days.slice(0, PREVIEW_MAX_DAYS)) {
        const remaining = PREVIEW_MAX_ACTS_TOTAL - totalActivities;
        if (remaining <= 0) break;

        const slicedActivities = day.activities.slice(
            0,
            Math.min(PREVIEW_MAX_ACTS_PER_DAY, remaining)
        );
        totalActivities += slicedActivities.length;
        cappedDays.push({ ...day, activities: slicedActivities });
    }

    return { ...itinerary, days: cappedDays };
}

/**
 * Format a capped itinerary as readable markdown.
 * Keeps formatting lightweight — no raw JSON exposed to the client.
 */
function formatPreviewMarkdown(itinerary: Itinerary): string {
    const lines: string[] = [
        `## ✈️ ${itinerary.destination} — Itinerary Preview`,
        `*${itinerary.startDate} → ${itinerary.endDate}*`,
        "",
    ];

    for (const day of itinerary.days) {
        lines.push(`### Day ${day.day}: ${day.theme}`);
        for (const act of day.activities) {
            const cost =
                act.estimatedCost.amount > 0
                    ? ` · ~${act.estimatedCost.currency} ${act.estimatedCost.amount}`
                    : "";
            lines.push(`- **${act.startTime}** — ${act.name}${cost}`);
            if (act.notes) lines.push(`  > ${act.notes}`);
        }
        if (day.tips?.length) {
            lines.push("", `**Tip:** ${day.tips[0]}`);
        }
        lines.push("");
    }

    if (itinerary.aiInsights?.length) {
        lines.push(`**AI Insight:** ${itinerary.aiInsights[0]}`, "");
    }

    return lines.join("\n");
}

/**
 * Build and return a streaming Response that:
 *  1. Shows an immediate "generating" indicator
 *  2. Extracts trip params from the prompt (1 LLM call)
 *  3. Calls generateItinerary() (reuses the existing service — no duplicate prompt)
 *  4. Caps to PREVIEW_MAX_DAYS / PREVIEW_MAX_ACTS_TOTAL
 *  5. Streams formatted markdown progressively
 *  6. Appends CTA text
 *  7. Ends with \x00ACTION:AUTH_REQUIRED_CREATE sentinel
 */
async function buildPreviewStream(req: NextRequest, prompt: string, sessionId: string): Promise<Response> {
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), PREVIEW_TIMEOUT_MS);

    req.signal.addEventListener("abort", () => {
        abort.abort();
        clearTimeout(timeout);
    });

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (text: string) => controller.enqueue(encoder.encode(text));

            try {
                // Immediate feedback so the client doesn't stall
                emit("_Generating your itinerary preview…_\n\n");

                // ── Step 1: extract structured trip params from free-form prompt ──
                const extractionPrompt = `Extract structured travel data from this text. Return strict JSON only.
Assume the current year is ${new Date().getFullYear()} if not specified.
Schema:
{
  "destination": "string (city or country)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "budget": "number or null",
  "vibe": "relaxed | creative | exciting | luxury | budget | null"
}
Text: ${prompt}`;

                const client = getLLMClient();
                const extractionResp = await executeWithRetry(
                    client,
                    [{ role: "user", content: extractionPrompt }],
                    { ...selectModelConfig({ endpoint: "landing", intent: "CREATE_TRIP" }), responseFormat: "json" as const, retries: 2 }
                );

                if (abort.signal.aborted) { controller.close(); return; }

                validateLLMOutput(extractionResp.content, "json");
                const extracted = ExtractedTripSchema.parse(
                    parseJSONResponse<unknown>(extractionResp.content)
                );

                // Clamp to PREVIEW_MAX_DAYS so itinerary generation stays fast
                const previewEndDate = clampEndDate(
                    extracted.startDate,
                    extracted.endDate,
                    PREVIEW_MAX_DAYS + 1  // one extra day buffer for the service
                );

                // ── Step 2: generate itinerary via existing service (no duplicate logic) ──
                const itinerary = await generateItinerary({
                    destination: extracted.destination,
                    startDate: extracted.startDate,
                    endDate: previewEndDate,
                    budget: {
                        total: extracted.budget ?? 1500,
                        currency: "USD",
                        flexibility: "flexible",
                    },
                    groupSize: 1,
                    mustSeeAttractions: [],
                    avoidAttractions: [],
                });

                if (abort.signal.aborted) { controller.close(); return; }

                // ── Step 3: cap the preview ───────────────────────────────────
                const capped = capItineraryPreview(itinerary);
                const markdown = formatPreviewMarkdown(capped);

                // ── Step 4: stream markdown progressively ─────────────────────
                // Write in small slices so the client renders incrementally
                const CHUNK_SIZE = 40;
                for (let i = 0; i < markdown.length; i += CHUNK_SIZE) {
                    if (abort.signal.aborted) break;
                    emit(markdown.slice(i, i + CHUNK_SIZE));
                    await sleep(0); // yield to allow flush
                }

                if (abort.signal.aborted) { controller.close(); return; }

                // Save a compact assistant turn so follow-up questions know
                // which destination was previewed.
                updateMemory(
                    sessionId,
                    "assistant",
                    `Itinerary preview: ${extracted.destination}, ${extracted.startDate} to ${previewEndDate}. ${capped.days.length} day(s) shown.`
                );

                // ── Step 5: CTA text + action sentinel ────────────────────────
                emit(
                    "\n\n✨ Sign up to unlock the full interactive itinerary, map sync, and budget tracking."
                );
                emit("\x00ACTION:AUTH_REQUIRED_CREATE");

                controller.close();
            } catch (err) {
                logError("[/api/ai/landing] preview error", err);
                const safe =
                    err instanceof AIServiceError
                        ? err.message
                        : "Unable to generate preview. Please try again.";
                emit(`\x00ERROR:${safe}`);
                controller.close();
            } finally {
                clearTimeout(timeout);
            }
        },
        cancel() {
            abort.abort();
            clearTimeout(timeout);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Content-Type-Options": "nosniff",
            "Transfer-Encoding": "chunked",
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMockQAResponse(prompt: string): string {
    const dest = extractFirstDestinationWord(prompt);
    return (
        `Great question! ${dest ? `${dest} is a wonderful choice. ` : ""}VoyageAI specialises ` +
        `in crafting personalised travel itineraries powered by cutting-edge AI. ` +
        `Whether you're looking for hidden gems, budget tips, or luxury escapes, ` +
        `we have you covered.\n\n` +
        `Our AI analyses real-time data including weather patterns, local events, ` +
        `crowd levels, and traveller reviews to build day-by-day plans tailored to your ` +
        `travel style and budget. Each itinerary includes activity timing, cost estimates, ` +
        `transport logistics, and smart packing lists.\n\n` +
        `To create a complete personalised trip plan, sign up for free and let our AI ` +
        `design your perfect journey — from arrival to departure.`
    );
}

function extractFirstDestinationWord(prompt: string): string {
    const match = prompt.match(/\b(?:to|in|for|visit|visiting|explore|exploring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    return match?.[1] ?? "";
}
