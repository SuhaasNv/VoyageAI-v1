/**
 * tests/services/auth-cookies.test.ts
 *
 * Unit tests for cookie serialization in src/services/auth/cookies.ts.
 * These are pure string functions — no mocking required.
 */

import { describe, it, expect } from "vitest";
import {
    serializeRefreshTokenCookie,
    clearRefreshTokenCookie,
    serializeCsrfCookie,
    clearCsrfCookie,
    serializeAccessTokenCookie,
    clearAccessTokenCookie,
    serializeOAuthStateCookie,
    clearOAuthStateCookie,
    REFRESH_TOKEN_COOKIE,
    CSRF_TOKEN_COOKIE,
    ACCESS_TOKEN_COOKIE,
    OAUTH_STATE_COOKIE,
} from "@/services/auth/cookies";

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseCookieHeader(header: string): Record<string, string> {
    return Object.fromEntries(
        header.split(";").map((p) => {
            const [k, ...vs] = p.trim().split("=");
            return [k!.trim(), vs.join("=").trim()];
        })
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Refresh token cookie
// ═════════════════════════════════════════════════════════════════════════════

describe("serializeRefreshTokenCookie", () => {
    it("uses the correct cookie name", () => {
        const header = serializeRefreshTokenCookie("tok_abc");
        expect(header).toContain(REFRESH_TOKEN_COOKIE);
    });

    it("embeds the token value", () => {
        const header = serializeRefreshTokenCookie("raw-refresh-token");
        expect(header).toContain("raw-refresh-token");
    });

    it("sets HttpOnly", () => {
        const header = serializeRefreshTokenCookie("tok");
        expect(header.toLowerCase()).toContain("httponly");
    });

    it("scopes to /api/auth path", () => {
        const header = serializeRefreshTokenCookie("tok");
        expect(header).toContain("Path=/api/auth");
    });
});

describe("clearRefreshTokenCookie", () => {
    it("sets MaxAge=0", () => {
        const header = clearRefreshTokenCookie();
        expect(header).toContain("Max-Age=0");
    });

    it("uses the same cookie name", () => {
        const header = clearRefreshTokenCookie();
        expect(header).toContain(REFRESH_TOKEN_COOKIE);
    });

    it("sets empty value", () => {
        const header = clearRefreshTokenCookie();
        // Cookie value should be empty: name=;
        const parts  = parseCookieHeader(header);
        expect(parts[REFRESH_TOKEN_COOKIE]).toBe("");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// CSRF cookie
// ═════════════════════════════════════════════════════════════════════════════

describe("serializeCsrfCookie", () => {
    it("uses the CSRF cookie name", () => {
        const header = serializeCsrfCookie("csrf-token-xyz");
        expect(header).toContain(CSRF_TOKEN_COOKIE);
    });

    it("embeds the token value", () => {
        const header = serializeCsrfCookie("my-csrf-token");
        expect(header).toContain("my-csrf-token");
    });

    it("is NOT HttpOnly (must be JS-readable)", () => {
        const header = serializeCsrfCookie("tok");
        expect(header.toLowerCase()).not.toContain("httponly");
    });
});

describe("clearCsrfCookie", () => {
    it("sets MaxAge=0", () => {
        const header = clearCsrfCookie();
        expect(header).toContain("Max-Age=0");
    });

    it("uses the correct cookie name", () => {
        const header = clearCsrfCookie();
        expect(header).toContain(CSRF_TOKEN_COOKIE);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Access token cookie
// ═════════════════════════════════════════════════════════════════════════════

describe("serializeAccessTokenCookie", () => {
    it("uses the correct cookie name", () => {
        const header = serializeAccessTokenCookie("access-token-xyz");
        expect(header).toContain(ACCESS_TOKEN_COOKIE);
    });

    it("is HttpOnly", () => {
        const header = serializeAccessTokenCookie("access");
        expect(header.toLowerCase()).toContain("httponly");
    });

    it("uses SameSite=Lax", () => {
        const header = serializeAccessTokenCookie("access");
        expect(header).toContain("SameSite=Lax");
    });
});

describe("clearAccessTokenCookie", () => {
    it("sets MaxAge=0", () => {
        const header = clearAccessTokenCookie();
        expect(header).toContain("Max-Age=0");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// OAuth state cookie
// ═════════════════════════════════════════════════════════════════════════════

describe("serializeOAuthStateCookie", () => {
    it("uses the OAUTH_STATE_COOKIE name", () => {
        const header = serializeOAuthStateCookie("state-abc");
        expect(header).toContain(OAUTH_STATE_COOKIE);
    });

    it("embeds the state value", () => {
        const header = serializeOAuthStateCookie("my-state-value");
        expect(header).toContain("my-state-value");
    });

    it("is HttpOnly", () => {
        const header = serializeOAuthStateCookie("state");
        expect(header.toLowerCase()).toContain("httponly");
    });

    it("has a short MaxAge (≤ 600 seconds)", () => {
        const header = serializeOAuthStateCookie("state");
        const match  = header.match(/Max-Age=(\d+)/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBeLessThanOrEqual(600);
    });
});

describe("clearOAuthStateCookie", () => {
    it("sets MaxAge=0", () => {
        const header = clearOAuthStateCookie();
        expect(header).toContain("Max-Age=0");
    });
});
