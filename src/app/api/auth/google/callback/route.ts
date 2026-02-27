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
import { logError } from "@/lib/logger";

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
        logError("[google/callback] OAuth error", { error });
        return redirectToLogin("Google sign-in failed. Please try again.");
    }

    if (!code || !state) {
        return redirectToLogin("Invalid sign-in request. Please try again.");
    }

    const storedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!storedState || storedState !== state) {
        logError("[google/callback] State mismatch");
        return redirectToLogin("Session expired. Please try again.");
    }

    const [, redirectTo] = state.includes(":") ? state.split(":") : [null, "/"];
    const safeRedirect = redirectTo?.startsWith("/") ? redirectTo : "/";

    const redirectUri = `${BASE_URL}/api/auth/google/callback`;

    let googleUser;
    try {
        googleUser = await exchangeCodeForUserInfo(code, redirectUri);
    } catch (err) {
        logError("[google/callback] Token exchange failed", err);
        return redirectToLogin("Google sign-in failed. Please try again.");
    }

    const email = googleUser.email.toLowerCase();
    try {
        // Upsert by email: never create duplicates. Links provider if existing email user.
        const user = await prisma.user.upsert({
            where: { email },
            create: {
                email,
                name: googleUser.name ?? null,
                image: googleUser.picture ?? null,
                provider: "google",
                providerId: googleUser.id,
                emailVerified: googleUser.verified_email ?? true,
                lastLoginAt: new Date(),
            },
            update: {
                provider: "google",
                providerId: googleUser.id,
                emailVerified: true,
                lastLoginAt: new Date(),
            },
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
        });

        // Merge name/image from Google when existing user has none
        const needsMerge = (!user.name && googleUser.name) || (!user.image && googleUser.picture);
        if (needsMerge) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    ...(!user.name && googleUser.name ? { name: googleUser.name } : {}),
                    ...(!user.image && googleUser.picture ? { image: googleUser.picture } : {}),
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

        // Create refresh token session in parallel with other DB-safe operations if possible
        // but it's needed for the response, so we await it.
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

        // Fire-and-forget audit log (non-blocking)
        writeAuditLog({
            action: "LOGIN",
            userId: user.id,
            ipAddress: ip,
            userAgent: ua,
            metadata: { provider: "google" },
        }).catch(err => logError("[google/callback] Delayed audit log failed", err));

        // Use standard 302 redirect. Modern browsers handle Set-Cookie on 302 perfectly.
        const redirectUrl = new URL(safeRedirect, BASE_URL).toString();
        const res = NextResponse.redirect(redirectUrl);

        res.headers.append("Set-Cookie", serializeAccessTokenCookie(accessToken));
        res.headers.append("Set-Cookie", serializeRefreshTokenCookie(rawToken));
        res.headers.append("Set-Cookie", serializeCsrfCookie(csrfToken));
        res.headers.append("Set-Cookie", clearOAuthStateCookie());

        return res;
    } catch (err) {
        logError("[google/callback] DB error", err instanceof Error ? { message: err.message, stack: err.stack } : err);
        return redirectToLogin("Something went wrong. Please try again.");
    }
}
