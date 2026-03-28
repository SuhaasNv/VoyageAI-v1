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

import { ChatRequestSchema, type Itinerary, type TravelDNA } from "@/lib/ai/schemas";
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
    const system = SYSTEM_PROMPTS.CHAT_COMPANION
        ?? "You are VoyageAI's AI travel companion. Provide concise, friendly, and actionable answers.";

    return `${system}

---

${contextString}

---

## Answering Rules
- Focus on Day ${currentDay ?? 1} unless the user specifies otherwise.
- Respond with 2–5 sentences of clear, helpful travel advice.
- Write PLAIN TEXT only. No JSON wrappers, no markdown code blocks, no schema syntax.
- After your text response, on a new line write exactly: ${CHAT_ACTIONS_SEPARATOR}
- Then write a JSON array of 0–3 suggested action buttons, or [] if none apply:
  [{"label":"Button text", "action":"apply_itinerary_update|map_fly_to|reoptimize|chat_response", "payload":{}}]

## User's Message
${userMessage}`;
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
            const dna = preferences?.data as unknown as TravelDNA;
            const memCtx = await buildMemoryContext(sessionId);
            const latestItinerary = trip.itineraries[0]?.rawJson as unknown as Itinerary;

            const contextString = assembleContext({
                travelDNA: dna,
                itinerary: latestItinerary,
                trip: {
                    destination: trip.destination,
                    startDate: trip.startDate.toISOString().split("T")[0],
                    endDate: trip.endDate.toISOString().split("T")[0],
                    budget: { total: trip.budgetTotal, spent: 0, currency: trip.budgetCurrency },
                },
                chatHistory: chatPayload.messages,
                additionalContext: {
                    currentDay: String(chatPayload.currentDay ?? 1),
                    ...(memCtx ? { sessionMemory: memCtx } : {}),
                },
            });

            // Sanitize user messages before sending to LLM.
            const safeMessages = chatPayload.messages.map((m) =>
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
                model: "gpt-4.1-mini",
                messages: [{ role: "user" as const, content: fullPrompt }],
                temperature: 0.7,
                max_tokens: 1024,
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
                                        accumulatedContent += token;
                                        controller.enqueue(encoder.encode(token));
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

                    // Send the final actions trailer so the client can render buttons
                    controller.enqueue(
                        encoder.encode(`\x00ACTIONS:${JSON.stringify({ suggestedActions })}`)
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
