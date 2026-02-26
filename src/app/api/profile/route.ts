/**
 * app/api/profile/route.ts
 *
 * PATCH /api/profile
 *
 * Updates the authenticated user's profile (name).
 * Requires valid access token (cookie or Authorization header).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import { successResponse, errorResponse, validationErrorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";

const UpdateProfileSchema = z.object({
    name: z
        .string()
        .min(1, "Name is required")
        .max(100, "Name too long")
        .trim(),
});

export async function PATCH(req: NextRequest) {
    return runWithRequestContext(req, async () => {
    const auth = getAuthContext(req);
    if (!auth) {
        return errorResponse("UNAUTHORIZED", "You must be signed in to update your profile", 401);
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return errorResponse("BAD_REQUEST", "Request body must be valid JSON", 400);
    }

    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid input";
        return errorResponse("VALIDATION_ERROR", msg, 400);
    }

    const { name } = parsed.data;

    try {
        const user = await prisma.user.update({
            where: { id: auth.user.sub },
            data: { name },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });

        return successResponse({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt.toISOString(),
            },
        });
    } catch (err) {
        console.error("[profile] Update failed:", err);
        return errorResponse("INTERNAL_ERROR", "Failed to update profile", 500);
    }
    });
}
