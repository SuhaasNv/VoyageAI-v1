/**
 * Unit tests for src/tools/brightDataTool.ts
 *
 * Coverage:
 *  - Returns empty payload when BRIGHT_DATA_API_KEY is not set
 *  - Returns parsed BrightDataResultPayload on success
 *  - Falls back gracefully on non-OK HTTP response or fetch throw
 *  - Truncates output mapping strings to MAX_SNIPPET_CHARS
 *  - Query logic constructs
 *  - Empty results are cached with short TTL (brightdata.empty_result log)
 *  - Timeout triggers retry once only
 *  - Stale cached data triggers background refresh (non-blocking)
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

function mockFetchOk(body: unknown, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
    } as unknown as Response);
}

function mockFetchThrow(error: Error) {
    return vi.fn().mockRejectedValue(error);
}

function makeResults(count: number, prefix = "Result") {
    return Array.from({ length: count }, (_, i) => ({
        title: `${prefix} ${i + 1}`,
        snippet: `Snippet for ${prefix} ${i + 1}`,
    }));
}

describe("brightDataTool — no API key", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "");
        vi.stubEnv("REDIS_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("searchAttractions returns empty string without an API key", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text).toBe("");
        expect(result.status).toBe("failed");
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

describe("brightDataTool — successful responses", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
        // Disable Redis so the Bright Data cache layer is a no-op. Without this,
        // tests share state through real Redis and bleed results into one another.
        vi.stubEnv("REDIS_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns concatenated title+snippet from organic array", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: [{ title: "Senso-ji Temple", snippet: "Historic Buddhist temple in Asakusa." }] })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text).toContain("Senso-ji Temple");
        expect(result.text).toContain("Historic Buddhist temple in Asakusa.");
        expect(result.status).toBe("success");
    });

    it("falls back to results array when organic is absent", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ results: [{ title: "Shinjuku", description: "Vibrant district." }] })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text).toContain("Shinjuku");
        expect(result.text).toContain("Vibrant district.");
        expect(result.data.length).toBe(1);
    });

    it("returns empty string when organic and results are both absent", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetchOk({}));
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text).toBe("");
        expect(result.status).toBe("empty");
    });

    it("omits items where both title and body text are empty", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({
                organic: [
                    { title: "", snippet: "" },
                    { title: "Valid Title", snippet: "Valid body." },
                ],
            })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text).toContain("Valid Title");
        expect(result.text).not.toMatch(/^: |\\n: /);
    });

    it("truncates output to 2000 characters", async () => {
        const longSnippet = "x".repeat(3000);
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: [{ title: "T", snippet: longSnippet }] })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.text.length).toBeLessThanOrEqual(2000);
    });

    it("sends the API key as a Bearer token in the Authorization header", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: makeResults(1) })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        await searchAttractions("Paris");

        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer test-api-key");
    });
});

describe("brightDataTool — error handling", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
        // Disable Redis so the Bright Data cache layer is a no-op. Without this,
        // tests share state through real Redis and bleed results into one another.
        vi.stubEnv("REDIS_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns failed payload on non-OK HTTP response", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetchOk({}, 429));
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.status).toBe("failed");
        expect(result.text).toBe("");
    });

    it("returns failed payload when fetch throws a network error", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchThrow(new Error("Network error"))
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.status).toBe("failed");
        expect(result.text).toBe("");
    });
});

// ─── Empty result caching ─────────────────────────────────────────────────────

describe("brightDataTool — empty result caching", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
        // Disable Redis so the Bright Data cache layer is a no-op. Without this,
        // tests share state through real Redis and bleed results into one another.
        vi.stubEnv("REDIS_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("logs brightdata.empty_result when Bright Data returns no items", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({ organic: [] }),
            } as unknown as Response)
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        // Capture logInfo calls via console.log (logInfo writes to stdout)
        const logSpy = vi.spyOn(console, "log");
        const result = await searchAttractions("Nowhere City");

        expect(result.status).toBe("empty");
        expect(result.data).toHaveLength(0);
        // The brightdata.empty_result event must appear in structured output
        const logOutput = logSpy.mock.calls.flat().join(" ");
        expect(logOutput).toContain("brightdata.empty_result");
        logSpy.mockRestore();
    });
});

// ─── Timeout and retry behaviour ─────────────────────────────────────────────

describe("brightDataTool — timeout retry", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
        // Disable Redis so the Bright Data cache layer is a no-op. Without this,
        // tests share state through real Redis and bleed results into one another.
        vi.stubEnv("REDIS_URL", "");
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("retries exactly once on timeout and returns success from second attempt", async () => {
        let callCount = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // First call: hangs forever (timeout will fire via fake timers)
                return new Promise(() => {}) as Promise<Response>;
            }
            // Second call: resolves immediately with valid data
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    organic: [{ title: "Retry-Result Park", snippet: "Great place." }]
                }),
            } as Response);
        });

        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const logSpy = vi.spyOn(console, "log");

        // Start the call, advance timers to trigger the 10s first-attempt timeout,
        // then advance past the 8s retry window.
        const promise = searchAttractions("Slow City");
        await vi.advanceTimersByTimeAsync(10000); // fires Attempt-1 timeout (10s)
        await vi.advanceTimersByTimeAsync(8000);  // covers Attempt-2 window (8s)
        const result = await promise;

        expect(result.status).toBe("success");
        expect(result.data[0].name).toBe("Retry-Result Park");
        // Must have retried exactly once
        expect(callCount).toBe(2);

        const logOutput = logSpy.mock.calls.flat().join(" ");
        expect(logOutput).toContain("brightdata.timeout_retry");
        logSpy.mockRestore();
    });
});

// ─── Stale cache background refresh ──────────────────────────────────────────

describe("brightDataTool — stale cache background refresh", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
        // Disable Redis so the Bright Data cache layer is a no-op. Without this,
        // tests share state through real Redis and bleed results into one another.
        vi.stubEnv("REDIS_URL", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns stale cached data immediately and triggers non-blocking background refresh", async () => {
        const stalePayload = {
            data: {
                text: "Old Eiffel Tower snippet",
                data: [{ name: "Eiffel Tower", category: "attraction", source: "web", snippet: "Old snippet." }],
                status: "success",
            },
            // Simulate a cache entry that is 21 hours old (> 20h stale threshold)
            cachedAt: Date.now() - 21 * 60 * 60 * 1000,
        };

        // Patch getCached to return the stale payload — must happen BEFORE resetModules
        const cacheMod = await import("@/lib/ai/cache");
        vi.spyOn(cacheMod, "getBrightDataCached").mockResolvedValue(stalePayload as never);

        // Import the tool after the spy is installed (no resetModules — keeps spy active)
        const { searchAttractions } = await import("../brightDataTool");
        const logSpy = vi.spyOn(console, "log");

        const result = await searchAttractions("Paris");

        // Must return the stale result immediately without waiting for refresh
        expect(result.status).toBe("success");
        expect(result.data[0].name).toBe("Eiffel Tower");

        const logOutput = logSpy.mock.calls.flat().join(" ");
        expect(logOutput).toContain("brightdata.stale_refresh_triggered");

        // Allow background IIFE to settle (non-blocking — resolve within same tick)
        await Promise.resolve();

        logSpy.mockRestore();
    });
});
