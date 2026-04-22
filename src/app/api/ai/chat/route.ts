/**
 * app/api/ai/chat/route.ts
 *
 * POST /api/ai/chat
 *
 * Handles conversational AI companion requests with streaming responses.
 * Streams the assistant's text message token-by-token (text/plain),
 * then appends a \x00ACTIONS: JSON trailer for suggested actions.
 * Persists both turns to the DB and in-process memory after the stream ends.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { ChatRequestSchema, TravelDNASchema, type Itinerary, type TravelDNA } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError, logStructured } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/security/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { assembleContext } from "@/lib/ai/context";
import { updateMemory, buildMemoryContext } from "@/memory/memory";
import { sanitizeUserInput, validateLLMOutput } from "@/security/safety";
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts/index";

export const runtime = "nodejs";

// Extend base schema: tripId is required for persistence.
const ChatRouteSchema = ChatRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

// ─── Streaming helper ─────────────────────────────────────────────────────────

/**
 * Separator used between the conversational text response and the trailing
 * actions JSON. Both API and client must agree on this exact string.
 */
export const CHAT_ACTIONS_SEPARATOR = "---ACTIONS---";

/**
 * Build the streaming-friendly prompt for the chat companion.
 *
 * The LLM is asked to respond in two parts separated by ---ACTIONS---:
 *   1. A plain-text conversational answer (shown token-by-token to the user).
 *   2. A JSON array of 0–3 suggested action buttons (parsed silently after stream).
 *
 * Critically, no JSON wrapper is asked for the message part — the user must
 * never see raw JSON tokens streaming in the chat bubble.
 */
function buildStreamingChatPrompt(
    contextString: string,
    currentDay: number | undefined,
    userMessage: string,
): string {
    return `You are a travel copilot helping a user understand their trip.

You are given the full trip context including itinerary, budget, and activities.

Rules:
- Answer ONLY using the provided trip context below.
- Be concise, specific, and friendly. Respond in 2–4 sentences.
- Do NOT hallucinate any information not present in the context.
- If something is not covered by the context, say exactly: "I don't see that in your current plan."
- Focus on Day ${currentDay ?? 1} by default unless the user asks about a different day.
- Write PLAIN TEXT only — no markdown, no code blocks, no JSON anywhere in your answer.

---

${contextString}

---

User question: ${userMessage}

Once your plain-text answer is complete, output this separator on its own line (copy it exactly, no changes):
---ACTIONS---
Then immediately output a JSON array of 3–4 short contextual follow-up questions (max 10 words each). Use action "chat_response". Output [] if nothing relevant.
[{"label":"What is planned for Day 2?","action":"chat_response","payload":{}},{"label":"How much does this day cost?","action":"chat_response","payload":{}}]`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, ChatRouteSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { tripId, ...chatPayload } = validation.data;

        const trip = await prisma.trip.findUnique({
            where: { id: tripId },
            include: { itineraries: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
        if (!trip || trip.userId !== auth.user.sub) {
            return unauthorizedResponse("Trip not found");
        }

        const userMessages = chatPayload.messages.filter((m) => m.role === "user");
        const latestUserMessage = userMessages[userMessages.length - 1];
        const sessionId = `user:${auth.user.sub}:trip:${tripId}`;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:chat`);

            const preferences = await prisma.travelPreference.findUnique({ where: { userId: auth.user.sub } });
            const dnaRaw = preferences?.data;
            const dnaParsed = dnaRaw ? TravelDNASchema.safeParse(dnaRaw) : null;
            const dna: TravelDNA | undefined = dnaParsed?.success ? dnaParsed.data : undefined;
            const memCtx = await buildMemoryContext(sessionId);
            const latestItinerary = (trip.itineraries[0]?.rawJson as unknown as Itinerary)
                ?? chatPayload.currentItinerary;

            // Cap chat history at 20 messages to bound prompt size and DB load.
            const recentMessages = chatPayload.messages.slice(-20);

            const contextString = assembleContext({
                travelDNA: dna,
                itinerary: latestItinerary,
                trip: {
                    destination: trip.destination,
                    startDate: trip.startDate.toISOString().split("T")[0],
                    endDate: trip.endDate.toISOString().split("T")[0],
                    budget: { total: trip.budgetTotal, spent: 0, currency: trip.budgetCurrency },
                },
                chatHistory: recentMessages,
                additionalContext: {
                    currentDay: String(chatPayload.currentDay ?? 1),
                    ...(memCtx ? { sessionMemory: memCtx } : {}),
                },
            });

            // Sanitize user messages before sending to LLM.
            const safeMessages = recentMessages.map((m) =>
                m.role === "user" ? { ...m, content: sanitizeUserInput(m.content) } : m
            );
            const safeLatest = safeMessages.findLast?.((m) => m.role === "user");
            const safeUserContent = safeLatest?.content ?? "";

            const fullPrompt = buildStreamingChatPrompt(contextString, chatPayload.currentDay, safeUserContent);

            // ── Streaming via OpenAI SSE ─────────────────────────────────────
            const openaiKey = process.env.OPENAI_API_KEY;
            if (!openaiKey) {
                // Fall back to non-streaming path if key unavailable (e.g. Gemini-only env)
                return fallbackNonStreaming(
                    chatPayload, safeMessages, contextString, sessionId,
                    safeUserContent, latestUserMessage, tripId, auth.user.sub
                );
            }

            const openaiBody = {
                model: "gpt-4o-mini",
                messages: [{ role: "user" as const, content: fullPrompt }],
                temperature: 0.3,
                max_tokens: 512,
                stream: true,
            };

            const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${openaiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(openaiBody),
            });

            if (!openaiRes.ok || !openaiRes.body) {
                // Fall back to non-streaming on API errors
                return fallbackNonStreaming(
                    chatPayload, safeMessages, contextString, sessionId,
                    safeUserContent, latestUserMessage, tripId, auth.user.sub
                );
            }

            // ── Pipe OpenAI SSE → client, persist after stream ends ──────────
            const encoder = new TextEncoder();
            let accumulatedContent = "";

            const stream = new ReadableStream({
                async start(controller) {
                    const reader = openaiRes.body!.getReader();
                    const decoder = new TextDecoder();

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const chunk = decoder.decode(value, { stream: true });
                            const lines = chunk.split("\n");

                            for (const line of lines) {
                                if (!line.startsWith("data: ")) continue;
                                const data = line.slice(6).trim();
                                if (data === "[DONE]") continue;

                                try {
                                    const parsed = JSON.parse(data) as {
                                        choices?: Array<{ delta?: { content?: string } }>;
                                    };
                                    const token = parsed.choices?.[0]?.delta?.content;
                                    if (token) {
                                        const prevLen = accumulatedContent.length;
                                        accumulatedContent += token;

                                        // Only forward clean text — stop at separator so the
                                        // model's action JSON never reaches the client stream.
                                        const sepIdx = accumulatedContent.indexOf(CHAT_ACTIONS_SEPARATOR);
                                        if (sepIdx === -1) {
                                            controller.enqueue(encoder.encode(token));
                                        } else if (sepIdx >= prevLen) {
                                            // Separator starts within this token — forward only the clean prefix
                                            const clean = accumulatedContent.slice(prevLen, sepIdx);
                                            if (clean) controller.enqueue(encoder.encode(clean));
                                        }
                                        // else: separator already seen — don't forward
                                    }
                                } catch {
                                    // Skip malformed SSE chunks
                                }
                            }
                        }
                    } catch (err) {
                        logError("[API] Chat stream read error", err);
                    } finally {
                        reader.releaseLock();
                    }

                    // ── Split on separator: text | actions JSON ──────────────
                    try {
                        validateLLMOutput(accumulatedContent, "text");
                    } catch (err) {
                        logError("[API] Chat LLM output validation warning", err);
                    }

                    const sepIdx = accumulatedContent.indexOf(CHAT_ACTIONS_SEPARATOR);
                    const messageText = sepIdx !== -1
                        ? accumulatedContent.slice(0, sepIdx).trim()
                        : accumulatedContent.trim();
                    const actionsRaw = sepIdx !== -1
                        ? accumulatedContent.slice(sepIdx + CHAT_ACTIONS_SEPARATOR.length).trim()
                        : "[]";

                    let suggestedActions: unknown[] = [];
                    try {
                        const parsed = JSON.parse(actionsRaw);
                        if (Array.isArray(parsed)) suggestedActions = parsed;
                    } catch {
                        // Malformed actions — leave empty
                    }

                    // Send the final actions trailer so the client can render buttons.
                    // messageText is the authoritative stripped response — client uses it
                    // directly so it never shows raw separator/JSON from the LLM.
                    controller.enqueue(
                        encoder.encode(`\x00ACTIONS:${JSON.stringify({ suggestedActions, messageText })}`)
                    );

                    // Persist clean message text (not the separator + actions fragment)
                    persistChat(sessionId, safeUserContent, messageText || accumulatedContent, latestUserMessage, tripId).catch(
                        (e) => logError("[API] Chat persist error", e)
                    );

                    logStructured({ layer: "agent", step: "end", data: { tripId, chars: messageText.length } });

                    controller.close();
                },
            });

            return new Response(stream, {
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Content-Type-Options": "nosniff",
                    "Cache-Control": "no-cache",
                    "Transfer-Encoding": "chunked",
                },
            });
        } catch (err) {
            logError("[API] Chat companion error", err);
            return formatErrorResponse(err);
        }
    });
}

// ─── Persistence helper ────────────────────────────────────────────────────────

async function persistChat(
    sessionId: string,
    safeUserContent: string,
    assistantMessage: string,
    latestUserMessage: { role: string; content: string } | undefined,
    tripId: string,
) {
    await updateMemory(sessionId, "user", safeUserContent);
    await updateMemory(sessionId, "assistant", assistantMessage);

    await prisma.$transaction([
        ...(latestUserMessage
            ? [prisma.chatMessage.create({ data: { tripId, role: "user", content: safeUserContent } })]
            : []),
        prisma.chatMessage.create({ data: { tripId, role: "assistant", content: assistantMessage } }),
    ]);
}

// ─── Non-streaming fallback (Gemini env or OpenAI error) ─────────────────────

async function fallbackNonStreaming(
    chatPayload: Omit<z.infer<typeof ChatRouteSchema>, "tripId">,
    safeMessages: typeof chatPayload.messages,
    contextString: string,
    sessionId: string,
    safeUserContent: string,
    latestUserMessage: { role: string; content: string } | undefined,
    tripId: string,
    userId: string,
): Promise<Response> {
    const { chatCompanion } = await import("@/tools/chatTool");
    const result = await chatCompanion({ ...chatPayload, messages: safeMessages }, contextString);
    validateLLMOutput(result.message, "text");

    await persistChat(sessionId, safeUserContent, result.message, latestUserMessage, tripId);
    void userId; // suppress unused var

    return Response.json({ success: true, data: result }, { status: 200 });
}
