/**
 * Bright Data Startup Health Check
 *
 * Call `initBrightDataHealthCheck()` once at server startup (e.g. from
 * Next.js instrumentation.ts or your app bootstrap).
 *
 * Behaviour:
 *  - Makes a lightweight probe to the Bright Data API.
 *  - If the response is HTTP 404 (SERP product not provisioned / endpoint mismatch),
 *    sets BRIGHTDATA_DISABLED = true and logs a one-time warning.
 *  - All subsequent calls to `isBrightDataDisabled()` return true immediately.
 *  - Any other error (network, timeout, non-404 HTTP) is treated as transient;
 *    the flag stays false and normal per-request error handling takes over.
 */

import { logError, logInfo } from "@/infrastructure/logger";

const BRIGHT_DATA_API_URL = "https://api.brightdata.com/request";
const BRIGHT_DATA_ZONE    = "voyageai_serp";

/** Module-level flag — set once at startup, read on every request. */
let BRIGHTDATA_DISABLED = false;

/** Guard to ensure the health probe runs at most once per process lifetime. */
let healthCheckRan = false;

/**
 * Returns true if Bright Data is known to be misconfigured (404 on startup probe).
 * When true, callers should skip Bright Data entirely and fall back to LLM-only mode.
 */
export function isBrightDataDisabled(): boolean {
    return BRIGHTDATA_DISABLED;
}

/**
 * Performs a single lightweight Bright Data probe on server start.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initBrightDataHealthCheck(): Promise<void> {
    if (healthCheckRan) return;
    healthCheckRan = true;

    const apiKey = process.env.BRIGHT_DATA_API_KEY;
    if (!apiKey) {
        logInfo("brightdata.health_check_skipped", { reason: "no_api_key" });
        return;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(BRIGHT_DATA_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            // Minimal probe — 1 result only to reduce billing impact
            body: JSON.stringify({
                zone: BRIGHT_DATA_ZONE,
                url: "https://www.google.com/search?q=health+check&num=1",
                format: "raw",
            }),
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.status === 404) {
            BRIGHTDATA_DISABLED = true;
            logError("brightdata.startup_misconfigured", {
                statusCode: 404,
                message:
                    "SERP product not provisioned or endpoint mismatch. " +
                    "All Bright Data calls will be skipped. " +
                    "Falling back to LLM-only mode.",
            });
            return;
        }

        logInfo("brightdata.startup_healthy", { statusCode: response.status });
    } catch (err: any) {
        const isAbort = err?.name === "AbortError";
        // Transient errors (network, timeout) — do NOT disable the integration.
        logInfo(
            isAbort
                ? "brightdata.startup_probe_timeout"
                : "brightdata.startup_probe_error",
            { error: String(err?.message ?? err) }
        );
    }
}
