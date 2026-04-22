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

export const runtime = "nodejs";

// Extend base schema: tripId is required for persistence.
const ChatRouteSchema = ChatRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

// ─── Follow-up generator ───────────────────────────────────────────────────────

/**
 * Kept for any external callers that imported this constant.
 * The streaming path no longer relies on a separator inside LLM output.
 */
export const CHAT_ACTIONS_SEPARATOR = "---ACTIONS---";

type FollowUpAction = {
    label: string;
    action: "chat_response";
    payload: Record<string, never>;
};

/**
 * Generates 3 contextual follow-up suggestions without any LLM call.
 * Keyword-matches the user's question to avoid offering the same topic twice.
 */
function generateContextualFollowUps(
    userMessage: string,
    currentDay: number,
    destination: string,
    totalDays: number,
): FollowUpAction[] {
    const msg = userMessage.toLowerCase();
    const nextDay = currentDay < totalDays ? currentDay + 1 : 1;

    const candidates: FollowUpAction[] = [
        { label: `What's the plan for Day ${nextDay} in ${destination}?`, action: "chat_response", payload: {} },
        { label: `Which hotels am I staying at?`, action: "chat_response", payload: {} },
        { label: `What's my total budget for this trip?`, action: "chat_response", payload: {} },
        { label: `How much should I budget for food?`, action: "chat_response", payload: {} },
        { label: `Any safety tips for ${destination}?`, action: "chat_response", payload: {} },
        { label: `What's the best activity on this trip?`, action: "chat_response", payload: {} },
    ];

    const isAbout = (...kw: string[]) => kw.some((k) => msg.includes(k));

    return candidates.filter(({ label }) => {
        const l = label.toLowerCase();
        if (isAbout("hotel", "accommodation", "stay") && l.includes("hotel")) return false;
        if (isAbout("budget", "food", "cost", "money", "price", "spend") && (l.includes("budget") || l.includes("food"))) return false;
        if (isAbout("safety", "safe", "tip") && l.includes("safety")) return false;
        if (isAbout("activit", "best", "top", "highlight") && l.includes("activit")) return false;
        return true;
    }).slice(0, 3);
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the streaming chat prompt.
 *
 * Key design decisions:
 * - No separator or JSON output requested. The LLM outputs ONLY plain-text prose.
 *   Follow-ups are generated deterministically server-side after the stream ends.
 *   This eliminates all separator-leak bugs at their root.
 * - Explicit formatting rules prevent raw JSON field values (e.g. "0914") from
 *   leaking into the response.
 */
function buildStreamingChatPrompt(
    contextString: string,
    currentDay: number | undefined,
    userMessage: string,
): string {
    return `You are VoyageAI Copilot — a knowledgeable travel assistant for this specific trip.

ANSWER POLICY — two types of questions, two rules:

TYPE A — TRIP-SPECIFIC (activities, schedule, times, costs, hotels, budget):
  → Answer ONLY from TRIP CONTEXT below. Do not invent.
  → If hotels show "No hotel bookings listed in this itinerary", say:
    "Your itinerary doesn't include hotel bookings yet. You may want to add accommodation near [destination area]."
  → For other missing trip data, say: "That's not in your current itinerary."

TYPE B — DESTINATION KNOWLEDGE (safety tips, culture, weather, local customs, transport, food recommendations):
  → Use your general travel knowledge about the destination. Be specific and practical.
  → You do NOT need to restrict yourself to the itinerary for these questions.

Focus on Day ${currentDay ?? 1} unless the user asks about another day.

FORMATTING — always follow:
- Times: "9:14 AM" or "9:14 AM–11:14 AM" (colon + AM/PM required)
- Costs: "$40" — omit if $0
- Dates: "April 24" (no year)

Write 2–4 sentences of plain prose. No bullet points, no markdown, no JSON.

=== TRIP CONTEXT ===
${contextString}
=== END CONTEXT ===

User question: ${userMessage}

Your answer:`;
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
                                        accumulatedContent += token;
                                        // Forward every token directly — no separator suppression.
                                        // The LLM prompt no longer requests a separator, so the
                                        // answer is plain prose. Any stray artifact is stripped
                                        // server-side below before sending messageText to the client.
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

                    try {
                        validateLLMOutput(accumulatedContent, "text");
                    } catch (err) {
                        logError("[API] Chat LLM output validation warning", err);
                    }

                    // Strip any stray separator artifact the model might still emit
                    // (handles ---ACTIONS---, --- ACTIONS---, partial variants, trailing JSON).
                    const messageText = accumulatedContent
                        .replace(/\n?---\s*ACTIONS[\s\S]*/i, "")
                        .replace(/\n?\[\s*\{[\s\S]*$/, "")
                        .trim();

                    // Deterministic follow-ups — no LLM parsing, always correct.
                    const suggestedActions = generateContextualFollowUps(
                        safeUserContent,
                        chatPayload.currentDay ?? 1,
                        trip.destination,
                        latestItinerary?.totalDays ?? 7,
                    );

                    // Send the final actions trailer. messageText is the authoritative
                    // clean answer — client replaces the streamed display with this.
                    controller.enqueue(
                        encoder.encode(`\x00ACTIONS:${JSON.stringify({ suggestedActions, messageText })}`)
                    );

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
