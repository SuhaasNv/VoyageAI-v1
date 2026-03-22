/**
 * Unit tests for src/lib/admin.ts
 *
 * Coverage:
 *  - isAdminPayload: role-based and email-based admin detection
 *  - isAdminPayload: case-insensitive email matching
 *  - ADMIN_EMAILS: hardcoded defaults always present
 *  - ADMIN_EMAILS: ADMIN_EMAILS env var adds extra addresses
 *  - ADMIN_EMAILS: env var entries are normalized to lowercase
 *  - ADMIN_EMAILS: empty/whitespace env entries are ignored
 *  - requireAdminApiAuth: returns 401 when unauthenticated
 *  - requireAdminApiAuth: returns 403 when authenticated but not admin
 *  - requireAdminApiAuth: returns auth context when caller is admin
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import type { AccessTokenPayload } from "@/services/auth/tokens";
import type { NextRequest } from "next/server";

// next/headers is a Next.js server-only API. Mock it so the module under test
// can be imported in the Node test environment without a live request context.
vi.mock("next/headers", () => ({
    cookies: vi.fn().mockResolvedValue({ get: vi.fn(() => undefined) }),
}));

// Mock getAuthContext so requireAdminApiAuth tests can control auth state
// without constructing real JWTs or NextRequest objects.
vi.mock("@/lib/api/request", () => ({
    getAuthContext: vi.fn(),
}));

// Static import — uses the default env (ADMIN_EMAILS env var is not set).
import { isAdminPayload, ADMIN_EMAILS, requireAdminApiAuth } from "../admin";
import { getAuthContext } from "@/lib/api/request";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<AccessTokenPayload> = {}): AccessTokenPayload {
    return {
        sub: "user-123",
        email: "user@example.com",
        role: "USER",
        ...overrides,
    };
}

// ─── isAdminPayload ───────────────────────────────────────────────────────────

describe("isAdminPayload — role-based", () => {
    it("returns true when role is ADMIN", () => {
        expect(isAdminPayload(makePayload({ role: "ADMIN" }))).toBe(true);
    });

    it("returns false for role USER with non-admin email", () => {
        expect(isAdminPayload(makePayload({ role: "USER", email: "user@example.com" }))).toBe(false);
    });

    it("returns false for role MODERATOR with non-admin email", () => {
        expect(isAdminPayload(makePayload({ role: "MODERATOR", email: "mod@example.com" }))).toBe(false);
    });
});

describe("isAdminPayload — email allow-list", () => {
    it("returns true for the hardcoded admin@voyageai.com address", () => {
        expect(isAdminPayload(makePayload({ email: "admin@voyageai.com" }))).toBe(true);
    });

    it("returns true for the hardcoded suhaas@voyageai.com address", () => {
        expect(isAdminPayload(makePayload({ email: "suhaas@voyageai.com" }))).toBe(true);
    });

    it("matches emails case-insensitively (all caps)", () => {
        expect(isAdminPayload(makePayload({ email: "ADMIN@VOYAGEAI.COM" }))).toBe(true);
    });

    it("matches emails case-insensitively (mixed case)", () => {
        expect(isAdminPayload(makePayload({ email: "Admin@VoyageAI.Com" }))).toBe(true);
    });

    it("returns false for an address that is not in the allow-list", () => {
        expect(isAdminPayload(makePayload({ email: "stranger@example.com" }))).toBe(false);
    });
});

// ─── ADMIN_EMAILS set (hardcoded defaults) ────────────────────────────────────

describe("ADMIN_EMAILS — hardcoded defaults", () => {
    it("contains suhaas@voyageai.com", () => {
        expect(ADMIN_EMAILS.has("suhaas@voyageai.com")).toBe(true);
    });

    it("contains admin@voyageai.com", () => {
        expect(ADMIN_EMAILS.has("admin@voyageai.com")).toBe(true);
    });
});

// ─── ADMIN_EMAILS set (env var) ───────────────────────────────────────────────
// These tests reload the module after setting ADMIN_EMAILS so the
// buildAdminEmailSet() function runs with the new env value.

describe("ADMIN_EMAILS — ADMIN_EMAILS env var", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("includes extra emails from ADMIN_EMAILS (comma-separated)", async () => {
        vi.stubEnv("ADMIN_EMAILS", "ops@example.com,support@example.com");
        vi.resetModules();
        const { ADMIN_EMAILS: freshSet } = await import("../admin");

        expect(freshSet.has("ops@example.com")).toBe(true);
        expect(freshSet.has("support@example.com")).toBe(true);
    });

    it("normalizes env-var emails to lowercase", async () => {
        vi.stubEnv("ADMIN_EMAILS", "OPS@EXAMPLE.COM, Support@Example.com");
        vi.resetModules();
        const { ADMIN_EMAILS: freshSet } = await import("../admin");

        expect(freshSet.has("ops@example.com")).toBe(true);
        expect(freshSet.has("support@example.com")).toBe(true);
        // Original casing should NOT be in the set
        expect(freshSet.has("OPS@EXAMPLE.COM")).toBe(false);
    });

    it("still includes hardcoded defaults when env var is set", async () => {
        vi.stubEnv("ADMIN_EMAILS", "extra@example.com");
        vi.resetModules();
        const { ADMIN_EMAILS: freshSet } = await import("../admin");

        expect(freshSet.has("admin@voyageai.com")).toBe(true);
        expect(freshSet.has("suhaas@voyageai.com")).toBe(true);
    });

    it("ignores empty and whitespace-only entries in ADMIN_EMAILS", async () => {
        vi.stubEnv("ADMIN_EMAILS", " , ,  ,  ");
        vi.resetModules();
        const { ADMIN_EMAILS: freshSet } = await import("../admin");

        // Only the 2 hardcoded defaults should be present
        expect(freshSet.size).toBe(2);
    });

    it("handles an unset ADMIN_EMAILS env var gracefully", async () => {
        vi.stubEnv("ADMIN_EMAILS", "");
        vi.resetModules();
        const { ADMIN_EMAILS: freshSet } = await import("../admin");

        expect(freshSet.size).toBe(2);
    });
});

// ─── requireAdminApiAuth ──────────────────────────────────────────────────────

/** Minimal stand-in for NextRequest — only passed through to the mocked getAuthContext. */
const fakeReq = {} as NextRequest;

describe("requireAdminApiAuth", () => {
    afterEach(() => {
        vi.mocked(getAuthContext).mockReset();
    });

    it("returns ok=false with a 401 response when unauthenticated", () => {
        vi.mocked(getAuthContext).mockReturnValue(null);

        const result = requireAdminApiAuth(fakeReq);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(401);
    });

    it("returns ok=false with a 403 response when authenticated but not admin", () => {
        vi.mocked(getAuthContext).mockReturnValue({
            user: makePayload({ role: "USER", email: "user@example.com" }),
        });

        const result = requireAdminApiAuth(fakeReq);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(403);
    });

    it("returns ok=true with auth context when caller has role ADMIN", () => {
        const user = makePayload({ role: "ADMIN" });
        vi.mocked(getAuthContext).mockReturnValue({ user });

        const result = requireAdminApiAuth(fakeReq);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.auth.user).toEqual(user);
    });

    it("returns ok=true with auth context when caller is in the email allow-list", () => {
        const user = makePayload({ role: "USER", email: "admin@voyageai.com" });
        vi.mocked(getAuthContext).mockReturnValue({ user });

        const result = requireAdminApiAuth(fakeReq);

        expect(result.ok).toBe(true);
    });

    it("returns ok=false when email is admin-like but wrong domain", () => {
        vi.mocked(getAuthContext).mockReturnValue({
            user: makePayload({ role: "USER", email: "admin@other.com" }),
        });

        const result = requireAdminApiAuth(fakeReq);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(403);
    });
});
