/**
 * app/api/trips/[id]/chat/route.ts
 *
 * GET /api/trips/[id]/chat
 *
 * Returns the stored ChatMessage history for a trip, scoped to the
 * authenticated user. Messages are returned oldest-first so the UI can
 * render them in conversation order.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";

export interface ChatMessageDTO {
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const { id: tripId } = await params;

        const trip = await prisma.trip.findUnique({ where: { id: tripId } });
        if (!trip) return errorResponse("NOT_FOUND", "Trip not found", 404);
        if (trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

        try {
            const messages = await prisma.chatMessage.findMany({
                where: { tripId },
                orderBy: { createdAt: "asc" },
            });

            return successResponse<ChatMessageDTO[]>(
                messages.map((m) => ({
                    id: m.id,
                    role: m.role as "user" | "assistant",
                    content: m.content,
                    createdAt: m.createdAt.toISOString(),
                }))
            );
        } catch (err) {
            logError(`[GET /api/trips/${tripId}/chat] DB error`, err);
            return internalErrorResponse();
        }
    });
}
