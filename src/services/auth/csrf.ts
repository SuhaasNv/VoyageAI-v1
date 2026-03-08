/**
 * lib/auth/csrf.ts
 *
 * CSRF protection using the "Double Submit Cookie" pattern.
 *
 * Flow:
 *  1. On login/register success, server issues a signed CSRF token in a
 *     JS-readable cookie.
 *  2. Every state-mutating request must include the same token in the
 *     X-CSRF-Token header.
 *  3. Middleware verifies header value === signed cookie value.
 *
 * The token is HMAC-signed so it cannot be forged without the server secret.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "@/infrastructure/env";

/** Generate a new CSRF token: `<nonce>.<hmac>` */
export function generateCsrfToken(): string {
    const nonce = randomBytes(16).toString("hex");
    const secret = env.CSRF_SECRET;
    const hmac = createHmac("sha256", secret).update(nonce).digest("hex");
    return `${nonce}.${hmac}`;
}

/**
 * Verify that a CSRF token is valid.
 * Performs timing-safe comparison to prevent timing attacks.
 */
export function verifyCsrfToken(token: string): boolean {
    try {
        const [nonce, providedHmac] = token.split(".");
        if (!nonce || !providedHmac) return false;

        const secret = env.CSRF_SECRET;
        const expectedHmac = createHmac("sha256", secret).update(nonce).digest("hex");

        const a = Buffer.from(providedHmac, "hex");
        const b = Buffer.from(expectedHmac, "hex");

        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}
