const DEV_CSRF_FALLBACK = "dev-csrf-secret-do-not-use-in-production";

/** Env key built at runtime so Turbopack/Webpack cannot replace it with a stale empty inline. */
function readCsrfSecretFromProcessEnv(): string | undefined {
    if (typeof process === "undefined" || !process.env) return undefined;
    const record = process.env as Record<string, string | undefined>;
    const key = ["CSRF", "SECRET"].join("_");
    const dynamic = record[key];
    if (typeof dynamic === "string" && dynamic.trim()) return dynamic.trim();
    const direct = record.CSRF_SECRET;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    return undefined;
}

/**
 * CSRF HMAC secret for signing and verifying tokens.
 *
 * Uses indirect `process.env` access so Edge middleware reads the same runtime value
 * as Node API routes (avoids empty-string inlining mismatches with Turbopack).
 */
export function getCsrfSecret(): string {
    const trimmed = readCsrfSecretFromProcessEnv();
    if (trimmed) return trimmed;
    if (process.env.NODE_ENV !== "production") return DEV_CSRF_FALLBACK;
    throw new Error("CSRF_SECRET is required in production");
}
