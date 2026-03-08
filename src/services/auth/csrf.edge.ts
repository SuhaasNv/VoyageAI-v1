/**
 * lib/auth/csrf.edge.ts
 *
 * Edge Runtime–compatible CSRF verification using the Web Crypto API.
 */

import { env } from "@/infrastructure/env";

/**
 * Token format: `<nonce>.<hmac-hex>`
 *
 * - generateCsrfToken()  (server-only; used inside API route handlers, not edge middleware)
 * - verifyCsrfToken()    (edge-safe; used by middleware)
 *
 * Both use SubtleCrypto (HMAC-SHA-256) instead of Node.js `crypto`,
 * making this module importable in the Next.js Edge Runtime.
 */

const CSRF_SEPARATOR = ".";

async function importHmacKey(secret: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

function bufToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBuf(hex: string): Uint8Array {
    const len = hex.length;
    const buf = new Uint8Array(len / 2);
    for (let i = 0; i < len; i += 2) {
        buf[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return buf;
}

/**
 * Generate a signed CSRF token: `<nonce>.<hmac-hex>`
 *
 * NOTE: Uses `crypto.getRandomValues` which is available in Edge and Node ≥ 19.
 * For Node < 19 API routes, use generateCsrfToken() from csrf.ts instead.
 */
export async function generateCsrfTokenEdge(): Promise<string> {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = bufToHex(nonceBytes.buffer);
    const secret = env.CSRF_SECRET;

    const key = await importHmacKey(secret);
    const enc = new TextEncoder();
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(nonce));
    const hmac = bufToHex(sig);

    return `${nonce}${CSRF_SEPARATOR}${hmac}`;
}

/**
 * Verify a signed CSRF token using a constant-time HMAC comparison.
 * Safe to call from Next.js Edge Middleware.
 *
 * Returns `true` if the token is structurally valid and the HMAC matches.
 * Returns `false` on any error (wrong format, wrong secret, tampered value).
 */
export async function verifyCsrfTokenEdge(token: string): Promise<boolean> {
    try {
        const separatorIdx = token.indexOf(CSRF_SEPARATOR);
        if (separatorIdx === -1) return false;

        const nonce = token.slice(0, separatorIdx);
        const providedHmac = token.slice(separatorIdx + 1);

        if (!nonce || !providedHmac) return false;
        // HMAC-SHA-256 hex digest is always 64 characters
        if (providedHmac.length !== 64) return false;

        const secret = env.CSRF_SECRET;
        const key = await importHmacKey(secret);
        const enc = new TextEncoder();

        // Use SubtleCrypto verify for constant-time comparison.
        // Cast to ArrayBuffer to satisfy strict DOM lib BufferSource constraints.
        const providedBytes = hexToBuf(providedHmac);
        return await crypto.subtle.verify(
            "HMAC",
            key,
            providedBytes.buffer as ArrayBuffer,
            enc.encode(nonce)
        );
    } catch {
        return false;
    }
}
