/**
 * Measures dashboard API performance (GET /api/trips).
 *
 * Targets: Cold < 1.5s, Warm < 500ms
 *
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Log in at http://localhost:3000/login
 *   3. Copy cookie from DevTools → Application → Cookies → voyageai_at
 *   4. Run:
 *      COOKIE="voyageai_at=<your-token>" npx tsx scripts/measure-dashboard-perf.ts
 *
 * For cold cache test: npm run clear-image-cache first, then run this script.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const COOKIE = process.env.COOKIE;

async function measure(): Promise<{ totalMs: number; serverTiming?: string }> {
    const start = performance.now();
    const res = await fetch(`${BASE_URL}/api/trips`, {
        method: "GET",
        headers: COOKIE ? { Cookie: COOKIE.startsWith("voyageai_at=") ? COOKIE : `voyageai_at=${COOKIE}` } : {},
        credentials: "include",
    });
    const totalMs = Math.round(performance.now() - start);

    const serverTiming = res.headers.get("Server-Timing");
    const body = await res.json();

    if (!res.ok || !body?.success) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }

    return { totalMs, serverTiming: serverTiming ?? undefined };
}

async function main() {
    if (!COOKIE) {
        console.error("COOKIE env required. Copy voyageai_at from browser cookies after logging in.");
        console.error("Example: COOKIE=\"voyageai_at=eyJ...\" npx tsx scripts/measure-dashboard-perf.ts");
        process.exit(1);
    }

    console.log("Measuring GET /api/trips (dashboard data source)\n");
    console.log("Targets: Cold < 1.5s, Warm < 500ms\n");

    const runs: { totalMs: number; serverTiming?: string }[] = [];
    for (let i = 0; i < 3; i++) {
        try {
            const result = await measure();
            runs.push(result);
            const status = result.totalMs < 500 ? "✓" : result.totalMs < 1500 ? "~" : "✗";
            console.log(`Run ${i + 1}: ${result.totalMs}ms ${status}${result.serverTiming ? ` (${result.serverTiming})` : ""}`);
        } catch (err) {
            console.error(`Run ${i + 1} failed:`, err);
            process.exit(1);
        }
    }

    const avg = Math.round(runs.reduce((s, r) => s + r.totalMs, 0) / runs.length);
    const cold = runs[0].totalMs;
    const warm = runs.length > 1 ? Math.round(runs.slice(1).reduce((s, r) => s + r.totalMs, 0) / (runs.length - 1)) : cold;

    console.log("\n--- Summary ---");
    console.log(`First run (cold):  ${cold}ms ${cold < 1500 ? "✓" : "✗"} (target < 1.5s)`);
    console.log(`Avg warm runs:     ${warm}ms ${warm < 500 ? "✓" : "✗"} (target < 500ms)`);
    console.log(`Overall average:   ${avg}ms`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
