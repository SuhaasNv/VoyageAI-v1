/**
 * tests/lib/requestContext.test.ts
 *
 * Unit tests for src/lib/requestContext.ts:
 *   - getRequestId, getRequestPathname — return null outside context
 *   - runWithRequestContext — propagates requestId and pathname into async scope
 */

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
    getRequestId,
    getRequestPathname,
    runWithRequestContext,
} from "@/lib/requestContext";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeRequest(path: string, requestId?: string): NextRequest {
    const url = `http://localhost${path}`;
    const headers: HeadersInit = requestId
        ? { "x-request-id": requestId }
        : {};
    return new NextRequest(url, { headers });
}

// ═════════════════════════════════════════════════════════════════════════════
// Outside context
// ═════════════════════════════════════════════════════════════════════════════

describe("getRequestId / getRequestPathname — outside context", () => {
    it("getRequestId returns null when not inside runWithRequestContext", () => {
        expect(getRequestId()).toBeNull();
    });

    it("getRequestPathname returns null when not inside runWithRequestContext", () => {
        expect(getRequestPathname()).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// runWithRequestContext
// ═════════════════════════════════════════════════════════════════════════════

describe("runWithRequestContext", () => {
    it("makes requestId available inside the callback", async () => {
        const req = makeRequest("/api/test", "req-abc123");
        let capturedId: string | null = null;

        await runWithRequestContext(req, async () => {
            capturedId = getRequestId();
        });

        expect(capturedId).toBe("req-abc123");
    });

    it("makes pathname available inside the callback", async () => {
        const req = makeRequest("/api/ai/itinerary-flow/planner");
        let capturedPath: string | null = null;

        await runWithRequestContext(req, async () => {
            capturedPath = getRequestPathname();
        });

        expect(capturedPath).toBe("/api/ai/itinerary-flow/planner");
    });

    it("requestId is null inside callback when header is absent", async () => {
        const req = makeRequest("/api/test"); // no x-request-id header
        let capturedId: string | null = "NOT_NULL";

        await runWithRequestContext(req, async () => {
            capturedId = getRequestId();
        });

        expect(capturedId).toBeNull();
    });

    it("context does not bleed outside the callback scope", async () => {
        const req = makeRequest("/api/test", "req-xyz");

        await runWithRequestContext(req, async () => {
            // inside — value is set
            expect(getRequestId()).toBe("req-xyz");
        });

        // outside — should be null again
        expect(getRequestId()).toBeNull();
    });

    it("returns the value returned by the callback function", async () => {
        const req = makeRequest("/api/test", "req-1");
        const result = await runWithRequestContext(req, async () => 42);
        expect(result).toBe(42);
    });

    it("nested contexts isolate correctly", async () => {
        const req1 = makeRequest("/api/one", "id-one");
        const req2 = makeRequest("/api/two", "id-two");

        await runWithRequestContext(req1, async () => {
            expect(getRequestId()).toBe("id-one");

            await runWithRequestContext(req2, async () => {
                expect(getRequestId()).toBe("id-two");
            });

            // outer context restored after inner finishes
            expect(getRequestId()).toBe("id-one");
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// isAdminPayload (from admin.ts)
// ═════════════════════════════════════════════════════════════════════════════

import { isAdminPayload, requireAdminApiAuth, AdminAuthError } from "@/lib/admin";

// ─── Mock logger + auth deps ──────────────────────────────────────────────────
// requireAdminApiAuth calls getAuthContext → verifyAccessToken which needs JWT_SECRET.
// We mock the entire request.ts module for the requireAdminApiAuth tests so we can
// control what getAuthContext returns without real token signing.

const { mockGetAuthContext, mockUnauthorized, mockForbidden } = vi.hoisted(() => ({
    mockGetAuthContext: vi.fn(),
    mockUnauthorized:   vi.fn(() => new Response(null, { status: 401 })),
    mockForbidden:      vi.fn(() => new Response(null, { status: 403 })),
}));

vi.mock("@/lib/api/request", () => ({
    getAuthContext: mockGetAuthContext,
}));

vi.mock("@/lib/api/response", () => ({
    unauthorizedResponse: mockUnauthorized,
    forbiddenResponse:    mockForbidden,
}));

// ═════════════════════════════════════════════════════════════════════════════
// AdminAuthError
// ═════════════════════════════════════════════════════════════════════════════

describe("AdminAuthError", () => {
    it("is an instance of Error", () => {
        const err = new AdminAuthError("UNAUTHENTICATED");
        expect(err).toBeInstanceOf(Error);
    });

    it("sets code to UNAUTHENTICATED", () => {
        const err = new AdminAuthError("UNAUTHENTICATED");
        expect(err.code).toBe("UNAUTHENTICATED");
    });

    it("sets code to FORBIDDEN", () => {
        const err = new AdminAuthError("FORBIDDEN");
        expect(err.code).toBe("FORBIDDEN");
    });

    it("message equals the code", () => {
        const err = new AdminAuthError("FORBIDDEN");
        expect(err.message).toBe("FORBIDDEN");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// requireAdminApiAuth
// ═════════════════════════════════════════════════════════════════════════════

describe("requireAdminApiAuth", () => {
    const adminUser = { sub: "admin-1", email: "admin@voyageai.com", role: "USER" };
    const regularUser = { sub: "user-1", email: "attacker@evil.com", role: "USER" };

    it("returns ok=true with auth for a valid admin user", () => {
        mockGetAuthContext.mockReturnValue({ user: adminUser });
        const req = new NextRequest("http://localhost/admin/api/test");
        const result = requireAdminApiAuth(req);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.auth.user).toEqual(adminUser);
        }
    });

    it("returns ok=false with 401 when no auth context", () => {
        mockGetAuthContext.mockReturnValue(null);
        const req = new NextRequest("http://localhost/admin/api/test");
        const result = requireAdminApiAuth(req);
        expect(result.ok).toBe(false);
        expect(mockUnauthorized).toHaveBeenCalled();
    });

    it("returns ok=false with 403 when user is not admin", () => {
        mockGetAuthContext.mockReturnValue({ user: regularUser });
        const req = new NextRequest("http://localhost/admin/api/test");
        const result = requireAdminApiAuth(req);
        expect(result.ok).toBe(false);
        expect(mockForbidden).toHaveBeenCalled();
    });

    it("returns ok=true for user with role=ADMIN regardless of email", () => {
        mockGetAuthContext.mockReturnValue({ user: { ...regularUser, role: "ADMIN" } });
        const req = new NextRequest("http://localhost/admin/api/test");
        const result = requireAdminApiAuth(req);
        expect(result.ok).toBe(true);
    });
});

describe("isAdminPayload", () => {
    const base = { sub: "user-1", email: "alice@other.com", role: "user" };

    it("returns true for role=ADMIN regardless of email", () => {
        expect(isAdminPayload({ ...base, role: "ADMIN" })).toBe(true);
    });

    it("returns true for hardcoded admin email (suhaas@voyageai.com)", () => {
        expect(isAdminPayload({ ...base, email: "suhaas@voyageai.com" })).toBe(true);
    });

    it("returns true for hardcoded admin email (admin@voyageai.com)", () => {
        expect(isAdminPayload({ ...base, email: "admin@voyageai.com" })).toBe(true);
    });

    it("is case-insensitive for email comparison", () => {
        expect(isAdminPayload({ ...base, email: "SUHAAS@VOYAGEAI.COM" })).toBe(true);
    });

    it("returns false for a non-admin user with role=user", () => {
        expect(isAdminPayload({ ...base, email: "alice@other.com", role: "user" })).toBe(false);
    });

    it("returns false for an unknown email and non-ADMIN role", () => {
        expect(isAdminPayload({ ...base, email: "attacker@evil.com", role: "user" })).toBe(false);
    });
});
