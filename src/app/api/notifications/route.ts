import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import { successResponse, errorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";

export async function GET(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return errorResponse("UNAUTHORIZED", "You must be signed in to view notifications", 401);
        }

        try {
            const notifications = await prisma.notification.findMany({
                where: { userId: auth.user.sub },
                orderBy: { createdAt: "desc" },
                take: 50,
            });

            return successResponse({ notifications });
        } catch (err) {
            console.error("[notifications] Fetch failed:", err);
            return errorResponse("INTERNAL_ERROR", "Failed to fetch notifications", 500);
        }
    });
}
