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
import { verifyPassword } from "@/services/auth/password";
import { signAccessToken, signRefreshToken, newTokenFamily } from "@/services/auth/tokens";
import { serializeRefreshTokenCookie, serializeCsrfCookie, serializeAccessTokenCookie } from "@/services/auth/cookies";
import { generateCsrfToken } from "@/services/auth/csrf";
import { rateLimit, AUTH_RATE_LIMIT } from "@/services/auth/rateLimit";
import { writeAuditLog } from "@/services/auth/audit";
import { LoginSchema } from "@/services/auth/schemas";
import {
    successResponse,
    errorResponse,
    validationErrorResponse,
    rateLimitResponse,
    internalErrorResponse,
} from "@/lib/api/response";
import { getClientIp } from "@/lib/api/request";
import { logError } from "@/infrastructure/logger";
import { runWithRequestContext } from "@/lib/requestContext";
import { plannerAuthTotal } from "@/lib/monitoring/businessMetrics";

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        try {
            const ip = getClientIp(req);
            const ua = req.headers.get("user-agent") ?? "unknown";

            // ── Rate limit ─────────────────────────────────────────────────────────
            const rl = await rateLimit(`login:ip:${ip}`, AUTH_RATE_LIMIT);
            if (!rl.allowed) {
                writeAuditLog({ action: "RATE_LIMITED", ipAddress: ip, userAgent: ua }).catch(err => logError("[login] Delayed audit failed", err));
                return rateLimitResponse(rl.retryAfterMs);
            }

            // ── Parse & validate body ────────────────────────────────────────────
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
                plannerAuthTotal.inc({ event: "login_failed", method: "password" });
                return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
            }

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
                plannerAuthTotal.inc({ event: "login_failed", method: "password" });
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

                // Prometheus metrics
                plannerAuthTotal.inc({ event: "login_success", method: "password" });

                return response;
            } catch (err) {
                logError("[login] DB error (issue tokens)", err);
                return internalErrorResponse();
            }
        } catch (err) {
            logError("[login] Unhandled error", err);
            return internalErrorResponse(
                "Login temporarily unavailable. Please try again in a moment.",
            );
        }
    });
}
