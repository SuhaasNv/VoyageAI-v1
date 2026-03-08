/**
 * POST /api/auth/onboard
 *
 * Saves travel preferences and sets hasOnboarded = true.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { successResponse, unauthorizedResponse, internalErrorResponse } from "@/lib/api/response";
import { getAuthContext, validateBody } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";

const OnboardSchema = z.object({
    travelStyles: z.array(z.string()).min(1).max(5).optional().default([]),
    pacePreference: z.enum(["slow", "moderate", "fast"]).optional().default("moderate"),
    budgetTier: z.enum(["budget", "mid-range", "luxury"]).optional().default("mid-range"),
    interests: z.array(z.string()).min(0).max(20).optional().default([]),
});

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        const body = await validateBody(req, OnboardSchema);
        if (!body.ok) return body.response;

        try {
            await prisma.user.update({
                where: { id: auth.user.sub },
                data: {
                    hasOnboarded: true,
                    preferences: body.data as object,
                },
            });
            return successResponse({ success: true });
        } catch (err) {
            logError("[onboard] DB error", err);
            return internalErrorResponse();
        }
    });
}
