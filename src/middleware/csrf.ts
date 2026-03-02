/**
 * middleware/csrf.ts
 *
 * Edge Runtime–compatible CSRF verification middleware.
 *
 * Implements the Double Submit Cookie pattern with HMAC signature verification:
 *  1. Read the `X-CSRF-Token` request header.
 *  2. Read the signed CSRF cookie (`voyageai_csrf`).
 *  3. Reject if either is absent or they do not match.
 *  4. Verify the HMAC signature using SubtleCrypto (constant-time).
 *  5. Pass through (`null`) only when every check passes.
 *
 * Applied to: POST, PUT, PATCH, DELETE on /api/* routes.
 * Exempt from: routes that issue the token (login, register, refresh).
 *
 * EDGE RUNTIME CONSTRAINTS:
 *  - No Node.js built-ins — uses Web Crypto API (SubtleCrypto) only.
 *  - No third-party crypto libraries.
 */

import { NextRequest, NextResponse } from "next/server";
import { CSRF_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { env } from "@/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CSRF_HEADER = "x-csrf-token";
const CSRF_SEPARATOR = ".";

/** HTTP methods that mutate server state and therefore require a CSRF token. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Paths exempt from CSRF enforcement.
 *
 * Includes:
 *  - Auth endpoints that issue the token (token doesn't exist yet)
 *  - /api/ai/landing — public endpoint; unauthenticated users have no prior
 *    CSRF cookie and the route never mutates the DB for anonymous callers.
 */
const EXEMPT_PATHS = new Set([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/ai/landing",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (Edge-safe)
// ─────────────────────────────────────────────────────────────────────────────

async function importHmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );
}

function hexToUint8Array(hex: string): Uint8Array {
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        buf[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return buf;
}

/**
 * Verify the HMAC-SHA-256 signature embedded in a CSRF token.
 * Token format: `<nonce>.<hmac-hex>`
 *
 * Uses `SubtleCrypto.verify` for constant-time comparison — safe against
 * timing side-channel attacks.
 *
 * @returns `true` if the signature is valid; `false` on any failure.
 */
async function verifyHmacSignature(token: string): Promise<boolean> {
    try {
        const separatorIdx = token.indexOf(CSRF_SEPARATOR);
        if (separatorIdx === -1) return false;

        const nonce = token.slice(0, separatorIdx);
        const providedHmac = token.slice(separatorIdx + 1);

        if (!nonce || !providedHmac) return false;

        // HMAC-SHA-256 hex digest is always 64 hex characters (32 bytes).
        if (providedHmac.length !== 64) return false;

        const secret = env.CSRF_SECRET;
        const key = await importHmacKey(secret);
        const signatureBytes = hexToUint8Array(providedHmac);

        return await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBytes.buffer as ArrayBuffer,
            new TextEncoder().encode(nonce)
        );
    } catch {
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consistent rejection response
// ─────────────────────────────────────────────────────────────────────────────

function csrfRejected(reason?: string): NextResponse {
    // Use console.error (not log) so CSRF rejections appear as errors in edge logs.
    if (reason) console.error(`[CSRF] Rejected: ${reason}`);
    return NextResponse.json(
        { error: "Invalid CSRF token" },
        { status: 403 }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSRF verification middleware.
 *
 * Returns a `NextResponse` (403) when the request should be rejected.
 * Returns `null` when the request passes all CSRF checks and should proceed.
 *
 * The caller is responsible for:
 *  - Checking whether the route and method are in scope (see guards below).
 *  - Returning the `NextResponse` if non-null.
 *
 * @example
 * ```ts
 * const csrfResult = await checkCsrf(req);
 * if (csrfResult) return csrfResult;
 * ```
 */
export async function checkCsrf(req: NextRequest): Promise<NextResponse | null> {
    const { pathname } = req.nextUrl;

    // Only enforce on /api/* routes
    if (!pathname.startsWith("/api/")) return null;

    // Only enforce on state-mutating methods
    if (!MUTATING_METHODS.has(req.method)) return null;

    // Skip endpoints that issue the token
    if (EXEMPT_PATHS.has(pathname)) return null;

    const csrfHeader = req.headers.get(CSRF_HEADER);
    const csrfCookie = req.cookies.get(CSRF_TOKEN_COOKIE)?.value ?? null;

    // Both token sources must be present
    if (!csrfHeader) return csrfRejected("Missing CSRF header");
    if (!csrfCookie) return csrfRejected("Missing CSRF cookie");

    // Token values must match exactly (double-submit cookie pattern)
    if (csrfHeader !== csrfCookie) return csrfRejected("CSRF header and cookie mismatch");

    // HMAC signature must be cryptographically valid
    const isValid = await verifyHmacSignature(csrfHeader);
    if (!isValid) return csrfRejected("Invalid HMAC signature");

    return null;
}
