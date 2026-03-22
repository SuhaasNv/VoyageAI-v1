/**
 * Unit tests for src/tools/brightDataTool.ts
 *
 * Coverage:
 *  - Returns empty string when BRIGHT_DATA_API_KEY is not set
 *  - Returns concatenated snippets from organic / results arrays on success
 *  - Falls back to empty string on non-OK HTTP response
 *  - Falls back to empty string when fetch throws
 *  - Truncates output to MAX_SNIPPET_CHARS (2000 chars)
 *  - Handles missing title/snippet/description fields gracefully
 *  - searchAttractions / searchHotels / searchRestaurants construct sensible queries
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

// ─── fetch mock setup ─────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("brightDataTool — no API key", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("searchAttractions returns empty string without an API key", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toBe("");
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});

describe("brightDataTool — successful responses", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
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

        expect(result).toContain("Senso-ji Temple");
        expect(result).toContain("Historic Buddhist temple in Asakusa.");
    });

    it("falls back to results array when organic is absent", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ results: [{ title: "Shinjuku", description: "Vibrant district." }] })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toContain("Shinjuku");
        expect(result).toContain("Vibrant district.");
    });

    it("returns empty string when organic and results are both absent", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetchOk({}));
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toBe("");
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

        expect(result).toContain("Valid Title");
        // An item with both title and body empty produces an empty string and is
        // filtered out — the result should not start with ": " (title-less colon).
        expect(result).not.toMatch(/^: |\\n: /);
    });

    it("truncates output to 2000 characters", async () => {
        const longSnippet = "x".repeat(3000);
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: [{ title: "T", snippet: longSnippet }] })
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result.length).toBeLessThanOrEqual(2000);
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

    it("searchHotels includes the destination in the query body", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: makeResults(1) })
        );
        vi.resetModules();
        const { searchHotels } = await import("../brightDataTool");

        await searchHotels("Barcelona", "luxury");

        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string) as { query: string };
        expect(body.query).toContain("Barcelona");
        expect(body.query).toContain("luxury");
    });

    it("searchRestaurants includes the destination in the query body", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchOk({ organic: makeResults(1) })
        );
        vi.resetModules();
        const { searchRestaurants } = await import("../brightDataTool");

        await searchRestaurants("Rome");

        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(init.body as string) as { query: string };
        expect(body.query).toContain("Rome");
    });
});

describe("brightDataTool — error handling", () => {
    beforeEach(() => {
        vi.stubEnv("BRIGHT_DATA_API_KEY", "test-api-key");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("returns empty string on non-OK HTTP response", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetchOk({}, 429));
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toBe("");
    });

    it("returns empty string when fetch throws a network error", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            mockFetchThrow(new Error("Network error"))
        );
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toBe("");
    });

    it("returns empty string when fetch times out (AbortError)", async () => {
        const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
        vi.spyOn(globalThis, "fetch").mockImplementation(mockFetchThrow(abortErr));
        vi.resetModules();
        const { searchAttractions } = await import("../brightDataTool");

        const result = await searchAttractions("Tokyo");

        expect(result).toBe("");
    });
});
