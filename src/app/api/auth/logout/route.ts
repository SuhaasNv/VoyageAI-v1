/**
 * app/api/auth/logout/route.ts
 *
 * POST /api/auth/logout
 *
 * Revokes the current refresh token from the DB and clears the cookie.
 * If the token is not found (already expired/rotated), still clears the cookie.
 *
 * CSRF validation is handled by middleware (all non-exempt POST routes).
 */

import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { clearRefreshTokenCookie, clearCsrfCookie, clearAccessTokenCookie } from "@/lib/auth/cookies";
import { writeAuditLog } from "@/lib/auth/audit";
import { successResponse } from "@/lib/api/response";
import { getClientIp, getRefreshTokenFromCookie, getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? "unknown";

    const rawToken = getRefreshTokenFromCookie(req);
    const authCtx = getAuthContext(req);

    if (rawToken) {
        const tokenHash = hashToken(rawToken);
        try {
            await prisma.refreshToken.updateMany({
                where: { tokenHash, isRevoked: false },
                data: { isRevoked: true },
            });
        } catch (err) {
            // Log but don't fail the logout
            console.error("[logout] Failed to revoke token:", err);
        }
    }

    await writeAuditLog({
        action: "LOGOUT",
        userId: authCtx?.user.sub,
        ipAddress: ip,
        userAgent: ua,
    });

    const response = successResponse({ message: "Logged out successfully" });
    response.headers.append("Set-Cookie", clearAccessTokenCookie());
    response.headers.append("Set-Cookie", clearRefreshTokenCookie());
    response.headers.append("Set-Cookie", clearCsrfCookie());

    return response;
    });
}
