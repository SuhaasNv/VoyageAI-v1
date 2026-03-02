/**
 * lib/admin.ts
 *
 * Shared admin-gate utilities used by admin layouts, pages, and server actions.
 * Single source of truth for the admin allow-list and auth verification logic.
 */

import { cookies } from "next/headers";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";

// ─── Allow-list ───────────────────────────────────────────────────────────────
// Any user with role ADMIN or whose email appears here passes the gate.

export const ADMIN_EMAILS = new Set<string>([
    "suhaas@voyageai.com",
    "admin@voyageai.com",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isAdminPayload(payload: AccessTokenPayload): boolean {
    return payload.role === "ADMIN" || ADMIN_EMAILS.has(payload.email);
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
