/**
 * app/api/trips/[id]/share/route.ts
 *
 * POST   /api/trips/[id]/share — Generate (or return existing) share token.
 * DELETE /api/trips/[id]/share — Revoke share token (set to null).
 *
 * Auth required. Operates only on trips owned by the authenticated user.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    unauthorizedResponse,
    errorResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

// ─── POST — generate (idempotent) ────────────────────────────────────────────

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { id } = await params;

        try {
            const trip = await prisma.trip.findUnique({ where: { id } });
            if (!trip || trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            // Idempotent: return existing token or create a new one.
            const shareToken = trip.shareToken ?? crypto.randomUUID();

            if (!trip.shareToken) {
                await prisma.trip.update({ where: { id }, data: { shareToken } });
            }

            return successResponse({ shareToken });
        } catch (err) {
            logError("[Share] generate token error", err);
            return internalErrorResponse("Failed to generate share link");
        }
    });
}

// ─── DELETE — revoke ─────────────────────────────────────────────────────────

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        const { id } = await params;

        try {
            const trip = await prisma.trip.findUnique({ where: { id } });
            if (!trip || trip.userId !== auth.user.sub) return errorResponse("NOT_FOUND", "Trip not found", 404);

            await prisma.trip.update({ where: { id }, data: { shareToken: null } });

            return successResponse({ revoked: true });
        } catch (err) {
            logError("[Share] revoke token error", err);
            return internalErrorResponse("Failed to revoke share link");
        }
    });
}
