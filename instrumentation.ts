/**
 * Next.js instrumentation hook — runs once per server process on startup.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Runs the Bright Data startup health probe so that a misconfigured zone
 * (HTTP 404) is detected immediately and all subsequent requests skip the
 * integration entirely, instead of discovering the failure per-request.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { initBrightDataHealthCheck } = await import(
            "./src/tools/brightDataHealthCheck"
        );
        await initBrightDataHealthCheck();
    }
}
