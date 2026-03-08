/**
 * /api/favorites
 *
 * POST   { destination: string } — toggle favorite (save if absent, remove if present)
 * DELETE { destination: string } — explicit remove
 *
 * Auth required for both methods.
 * Enforces unique(userId, destination) via upsert / deleteMany.
 * Returns optimistic { favorited: boolean } state.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logInfo, logError } from "@/infrastructure/logger";

export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const FavoriteBodySchema = z.object({
    destination: z
        .string()
        .min(1, "destination is required")
        .max(200, "destination must be 200 characters or fewer")
        .transform((s) => s.trim()),
});

// ─────────────────────────────────────────────────────────────────────────────
// POST — toggle favorite
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
                { status: 401 }
            );
        }

        let body: { destination: string };
        try {
            body = FavoriteBodySchema.parse(await req.json());
        } catch {
            return NextResponse.json(
                { success: false, error: { code: "BAD_REQUEST", message: "destination must be a non-empty string (max 200 chars)." } },
                { status: 400 }
            );
        }

        const { destination } = body;
        const userId = auth.user.sub;

        try {
            const existing = await prisma.favoriteDestination.findFirst({
                where: { userId, destination },
                select: { id: true },
            });

            if (existing) {
                // Already favorited — remove it (toggle off)
                await prisma.favoriteDestination.delete({
                    where: { id: existing.id },
                });
                logInfo("[POST /api/favorites] removed", { userId, destination });
                return NextResponse.json(
                    { success: true, data: { favorited: false, destination } },
                    { status: 200 }
                );
            }

            // Not yet favorited — create it
            await prisma.favoriteDestination.create({
                data: { userId, destination },
            });
            logInfo("[POST /api/favorites] saved", { userId, destination });
            return NextResponse.json(
                { success: true, data: { favorited: true, destination } },
                { status: 201 }
            );
        } catch (err) {
            logError("[POST /api/favorites] db error", err);
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "Unable to update favorites." } },
                { status: 500 }
            );
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — explicit remove
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
                { status: 401 }
            );
        }

        let body: { destination: string };
        try {
            body = FavoriteBodySchema.parse(await req.json());
        } catch {
            return NextResponse.json(
                { success: false, error: { code: "BAD_REQUEST", message: "destination must be a non-empty string (max 200 chars)." } },
                { status: 400 }
            );
        }

        const { destination } = body;
        const userId = auth.user.sub;

        try {
            const { count } = await prisma.favoriteDestination.deleteMany({
                where: { userId, destination },
            });

            logInfo("[DELETE /api/favorites] removed", { userId, destination, count });
            return NextResponse.json(
                { success: true, data: { favorited: false, destination, removed: count } },
                { status: 200 }
            );
        } catch (err) {
            logError("[DELETE /api/favorites] db error", err);
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "Unable to remove favorite." } },
                { status: 500 }
            );
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list favorites for authenticated user
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
                { status: 401 }
            );
        }

        try {
            const favorites = await prisma.favoriteDestination.findMany({
                where: { userId: auth.user.sub },
                orderBy: { createdAt: "desc" },
                select: { id: true, destination: true, createdAt: true },
            });

            return NextResponse.json(
                { success: true, data: { favorites } },
                { status: 200 }
            );
        } catch (err) {
            logError("[GET /api/favorites] db error", err);
            return NextResponse.json(
                { success: false, error: { code: "INTERNAL_ERROR", message: "Unable to fetch favorites." } },
                { status: 500 }
            );
        }
    });
}
