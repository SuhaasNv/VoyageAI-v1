const DEV_CSRF_FALLBACK = "dev-csrf-secret-do-not-use-in-production";

/**
 * CSRF HMAC secret for signing and verifying tokens.
 *
 * Read straight from `process.env` (not the cached `env` object) so Edge middleware
 * and Node API routes resolve the same value after `.env` changes and dev restarts.
 */
export function getCsrfSecret(): string {
    const raw = process.env.CSRF_SECRET;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length > 0) return trimmed;
    if (process.env.NODE_ENV !== "production") return DEV_CSRF_FALLBACK;
    throw new Error("CSRF_SECRET is required in production");
}
