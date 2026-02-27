import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import { successResponse, errorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return errorResponse("UNAUTHORIZED", "You must be signed in to view preferences", 401);
        }

        try {
            const preference = await prisma.travelPreference.findUnique({
                where: { userId: auth.user.sub },
            });

            if (!preference) {
                return successResponse({ preference: null });
            }

            return successResponse({ preference });
        } catch (err) {
            console.error("[preferences] Fetch failed:", err);
            return errorResponse("INTERNAL_ERROR", "Failed to fetch preferences", 500);
        }
    });
}

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return errorResponse("UNAUTHORIZED", "You must be signed in to update preferences", 401);
        }

        let body: any;
        try {
            body = await req.json();
        } catch {
            return errorResponse("BAD_REQUEST", "Request body must be valid JSON", 400);
        }

        const data = body.data || body; // Use 'data' if provided, otherwise the whole body

        try {
            const preference = await prisma.travelPreference.upsert({
                where: { userId: auth.user.sub },
                update: { data },
                create: {
                    userId: auth.user.sub,
                    data,
                },
            });

            return successResponse({ preference });
        } catch (err) {
            console.error("[preferences] Update/Create failed:", err);
            return errorResponse("INTERNAL_ERROR", "Failed to update preferences", 500);
        }
    });
}
