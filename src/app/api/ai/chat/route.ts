/**
 * app/api/ai/chat/route.ts
 *
 * POST /api/ai/chat
 *
 * Handles conversational AI companion requests.
 * Persists the user message and assistant response in ChatMessage table
 * when a tripId is provided. Request body is validated before the service
 * layer is invoked; invalid inputs return 422 with field-level error details.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { chatCompanion } from "@/services/ai/chat.service";
import { ChatRequestSchema, type Itinerary, type TravelDNA } from "@/lib/ai/schemas";
import { validateBody, getAuthContext } from "@/lib/api/request";
import { formatErrorResponse } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { checkRateLimit } from "@/lib/rateLimiter";
import { unauthorizedResponse } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { getTravelPreferenceContext } from "@/lib/ai/contextStore";
import { assembleContext } from "@/lib/ai/context";
import { buildTravelDNARules } from "@/lib/ai/travelDNARules";
import { updateMemory, buildMemoryContext } from "@/lib/ai/memory";
import { sanitizeUserInput, validateLLMOutput } from "@/lib/ai/safety";

// Extend base schema: tripId is required for persistence.
const ChatRouteSchema = ChatRequestSchema.extend({
    tripId: z.string().cuid("tripId must be a valid CUID"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
    return runWithRequestContext(req, async () => {
        const validation = await validateBody(req, ChatRouteSchema);
        if (!validation.ok) return validation.response;

        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { tripId, ...chatPayload } = validation.data;

        // Verify trip ownership and get full context.
        const trip = await prisma.trip.findUnique({
            where: { id: tripId },
            include: { itineraries: { orderBy: { createdAt: "desc" }, take: 1 } }
        });
        if (!trip || trip.userId !== auth.user.sub) {
            return unauthorizedResponse("Trip not found");
        }

        const userMessages = chatPayload.messages.filter((m) => m.role === "user");
        const latestUserMessage = userMessages[userMessages.length - 1];

        // Session key is per-user per-trip, stable across multiple requests.
        const sessionId = `user:${auth.user.sub}:trip:${tripId}`;

        try {
            await checkRateLimit(`ai:${auth.user.sub}:chat`);

            const preferences = await prisma.travelPreference.findUnique({ where: { userId: auth.user.sub } });
            const dna = preferences?.data as unknown as TravelDNA;

            // Fetch prior session context BEFORE recording the new user turn so
            // the injected block only contains previous exchanges.
            const memCtx = buildMemoryContext(sessionId);

            // Assemble rich context bundle
            const latestItinerary = trip.itineraries[0]?.rawJson as unknown as Itinerary;
            const contextString = assembleContext({
                travelDNA: dna,
                itinerary: latestItinerary,
                trip: {
                    destination: trip.destination,
                    startDate: trip.startDate.toISOString().split('T')[0],
                    endDate: trip.endDate.toISOString().split('T')[0],
                    budget: {
                        total: trip.budgetTotal,
                        spent: 0,
                        currency: trip.budgetCurrency,
                    }
                },
                chatHistory: chatPayload.messages,
                additionalContext: {
                    currentDay: String(chatPayload.currentDay ?? 1),
                    // Inject short-term memory as a supplementary context block.
                    // This captures session state that may not be in the DB history yet
                    // (e.g. the very first message, or context from a prior endpoint).
                    ...(memCtx ? { sessionMemory: memCtx } : {}),
                }
            });

            // Sanitize ALL user messages to prevent injection via earlier history turns.
            const safeMessages = chatPayload.messages.map((m) =>
                m.role === "user" ? { ...m, content: sanitizeUserInput(m.content) } : m
            );
            const safeLatest = safeMessages.findLast?.((m) => m.role === "user");
            const safeUserContent = safeLatest?.content ?? "";

            const result = await chatCompanion({ ...chatPayload, messages: safeMessages }, contextString);

            // Validate the LLM text response before persisting.
            validateLLMOutput(result.message, "text");

            // Persist both turns to memory after a successful response.
            if (latestUserMessage) {
                updateMemory(sessionId, "user", safeUserContent);
            }
            updateMemory(sessionId, "assistant", result.message);

            await prisma.$transaction([
                ...(latestUserMessage
                    ? [
                        prisma.chatMessage.create({
                            data: {
                                tripId,
                                role: "user",
                                content: safeUserContent,
                            },
                        }),
                    ]
                    : []),
                prisma.chatMessage.create({
                    data: {
                        tripId,
                        role: "assistant",
                        content: result.message,
                    },
                }),
            ]);

            return NextResponse.json({ success: true, data: result }, { status: 200 });
        } catch (err) {
            logError("[API] Chat companion error", err);
            return formatErrorResponse(err);
        }
    });
}
