#!/usr/bin/env npx tsx
/**
 * Health check script — bruteforce all API health points.
 * Run with: npx tsx scripts/health-check.ts
 * Requires: dev server running at http://localhost:3000
 */

const BASE = "http://localhost:3000";

type CheckResult = { status: "ok" | "fail"; statusCode?: number; message?: string };

async function runCheck(
    name: string,
    method: string,
    path: string,
    options?: { body?: object; headers?: Record<string, string> }
): Promise<CheckResult> {
    try {
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
            body: options?.body ? JSON.stringify(options.body) : undefined,
        });
        // 2xx = success, 401/403 = auth required, 400 = invalid input (server is up)
        const ok = res.ok || [400, 401, 403].includes(res.status);
        return ok
            ? { status: "ok", statusCode: res.status }
            : { status: "fail", statusCode: res.status, message: await res.text().catch(() => "") };
    } catch (e) {
        return { status: "fail", message: (e as Error).message };
    }
}

async function main() {
    console.log("\n=== VoyageAI Health Check ===\n");

    const checks: Array<{ name: string; method: string; path: string; auth?: boolean }> = [
        { name: "CSRF token", method: "GET", path: "/api/auth/csrf" },
        { name: "Landing (public)", method: "POST", path: "/api/ai/landing", auth: false },
        { name: "Login (expect 400)", method: "POST", path: "/api/auth/login" },
        { name: "Register (expect 400)", method: "POST", path: "/api/auth/register" },
        { name: "Trips list (expect 401)", method: "GET", path: "/api/trips" },
        { name: "Profile (expect 401)", method: "GET", path: "/api/profile" },
        { name: "Preferences (expect 401)", method: "GET", path: "/api/preferences" },
        { name: "Notifications (expect 401)", method: "GET", path: "/api/notifications" },
    ];

    let passed = 0;
    let failed = 0;

    for (const c of checks) {
        const result = await runCheck(c.name, c.method, c.path, c.auth === false ? { body: {} } : undefined);
        const icon = result.status === "ok" ? "✓" : "✗";
        const code = result.statusCode ? ` [${result.statusCode}]` : "";
        console.log(`${icon} ${c.name}${code}`);
        if (result.status === "ok") passed++;
        else {
            failed++;
            if (result.message) console.log(`  └─ ${result.message.slice(0, 80)}`);
        }
    }

    console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error("Health check failed:", e);
    process.exit(1);
});
