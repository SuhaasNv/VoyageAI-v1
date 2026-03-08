/**
 * lib/auth/cookies.ts
 *
 * Centralized cookie helpers for setting and clearing the HttpOnly
 * refresh-token cookie.  All cookie options are defined in one place
 * so no endpoint can accidentally weaken the policy.
 */

import { serialize, type SerializeOptions as CookieSerializeOptions } from "cookie";
import { env } from "@/infrastructure/env";

export const REFRESH_TOKEN_COOKIE = "voyageai_rt";
export const CSRF_TOKEN_COOKIE = "voyageai_csrf";
export const ACCESS_TOKEN_COOKIE = "voyageai_at";
export const OAUTH_STATE_COOKIE = "voyageai_oauth_state";

const isProduction = env.NODE_ENV === "production";

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token cookie
// ─────────────────────────────────────────────────────────────────────────────

const refreshTokenCookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth",   // Scope to auth routes only – minimizes attack surface
    maxAge: (env.REFRESH_TOKEN_EXPIRY_MS ?? 604800000) / 1000,
};

export function serializeRefreshTokenCookie(rawToken: string): string {
    return serialize(REFRESH_TOKEN_COOKIE, rawToken, refreshTokenCookieOptions);
}

export function clearRefreshTokenCookie(): string {
    return serialize(REFRESH_TOKEN_COOKIE, "", {
        ...refreshTokenCookieOptions,
        maxAge: 0,
        expires: new Date(0),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CSRF cookie (readable by JS so the client can read and send it)
// ─────────────────────────────────────────────────────────────────────────────

const csrfCookieOptions: CookieSerializeOptions = {
    httpOnly: false,          // intentionally JS-readable
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,            // 24 h
};

export function serializeCsrfCookie(token: string): string {
    return serialize(CSRF_TOKEN_COOKIE, token, csrfCookieOptions);
}

export function clearCsrfCookie(): string {
    return serialize(CSRF_TOKEN_COOKIE, "", {
        ...csrfCookieOptions,
        maxAge: 0,
        expires: new Date(0),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Access token cookie (HttpOnly – XSS protection; validation in API routes only)
// Short-lived: matches access token TTL (15 min default)
// ─────────────────────────────────────────────────────────────────────────────

const accessTokenCookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax", // lax required for OAuth redirect chain (Google → callback → dashboard)
    path: "/",
    maxAge: (env.ACCESS_TOKEN_EXPIRY_MS ?? 900000) / 1000,
};

export function serializeAccessTokenCookie(token: string): string {
    return serialize(ACCESS_TOKEN_COOKIE, token, accessTokenCookieOptions);
}

export function clearAccessTokenCookie(): string {
    return serialize(ACCESS_TOKEN_COOKIE, "", {
        ...accessTokenCookieOptions,
        maxAge: 0,
        expires: new Date(0),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth state cookie (short-lived, for Google OAuth CSRF protection)
// ─────────────────────────────────────────────────────────────────────────────

const oauthStateCookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax", // Must be lax for OAuth redirect
    path: "/",
    maxAge: 600, // 10 min
};

export function serializeOAuthStateCookie(state: string): string {
    return serialize(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions);
}

export function clearOAuthStateCookie(): string {
    return serialize(OAUTH_STATE_COOKIE, "", {
        ...oauthStateCookieOptions,
        maxAge: 0,
        expires: new Date(0),
    });
}
