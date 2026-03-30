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
import { checkRateLimit, RateLimitError } from "@/security/rateLimiter";
import { getLLMClient, executeWithRetry, parseJSONResponse, AIServiceError } from "@/lib/ai/llm";
import { getDestinationImage } from "@/lib/services/image.service";
import { serializeTrip } from "@/lib/services/trips";
import { logInfo, logError } from "@/infrastructure/logger";
import { updateMemory, buildMemoryContext } from "@/memory/memory";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";
import { selectModelConfig } from "@/lib/ai/modelRouter";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANDING_RATE_LIMIT = 15;
const LANDING_RATE_WINDOW_SEC = 60;
const GENERATION_TIMEOUT_MS = 25_000;
const PREVIEW_TIMEOUT_MS = 30_000;

const CREATE_TRIP_PATTERN =
    /\b(create|plan|trip\s+to|book\s+a?\s*trip|make\s+a\s+trip|itinerary\s+(?:for|to)|\d+[- ]?days?\s+(?:trip|itinerary|visit|in\b)|plan\s+a\s+trip|weekend\s+in|(?:a\s+)?week\s+in)\b/i;

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

/**
 * Lightweight prompt for the unauthenticated itinerary preview.
 * Produces 2-day markdown — fast, specific, inspiring. No JSON schema.
 */
const PREVIEW_SYSTEM_PROMPT = `You are VoyageAI's travel preview generator.
Given a trip request, produce a concise 2-day itinerary preview in readable markdown.

Use this exact format:
## ✈️ [Destination] — Itinerary Preview
*[Dates if given, otherwise "Sample 2-Day Preview"]*

### Day 1: [Theme]
- **[Morning/Afternoon/Evening]** — [Specific activity or place] · ~[cost range if relevant]
  > [One punchy tip]
- **[Time slot]** — [Activity]

### Day 2: [Theme]
- **[Time slot]** — [Activity] · ~[cost]
- **[Time slot]** — [Activity]

**AI Insight:** [One compelling reason to visit or a unique local tip]

Rules:
- Name real places, neighbourhoods, foods — be specific and inspiring
- Keep total response under 350 words
- No precise street addresses; cost ranges are fine
- Stay strictly on-topic (travel only)`;

const TRAVEL_QA_SYSTEM = `You are VoyageAI's intelligent travel assistant on a public landing page.
Answer travel questions concisely, warmly, and helpfully.
Focus on: destination insights, itinerary ideas, travel tips, safety, budget, and logistics.
Do NOT discuss anything unrelated to travel or trip planning. Politely redirect non-travel questions.
Do NOT provide personalized legal, medical, or visa advice — always recommend consulting official government sources and current travel advisories.
Do NOT claim to have real-time prices, availability, or current conditions — note that your information may be outdated and users should verify with official sources before booking.
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
                void updateMemory(sessionId, "user", prompt);
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
                void updateMemory(sessionId, "user", prompt);
                void updateMemory(
                    sessionId,
                    "assistant",
                    `Trip created for ${extracted.destination} (${extracted.startDate} to ${extracted.endDate}).`
                );

                return NextResponse.json(
                    { success: true, data: { action: "redirect", tripId: trip.id, style: extracted.vibe ?? null, trip: serializeTrip(trip) } },
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
        const memCtx = await buildMemoryContext(sessionId);

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
                        if (i % 25 === 0) await sleep(0);
                    }

                    // Persist both turns only on successful, non-aborted generation.
                    // Validate output before persisting to guard against corrupted or injected content.
                    if (!abort.signal.aborted && accumulated) {
                        try {
                            validateLLMOutput(accumulated, "text");
                            void updateMemory(sessionId, "user", prompt);
                            void updateMemory(sessionId, "assistant", accumulated);
                        } catch (validationErr) {
                            logError("[/api/ai/landing] Q&A output validation failed, skipping memory persist", validationErr);
                        }
                    }

                    // Emit post-answer action sentinel so the client can render contextual buttons.
                    if (!abort.signal.aborted) {
                        controller.enqueue(encoder.encode("\x00ACTIONS:create_trip"));
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
 * Build and return a streaming Response that:
 *  1. Emits an immediate "generating" indicator
 *  2. Calls the LLM once with a lightweight markdown preview prompt (single call, ~10s)
 *  3. Streams the response progressively
 *  4. Appends the CTA + AUTH_REQUIRED_CREATE sentinel
 *
 * Deliberately avoids generateItinerary() (8 192-token full pipeline) to keep
 * the public landing preview fast. One targeted call is enough for a teaser.
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
                emit("Generating your itinerary preview…\n\n");

                const client = getLLMClient();
                const response = await executeWithRetry(
                    client,
                    [
                        { role: "system", content: PREVIEW_SYSTEM_PROMPT },
                        { role: "user", content: prompt },
                    ],
                    { ...selectModelConfig({ endpoint: "landing-preview" }), retries: 1 }
                );

                if (abort.signal.aborted) { controller.close(); return; }

                // Stream in small chunks so the client renders incrementally.
                const CHUNK_SIZE = 40;
                for (let i = 0; i < response.content.length; i += CHUNK_SIZE) {
                    if (abort.signal.aborted) break;
                    emit(response.content.slice(i, i + CHUNK_SIZE));
                    await sleep(0);
                }

                if (abort.signal.aborted) { controller.close(); return; }

                void updateMemory(
                    sessionId,
                    "assistant",
                    `Itinerary preview shown for: ${prompt.slice(0, 100)}`
                );

                emit("\n\n✨ Sign up to unlock the full interactive itinerary, map sync, and budget tracking.");
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
