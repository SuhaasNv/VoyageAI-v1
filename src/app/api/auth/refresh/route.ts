/**
 * app/api/auth/refresh/route.ts
 *
 * POST /api/auth/refresh
 *
 * Secure refresh token rotation with reuse detection.
 *
 * Algorithm:
 *  1. Read refresh token from HttpOnly cookie.
 *  2. Verify JWT signature and compute its SHA-256 hash.
 *  3. Load the DB record by hash.
 *  4. If the token is already revoked → REUSE DETECTED:
 *       Revoke ALL tokens in the same family (session takeover mitigation).
 *  5. If expired, revoke and return 401.
 *  6. Issue a new access + refresh token pair.
 *  7. Revoke the old refresh token, store the new hash, set new cookie.
 *
 * Rate limit: 30 refreshes / 15 min per IP.
 */
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import {
    verifyRefreshToken,
    signAccessToken,
    signRefreshToken,
    hashToken,
    newTokenFamily,
} from "@/lib/auth/tokens";
import { serializeRefreshTokenCookie, clearRefreshTokenCookie, serializeAccessTokenCookie, serializeCsrfCookie } from "@/lib/auth/cookies";
import { generateCsrfToken } from "@/lib/auth/csrf";
import { rateLimit, REFRESH_RATE_LIMIT } from "@/lib/auth/rateLimit";
import { writeAuditLog } from "@/lib/auth/audit";
import {
    successResponse,
    unauthorizedResponse,
    rateLimitResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getClientIp, getRefreshTokenFromCookie } from "@/lib/api/request";
import { logError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const ip = getClientIp(req);
        const ua = req.headers.get("user-agent") ?? "unknown";

        // ── Rate limit ─────────────────────────────────────────────────────────────
        const rl = await rateLimit(`refresh:ip:${ip}`, REFRESH_RATE_LIMIT);
        if (!rl.allowed) {
            await writeAuditLog({ action: "RATE_LIMITED", ipAddress: ip, userAgent: ua });
            return rateLimitResponse(rl.retryAfterMs);
        }

        // ── Extract refresh token from cookie ─────────────────────────────────────
        const rawToken = getRefreshTokenFromCookie(req);
        if (!rawToken) {
            return unauthorizedResponse("No refresh token provided");
        }

        // ── Verify JWT signature ──────────────────────────────────────────────────
        let payload;
        try {
            payload = verifyRefreshToken(rawToken);
        } catch (err) {
            // Expired or invalid JWT
            const clearCookie = clearRefreshTokenCookie();
            const response = unauthorizedResponse("Refresh token is invalid or expired");
            response.headers.append("Set-Cookie", clearCookie);
            return response;
        }

        // ── Look up token record in DB ────────────────────────────────────────────
        const tokenHash = hashToken(rawToken);
        const storedToken = await prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        image: true,
                        role: true,
                        isActive: true,
                        hasOnboarded: true,
                        createdAt: true,
                    },
                },
            },
        });

        // ── Token not found (was never issued or already rotated) ─────────────────
        if (!storedToken) {
            // Revoke entire family as a precaution (reuse from unknown token)
            await prisma.refreshToken.updateMany({
                where: { userId: payload.sub, family: payload.family },
                data: { isRevoked: true },
            });
            await writeAuditLog({
                action: "REFRESH_REUSE_DETECTED",
                userId: payload.sub,
                ipAddress: ip,
                userAgent: ua,
                metadata: { family: payload.family, reason: "token_not_found" },
            });
            const clearCookie = clearRefreshTokenCookie();
            const response = unauthorizedResponse("Session compromised. Please log in again.");
            response.headers.append("Set-Cookie", clearCookie);
            return response;
        }

        // ── Reuse detection: token was already revoked ────────────────────────────
        if (storedToken.isRevoked) {
            // Revoke the entire family – an attacker may be replaying a stolen token
            await prisma.refreshToken.updateMany({
                where: { family: storedToken.family },
                data: { isRevoked: true },
            });
            await writeAuditLog({
                action: "REFRESH_REUSE_DETECTED",
                userId: storedToken.userId,
                ipAddress: ip,
                userAgent: ua,
                metadata: { tokenId: storedToken.id, family: storedToken.family },
            });
            const clearCookie = clearRefreshTokenCookie();
            const response = unauthorizedResponse("Session compromised. Please log in again.");
            response.headers.append("Set-Cookie", clearCookie);
            return response;
        }

        // ── Token expired (belt-and-suspenders: JWT verify should catch this) ─────
        if (storedToken.expiresAt <= new Date()) {
            await prisma.refreshToken.update({
                where: { id: storedToken.id },
                data: { isRevoked: true },
            });
            const clearCookie = clearRefreshTokenCookie();
            const response = unauthorizedResponse("Session expired. Please log in again.");
            response.headers.append("Set-Cookie", clearCookie);
            return response;
        }

        // ── Check user is still active ────────────────────────────────────────────
        if (!storedToken.user.isActive) {
            await prisma.refreshToken.updateMany({
                where: { userId: storedToken.userId },
                data: { isRevoked: true },
            });
            const clearCookie = clearRefreshTokenCookie();
            const response = unauthorizedResponse("Account has been disabled.");
            response.headers.append("Set-Cookie", clearCookie);
            return response;
        }

        // ── Issue new token pair ──────────────────────────────────────────────────
        const newFamily = newTokenFamily(); // Rotate the family on each refresh
        const accessToken = signAccessToken({
            sub: storedToken.user.id,
            email: storedToken.user.email,
            role: storedToken.user.role,
        });

        const {
            rawToken: newRawToken,
            tokenHash: newTokenHash,
            expiresAt: newExpiresAt,
        } = signRefreshToken(storedToken.user.id, newFamily);

        // ── Atomic: revoke old, store new ─────────────────────────────────────────
        try {
            await prisma.$transaction([
                prisma.refreshToken.update({
                    where: { id: storedToken.id },
                    data: {
                        isRevoked: true,
                        replacedBy: newTokenHash, // audit trail
                    },
                }),
                prisma.refreshToken.create({
                    data: {
                        userId: storedToken.user.id,
                        tokenHash: newTokenHash,
                        family: newFamily,
                        expiresAt: newExpiresAt,
                        userAgent: ua,
                        ipAddress: ip,
                    },
                }),
            ]);
        } catch (err) {
            logError("[refresh] DB transaction failed", err);
            return internalErrorResponse();
        }

        await writeAuditLog({
            action: "REFRESH",
            userId: storedToken.user.id,
            ipAddress: ip,
            userAgent: ua,
        });

        // ── Response ──────────────────────────────────────────────────────────────
        const user = {
            id: storedToken.user.id,
            email: storedToken.user.email,
            name: storedToken.user.name,
            image: storedToken.user.image,
            role: storedToken.user.role,
            hasOnboarded: storedToken.user.hasOnboarded,
            createdAt: storedToken.user.createdAt.toISOString(),
        };
        const response = successResponse({ accessToken, user });
        response.headers.append("Set-Cookie", serializeAccessTokenCookie(accessToken));
        response.headers.append("Set-Cookie", serializeRefreshTokenCookie(newRawToken));
        response.headers.append("Set-Cookie", serializeCsrfCookie(generateCsrfToken()));

        return response;
    });
}
