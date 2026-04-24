/**
 * tests/lib/apiRequest.test.ts
 *
 * Unit tests for:
 *   - src/lib/api/readJsonResponse.ts  — readJsonApiResponse
 *   - src/lib/api/request.ts           — getClientIp, getBearerToken,
 *                                        getRefreshTokenFromCookie,
 *                                        getCsrfTokenFromCookie,
 *                                        getAuthContext, validateBody
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/infrastructure/logger", () => ({
    logError:      vi.fn(),
    logInfo:       vi.fn(),
    logStructured: vi.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { readJsonApiResponse } from "@/lib/api/readJsonResponse";
import {
    getClientIp,
    getBearerToken,
    getRefreshTokenFromCookie,
    getCsrfTokenFromCookie,
    getAuthContext,
    validateBody,
} from "@/lib/api/request";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(path: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(`http://localhost${path}`, { headers });
}

function makeResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// readJsonApiResponse
// ═════════════════════════════════════════════════════════════════════════════

describe("readJsonApiResponse", () => {
    it("returns ok=true and parsed data for a valid JSON response", async () => {
        const res = makeResponse('{"success":true,"data":{"id":1}}', 200);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.status).toBe(200);
            expect(result.data).toEqual({ success: true, data: { id: 1 } });
        }
    });

    it("returns ok=false for an empty body (HTTP 200)", async () => {
        const res = makeResponse("", 200);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
    });

    it("returns ok=false with empty body message (non-zero status)", async () => {
        const res = makeResponse("   ", 503);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.userMessage).toContain("503");
        }
    });

    it("returns ok=false for non-JSON body", async () => {
        const res = makeResponse("<html>error</html>", 500);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.userMessage).toContain("non-JSON");
        }
    });

    it("returns ok=false when JSON parses to an array (not an object)", async () => {
        const res = makeResponse("[1,2,3]", 200);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
    });

    it("returns ok=false when JSON parses to null", async () => {
        const res = makeResponse("null", 200);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
    });

    it("returns the correct status code in error result", async () => {
        const res = makeResponse("<error>", 503);
        const result = await readJsonApiResponse(res);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(503);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getClientIp
// ═════════════════════════════════════════════════════════════════════════════

describe("getClientIp", () => {
    it("returns x-real-ip when present", () => {
        const req = makeReq("/", { "x-real-ip": "1.2.3.4" });
        expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("returns first IP from x-forwarded-for", () => {
        const req = makeReq("/", { "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
        expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("falls back to 127.0.0.1 when no proxy headers", () => {
        const req = makeReq("/");
        expect(getClientIp(req)).toBe("127.0.0.1");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getBearerToken
// ═════════════════════════════════════════════════════════════════════════════

describe("getBearerToken", () => {
    it("extracts token from Bearer header", () => {
        const req = makeReq("/", { authorization: "Bearer my-jwt-token" });
        expect(getBearerToken(req)).toBe("my-jwt-token");
    });

    it("returns null when authorization header is absent", () => {
        const req = makeReq("/");
        expect(getBearerToken(req)).toBeNull();
    });

    it("returns null for non-Bearer auth (Basic)", () => {
        const req = makeReq("/", { authorization: "Basic dXNlcjpwYXNz" });
        expect(getBearerToken(req)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getRefreshTokenFromCookie
// ═════════════════════════════════════════════════════════════════════════════

describe("getRefreshTokenFromCookie", () => {
    it("extracts the refresh token from the cookie header", () => {
        const req = makeReq("/", { cookie: "voyageai_rt=refresh-token-xyz" });
        expect(getRefreshTokenFromCookie(req)).toBe("refresh-token-xyz");
    });

    it("returns null when the cookie is absent", () => {
        const req = makeReq("/");
        expect(getRefreshTokenFromCookie(req)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getCsrfTokenFromCookie
// ═════════════════════════════════════════════════════════════════════════════

describe("getCsrfTokenFromCookie", () => {
    it("extracts the CSRF token from the cookie header", () => {
        const req = makeReq("/", { cookie: "voyageai_csrf=csrf-token-abc" });
        expect(getCsrfTokenFromCookie(req)).toBe("csrf-token-abc");
    });

    it("returns null when cookie header is absent", () => {
        const req = makeReq("/");
        expect(getCsrfTokenFromCookie(req)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getAuthContext
// ═════════════════════════════════════════════════════════════════════════════

describe("getAuthContext", () => {
    it("returns null when no auth token is provided", () => {
        const req = makeReq("/api/test");
        expect(getAuthContext(req)).toBeNull();
    });

    it("returns null for an invalid Bearer token", () => {
        const req = makeReq("/api/test", { authorization: "Bearer not-a-real-jwt" });
        expect(getAuthContext(req)).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// validateBody
// ═════════════════════════════════════════════════════════════════════════════

describe("validateBody", () => {
    const schema = z.object({
        destination: z.string().min(1),
        budget:      z.number().positive(),
    });

    it("returns ok=true for a valid body", async () => {
        const req = new Request("http://localhost/api/test", {
            method:  "POST",
            headers: { "content-type": "application/json" },
            body:    JSON.stringify({ destination: "Tokyo", budget: 3000 }),
        });
        const result = await validateBody(req, schema);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.destination).toBe("Tokyo");
        }
    });

    it("returns ok=false for invalid JSON body", async () => {
        const req = new Request("http://localhost/api/test", {
            method:  "POST",
            headers: { "content-type": "application/json" },
            body:    "not valid json{",
        });
        const result = await validateBody(req, schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const body = await result.response.json();
            expect(body.error.code).toBe("BAD_REQUEST");
        }
    });

    it("returns ok=false for body failing Zod validation", async () => {
        const req = new Request("http://localhost/api/test", {
            method:  "POST",
            headers: { "content-type": "application/json" },
            body:    JSON.stringify({ destination: "", budget: -5 }),
        });
        const result = await validateBody(req, schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(422);
        }
    });
});
