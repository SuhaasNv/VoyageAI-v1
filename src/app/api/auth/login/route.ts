/**
 * app/api/auth/login/route.ts
 *
 * POST /api/auth/login
 *
 * Authenticates a user by email + password, issues a 15-min access token,
 * and stores a 7-day refresh token in an HttpOnly cookie.
 *
 * Rate limit: 10 attempts / 15 min per IP.
 */

import { NextRequest } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken, newTokenFamily } from "@/lib/auth/tokens";
import { serializeRefreshTokenCookie, serializeCsrfCookie, serializeAccessTokenCookie } from "@/lib/auth/cookies";
import { generateCsrfToken } from "@/lib/auth/csrf";
import { rateLimit, AUTH_RATE_LIMIT } from "@/lib/auth/rateLimit";
import { writeAuditLog } from "@/lib/auth/audit";
import { LoginSchema } from "@/lib/auth/schemas";
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    rateLimitResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getClientIp } from "@/lib/api/request";
import { logError } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const ip = getClientIp(req);
        const ua = req.headers.get("user-agent") ?? "unknown";

        // ── Rate limit ─────────────────────────────────────────────────────────────
        const rl = await rateLimit(`login:ip:${ip}`, AUTH_RATE_LIMIT);
        if (!rl.allowed) {
            writeAuditLog({ action: "RATE_LIMITED", ipAddress: ip, userAgent: ua }).catch(err => logError("[login] Delayed audit failed", err));
            return rateLimitResponse(rl.retryAfterMs);
        }

        // ── Parse & validate body ─────────────────────────────────────────────────
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return errorResponse("BAD_REQUEST", "Request body must be valid JSON", 400);
        }

        let input;
        try {
            input = LoginSchema.parse(body);
        } catch (err) {
            if (err instanceof ZodError) return validationErrorResponse(err);
            throw err;
        }

        let user;
        try {
            // ── Lookup user ───────────────────────────────────────────────────────
            user = await prisma.user.findUnique({
                where: { email: input.email },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    image: true,
                    role: true,
                    passwordHash: true,
                    isActive: true,
                    hasOnboarded: true,
                    createdAt: true,
                },
            });
        } catch (err) {
            logError("[login] DB error (lookup)", err);
            return internalErrorResponse();
        }

        if (!user) {
            writeAuditLog({
                action: "LOGIN_FAILED",
                ipAddress: ip,
                userAgent: ua,
            }).catch(err => logError("[login] Delayed audit failed", err));
            return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
        }

        // OAuth-only users cannot sign in with password
        if (!user.passwordHash) {
            writeAuditLog({
                action: "LOGIN_FAILED",
                userId: user.id,
                ipAddress: ip,
                userAgent: ua,
            }).catch(err => logError("[login] Delayed audit failed", err));
            return errorResponse(
                "OAUTH_ACCOUNT",
                "This account uses Google sign-in. Please sign in with Google.",
                400
            );
        }

        const passwordValid = await verifyPassword(input.password, user.passwordHash);

        if (!passwordValid) {
            writeAuditLog({
                action: "LOGIN_FAILED",
                userId: user?.id,
                ipAddress: ip,
                userAgent: ua,
            }).catch(err => logError("[login] Delayed audit failed", err));
            // Generic message to prevent user enumeration
            return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
        }

        if (!user.isActive) {
            return errorResponse(
                "ACCOUNT_DISABLED",
                "Your account has been disabled. Please contact support.",
                403
            );
        }

        try {
            // ── Issue tokens ──────────────────────────────────────────────────────
            const accessToken = signAccessToken({
                sub: user.id,
                email: user.email,
                role: user.role,
            });

            const family = newTokenFamily();
            const { rawToken, tokenHash, expiresAt } = signRefreshToken(user.id, family);

            const csrfToken = generateCsrfToken();

            writeAuditLog({
                action: "LOGIN",
                userId: user.id,
                ipAddress: ip,
                userAgent: ua,
            }).catch(err => logError("[login] Delayed audit failed", err));

            // ── Update DB concurrently ────────────────────────────────────────────
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: user.id },
                    data: { lastLoginAt: new Date() },
                }),
                prisma.refreshToken.create({
                    data: {
                        userId: user.id,
                        tokenHash,
                        family,
                        expiresAt,
                        userAgent: ua,
                        ipAddress: ip,
                    },
                })
            ]);

            // ── Response ──────────────────────────────────────────────────────────
            const response = successResponse({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                    role: user.role,
                    hasOnboarded: user.hasOnboarded,
                    createdAt: user.createdAt,
                },
                accessToken,
            });

            response.headers.append("Set-Cookie", serializeAccessTokenCookie(accessToken));
            response.headers.append("Set-Cookie", serializeRefreshTokenCookie(rawToken));
            response.headers.append("Set-Cookie", serializeCsrfCookie(csrfToken));

            return response;
        } catch (err) {
            logError("[login] DB error (issue tokens)", err);
            return internalErrorResponse();
        }
    });
}
