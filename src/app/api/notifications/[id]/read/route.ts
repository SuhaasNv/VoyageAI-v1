import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/api/request";
import { successResponse, errorResponse } from "@/lib/api/response";
import { runWithRequestContext } from "@/lib/requestContext";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) {
            return errorResponse("UNAUTHORIZED", "You must be signed in to update notifications", 401);
        }

        const { id } = await params;

        try {
            const notification = await prisma.notification.update({
                where: {
                    id,
                    userId: auth.user.sub,
                },
                data: {
                    isRead: true,
                },
            });

            return successResponse({ notification });
        } catch (err) {
            console.error("[notifications] Update failed:", err);
            return errorResponse("NOT_FOUND", "Notification not found", 404);
        }
    });
}
