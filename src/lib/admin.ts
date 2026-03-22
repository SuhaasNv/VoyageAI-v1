/**
 * lib/admin.ts
 *
 * Shared admin-gate utilities used by admin layouts, pages, and server actions.
 * Single source of truth for the admin allow-list and auth verification logic.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "@/services/auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "@/services/auth/cookies";
import { getAuthContext, type AuthContext } from "@/lib/api/request";
import { unauthorizedResponse, forbiddenResponse } from "@/lib/api/response";

// ─── Allow-list ───────────────────────────────────────────────────────────────
// Any user with role ADMIN or whose email (case-insensitive) appears here
// passes the gate.
//
// Extra admins can be granted without a code deploy by setting the
// ADMIN_EMAILS environment variable to a comma-separated list of addresses:
//   ADMIN_EMAILS="ops@example.com,support@example.com"

const HARDCODED_ADMIN_EMAILS = ["suhaas@voyageai.com", "admin@voyageai.com"];

function buildAdminEmailSet(): Set<string> {
    const fromEnv = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    // Normalize hardcoded entries too so the Set is uniformly lowercase,
    // preventing silent mismatches if casing is ever changed in this list.
    return new Set([...HARDCODED_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
}

export const ADMIN_EMAILS = buildAdminEmailSet();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isAdminPayload(payload: AccessTokenPayload): boolean {
    return payload.role === "ADMIN" || ADMIN_EMAILS.has(payload.email.toLowerCase());
}

/**
 * Verify authentication and admin authorization for API route handlers.
 *
 * Returns the auth context on success, or an appropriate error NextResponse.
 * Use instead of duplicating the three-line auth+authz check across routes.
 *
 * Usage:
 *   const result = requireAdminApiAuth(req);
 *   if (!result.ok) return result.response;
 *   const { user } = result.auth;
 */
export function requireAdminApiAuth(
    req: NextRequest,
): { ok: true; auth: AuthContext } | { ok: false; response: NextResponse } {
    const auth = getAuthContext(req);
    if (!auth) return { ok: false, response: unauthorizedResponse() };
    if (!isAdminPayload(auth.user)) return { ok: false, response: forbiddenResponse() };
    return { ok: true, auth };
}

type AuthError = "UNAUTHENTICATED" | "FORBIDDEN";

class AdminAuthError extends Error {
    constructor(public readonly code: AuthError) {
        super(code);
    }
}

/**
 * Read the access-token cookie, verify it, and confirm the caller is admin.
 *
 * Throws `AdminAuthError("UNAUTHENTICATED")` — redirect to /login
 * Throws `AdminAuthError("FORBIDDEN")`      — redirect to /dashboard
 *
 * Designed for use in layouts, server components, and server actions.
 */
export async function requireAdmin(): Promise<AccessTokenPayload> {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

    if (!token) throw new AdminAuthError("UNAUTHENTICATED");

    let payload: AccessTokenPayload;
    try {
        payload = verifyAccessToken(token);
    } catch {
        throw new AdminAuthError("UNAUTHENTICATED");
    }

    if (!isAdminPayload(payload)) throw new AdminAuthError("FORBIDDEN");
    return payload;
}

export { AdminAuthError };
