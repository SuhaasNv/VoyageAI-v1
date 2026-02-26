/**
 * lib/api/request.ts
 *
 * Request context extraction helpers used across API routes.
 * Also exports `validateBody` – the single, canonical way to parse and
 * validate a request body against a Zod schema in an API route handler.
 */

import { NextRequest, NextResponse } from "next/server";
import { parse as parseCookies } from "cookie";
import { type ZodSchema, ZodError } from "zod";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/auth/tokens";
import { REFRESH_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { errorResponse, validationErrorResponse } from "@/lib/api/response";

// ─────────────────────────────────────────────────────────────────────────────
// IP address
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the real client IP from standard proxy headers.
 * Falls back to a placeholder in development.
 */
export function getClientIp(req: NextRequest): string {
    return (
        req.headers.get("x-real-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        "127.0.0.1"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getRefreshTokenFromCookie(req: NextRequest): string | null {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = parseCookies(cookieHeader);
    return cookies[REFRESH_TOKEN_COOKIE] ?? null;
}

export function getCsrfTokenFromCookie(req: NextRequest): string | null {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = parseCookies(cookieHeader);
    return cookies[CSRF_TOKEN_COOKIE] ?? null;
}

export function getCsrfTokenFromHeader(req: NextRequest): string | null {
    return req.headers.get("x-csrf-token");
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearer token
// ─────────────────────────────────────────────────────────────────────────────

export function getBearerToken(req: NextRequest): string | null {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    return auth.slice(7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth context
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthContext {
    user: AccessTokenPayload;
}

/**
 * Extract access token from Authorization header or voyageai_at cookie.
 */
export function getAccessTokenFromRequest(req: NextRequest): string | null {
    const bearer = getBearerToken(req);
    if (bearer) return bearer;
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookies = parseCookies(cookieHeader);
    return cookies[ACCESS_TOKEN_COOKIE] ?? null;
}

/**
 * Extract and verify the access token from the Authorization header or cookie.
 * Returns null if absent or invalid.
 */
export function getAuthContext(req: NextRequest): AuthContext | null {
    try {
        const token = getAccessTokenFromRequest(req);
        if (!token) return null;
        const user = verifyAccessToken(token);
        return { user };
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Body validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the request body as JSON and validate it against a Zod schema.
 *
 * Returns a discriminated union:
 *   { ok: true;  data: T }              — body is valid; `data` is the parsed value
 *   { ok: false; response: NextResponse } — body is invalid; send this response
 *
 * Usage in a route handler:
 *
 *   const result = await validateBody(req, MySchema);
 *   if (!result.ok) return result.response;
 *   const { destination, startDate } = result.data;
 */
export async function validateBody<T>(
    req: Request | NextRequest,
    schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
    // Step 1 – parse JSON
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return {
            ok: false,
            response: errorResponse("BAD_REQUEST", "Request body must be valid JSON", 400),
        };
    }

    // Step 2 – validate with Zod
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        return {
            ok: false,
            response: validationErrorResponse(parsed.error as ZodError),
        };
    }

    return { ok: true, data: parsed.data };
}
