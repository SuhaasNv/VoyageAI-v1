/**
 * app/api/auth/register/route.ts
 *
 * POST /api/auth/register
 *
 * Creates a new user account, issues access + refresh tokens, and sets
 * the HttpOnly refresh cookie.
 *
 * Rate limit: 10 requests / 15 min per IP.
 */

import { NextRequest } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken, newTokenFamily } from "@/lib/auth/tokens";
import { serializeRefreshTokenCookie, serializeCsrfCookie, serializeAccessTokenCookie } from "@/lib/auth/cookies";
import { generateCsrfToken } from "@/lib/auth/csrf";
import { rateLimit, AUTH_RATE_LIMIT } from "@/lib/auth/rateLimit";
import { writeAuditLog } from "@/lib/auth/audit";
import { RegisterSchema } from "@/lib/auth/schemas";
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
        const rl = await rateLimit(`register:ip:${ip}`, AUTH_RATE_LIMIT);
        if (!rl.allowed) {
            writeAuditLog({ action: "RATE_LIMITED", ipAddress: ip, userAgent: ua }).catch(err => logError("[register] Delayed audit failed", err));
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
            input = RegisterSchema.parse(body);
        } catch (err) {
            if (err instanceof ZodError) return validationErrorResponse(err);
            throw err;
        }

        try {
            // ── Check duplicate email ─────────────────────────────────────────────
            const existing = await prisma.user.findUnique({
                where: { email: input.email },
                select: { id: true },
            });

            if (existing) {
                return errorResponse(
                    "CONFLICT",
                    "An account with that email already exists. Try signing in with Google if you used it before.",
                    409
                );
            }

            // ── Create user ───────────────────────────────────────────────────────
            let user;
            const passwordHash = await hashPassword(input.password);
            user = await prisma.user.create({
                data: {
                    email: input.email,
                    passwordHash,
                    name: input.name,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    hasOnboarded: true,
                    createdAt: true,
                },
            });

            // ── Issue tokens ──────────────────────────────────────────────────────
            const accessToken = signAccessToken({
                sub: user.id,
                email: user.email,
                role: user.role,
            });

            const family = newTokenFamily();
            const { rawToken, tokenHash, expiresAt } = signRefreshToken(user.id, family);

            await prisma.refreshToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    family,
                    expiresAt,
                    userAgent: ua,
                    ipAddress: ip,
                },
            });

            const csrfToken = generateCsrfToken();

            writeAuditLog({
                action: "REGISTER",
                userId: user.id,
                ipAddress: ip,
                userAgent: ua,
            }).catch(err => logError("[register] Delayed audit failed", err));

            // ── Response ──────────────────────────────────────────────────────────
            const response = successResponse(
                {
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        image: null,
                        role: user.role,
                        hasOnboarded: user.hasOnboarded,
                        createdAt: user.createdAt,
                    },
                    accessToken,
                },
                201
            );

            response.headers.append("Set-Cookie", serializeAccessTokenCookie(accessToken));
            response.headers.append("Set-Cookie", serializeRefreshTokenCookie(rawToken));
            response.headers.append("Set-Cookie", serializeCsrfCookie(csrfToken));

            return response;
        } catch (err: unknown) {
            const prismaErr = err as { code?: string };
            if (prismaErr?.code === "P2002") {
                return errorResponse(
                    "CONFLICT",
                    "An account with that email already exists. Try signing in with Google if you used it before.",
                    409
                );
            }
            logError("[register] DB error", err);
            return internalErrorResponse();
        }
    });
}
