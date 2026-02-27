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
import { ChatRequestSchema } from "@/lib/ai/schemas";
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

        try {
            await checkRateLimit(`ai:${auth.user.sub}:chat`);

            const preferences = await prisma.travelPreference.findUnique({ where: { userId: auth.user.sub } });
            const dna = preferences?.data as any;

            // Assemble rich context bundle
            const latestItinerary = trip.itineraries[0]?.rawJson as any;
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
                chatHistory: chatPayload.messages as any,
                additionalContext: {
                    currentDay: String(chatPayload.currentDay ?? 1)
                }
            });

            const result = await chatCompanion(chatPayload, contextString);

            await prisma.$transaction([
                ...(latestUserMessage
                    ? [
                        prisma.chatMessage.create({
                            data: {
                                tripId,
                                role: "user",
                                content: latestUserMessage.content,
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
