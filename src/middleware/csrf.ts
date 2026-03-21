/**
 * middleware/csrf.ts
 *
 * Edge Runtime–compatible CSRF verification middleware.
 *
 * Implements the Double Submit Cookie pattern with HMAC signature verification:
 *  1. Read the `X-CSRF-Token` request header.
 *  2. Read the signed CSRF cookie (`voyageai_csrf`).
 *  3. Reject if either is absent or they do not match.
 *  4. Verify the HMAC signature (same logic as `@/services/auth/csrf.edge`).
 *
 * Applied to: POST, PUT, PATCH, DELETE on /api/* routes.
 * Exempt from: routes that issue the token (login, register, refresh).
 */

import { NextRequest, NextResponse } from "next/server";
import { CSRF_TOKEN_COOKIE } from "@/services/auth/cookieNames";
import { verifyCsrfTokenEdge } from "@/services/auth/csrf.edge";

const CSRF_HEADER = "x-csrf-token";

/** HTTP methods that mutate server state and therefore require a CSRF token. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXEMPT_PATHS = new Set([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/ai/landing",
]);

function csrfRejected(reason?: string): NextResponse {
    if (reason) console.error(`[CSRF] Rejected: ${reason}`);
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
}

/**
 * CSRF verification middleware.
 * Returns a `NextResponse` (403) when the request should be rejected; `null` when OK.
 */
export async function checkCsrf(req: NextRequest): Promise<NextResponse | null> {
    const { pathname } = req.nextUrl;

    if (!pathname.startsWith("/api/")) return null;
    if (!MUTATING_METHODS.has(req.method)) return null;
    if (EXEMPT_PATHS.has(pathname)) return null;

    const csrfHeader = req.headers.get(CSRF_HEADER);
    const csrfCookie = req.cookies.get(CSRF_TOKEN_COOKIE)?.value ?? null;

    if (!csrfHeader) return csrfRejected("Missing CSRF header");
    if (!csrfCookie) return csrfRejected("Missing CSRF cookie");
    if (csrfHeader !== csrfCookie) return csrfRejected("CSRF header and cookie mismatch");

    const isValid = await verifyCsrfTokenEdge(csrfHeader);
    if (!isValid) return csrfRejected("Invalid HMAC signature");

    return null;
}
