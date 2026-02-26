/**
 * app/api/auth/google/callback/route.ts
 *
 * GET /api/auth/google/callback
 *
 * Google OAuth callback. Exchanges code for user info, finds/creates user,
 * issues our JWTs and redirects to the app.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForUserInfo } from "@/lib/auth/google";
import { signAccessToken, signRefreshToken, newTokenFamily } from "@/lib/auth/tokens";
import {
    serializeRefreshTokenCookie,
    serializeCsrfCookie,
    serializeAccessTokenCookie,
    clearOAuthStateCookie,
} from "@/lib/auth/cookies";
import { generateCsrfToken } from "@/lib/auth/csrf";
import { writeAuditLog } from "@/lib/auth/audit";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/cookies";
import { getClientIp } from "@/lib/api/request";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function redirectToLogin(error: string): NextResponse {
    const url = new URL("/login", BASE_URL);
    url.searchParams.set("error", error);
    const res = new NextResponse(null, { status: 302 });
    res.headers.set("Location", url.toString());
    res.headers.append("Set-Cookie", clearOAuthStateCookie());
    return res;
}

export async function GET(req: NextRequest) {
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? "unknown";

    const { searchParams } = req.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
        if (error === "access_denied") {
            return redirectToLogin("Sign-in was cancelled.");
        }
        console.error("[google/callback] OAuth error:", error);
        return redirectToLogin("Google sign-in failed. Please try again.");
    }

    if (!code || !state) {
        return redirectToLogin("Invalid sign-in request. Please try again.");
    }

    const storedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!storedState || storedState !== state) {
        console.error("[google/callback] State mismatch");
        return redirectToLogin("Session expired. Please try again.");
    }

    const [, redirectTo] = state.includes(":") ? state.split(":") : [null, "/"];
    const safeRedirect = redirectTo?.startsWith("/") ? redirectTo : "/";

    const redirectUri = `${BASE_URL}/api/auth/google/callback`;

    let googleUser;
    try {
        googleUser = await exchangeCodeForUserInfo(code, redirectUri);
    } catch (err) {
        console.error("[google/callback] Token exchange failed:", err);
        return redirectToLogin("Google sign-in failed. Please try again.");
    }

    try {
        let user = await prisma.user.findFirst({
            where: {
                provider: "google",
                providerId: googleUser.id,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
        });

        if (!user) {
            user = await prisma.user.findUnique({
                where: { email: googleUser.email.toLowerCase() },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                },
            });

            if (user) {
                // Existing email user – link Google account
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        provider: "google",
                        providerId: googleUser.id,
                        name: user.name ?? googleUser.name ?? undefined,
                        emailVerified: true,
                        lastLoginAt: new Date(),
                    },
                });
            } else {
                // New user – create
                user = await prisma.user.create({
                    data: {
                        email: googleUser.email.toLowerCase(),
                        name: googleUser.name ?? null,
                        provider: "google",
                        providerId: googleUser.id,
                        emailVerified: googleUser.verified_email ?? true,
                        lastLoginAt: new Date(),
                    },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true,
                        isActive: true,
                        createdAt: true,
                    },
                });
            }
        } else {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    name: user.name ?? googleUser.name ?? undefined,
                    lastLoginAt: new Date(),
                },
            });
        }

        if (!user.isActive) {
            return redirectToLogin("Your account has been disabled. Please contact support.");
        }

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

        await writeAuditLog({
            action: "LOGIN",
            userId: user.id,
            ipAddress: ip,
            userAgent: ua,
            metadata: { provider: "google" },
        });

        // Use HTML redirect so browser processes Set-Cookie before navigating.
        // Some browsers don't send cookies set on 302 redirect when following cross-site→same-site chain.
        const redirectUrl = new URL(safeRedirect, BASE_URL).toString();
        const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}"></head><body>Signing you in...</body></html>`;

        const res = new NextResponse(html, {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
            },
        });
        res.headers.append("Set-Cookie", serializeAccessTokenCookie(accessToken));
        res.headers.append("Set-Cookie", serializeRefreshTokenCookie(rawToken));
        res.headers.append("Set-Cookie", serializeCsrfCookie(csrfToken));
        res.headers.append("Set-Cookie", clearOAuthStateCookie());

        return res;
    } catch (err) {
        console.error("[google/callback] DB error:", err);
        if (err instanceof Error) {
            console.error("[google/callback] Error details:", err.message, err.stack);
        }
        return redirectToLogin("Something went wrong. Please try again.");
    }
}
