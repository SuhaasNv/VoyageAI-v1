/**
 * tests/services/auth-tokens.test.ts
 *
 * Unit tests for JWT token lifecycle in src/services/auth/tokens.ts:
 *   - signAccessToken / verifyAccessToken
 *   - signRefreshToken / verifyRefreshToken
 *   - hashToken
 *   - newTokenFamily
 *
 * Uses the real JWT library and crypto — no mocking needed.
 * JWT secrets come from .env loaded by tests/setup.ts.
 */

import { describe, it, expect } from "vitest";
import {
    signAccessToken,
    verifyAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    hashToken,
    newTokenFamily,
    ACCESS_TOKEN_EXPIRY_MS,
    REFRESH_TOKEN_EXPIRY_MS,
} from "@/services/auth/tokens";

// ═════════════════════════════════════════════════════════════════════════════
// hashToken (pure, no JWT)
// ═════════════════════════════════════════════════════════════════════════════

describe("hashToken", () => {
    it("produces a 64-char hex string (SHA-256)", () => {
        const h = hashToken("somerawtoken");
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it("is deterministic — same input → same hash", () => {
        const t = "test-token-value";
        expect(hashToken(t)).toBe(hashToken(t));
    });

    it("different inputs produce different hashes", () => {
        expect(hashToken("tokenA")).not.toBe(hashToken("tokenB"));
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// newTokenFamily (pure)
// ═════════════════════════════════════════════════════════════════════════════

describe("newTokenFamily", () => {
    it("returns a 32-char hex string (16 random bytes)", () => {
        const f = newTokenFamily();
        expect(f).toHaveLength(32);
        expect(f).toMatch(/^[0-9a-f]+$/);
    });

    it("produces unique values on each call", () => {
        expect(newTokenFamily()).not.toBe(newTokenFamily());
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// signAccessToken / verifyAccessToken
// ═════════════════════════════════════════════════════════════════════════════

describe("signAccessToken + verifyAccessToken", () => {
    const payload = { sub: "user-123", email: "alice@test.com", role: "user" };

    it("signs a token that can be decoded back to the original payload", () => {
        const token   = signAccessToken(payload);
        const decoded = verifyAccessToken(token);

        expect(decoded.sub).toBe(payload.sub);
        expect(decoded.email).toBe(payload.email);
        expect(decoded.role).toBe(payload.role);
    });

    it("includes a jti field on every signed token", () => {
        const token   = signAccessToken(payload);
        const decoded = verifyAccessToken(token);
        expect(decoded.jti).toBeDefined();
        expect(typeof decoded.jti).toBe("string");
    });

    it("jti is unique per token", () => {
        const t1 = signAccessToken(payload);
        const t2 = signAccessToken(payload);
        const d1 = verifyAccessToken(t1);
        const d2 = verifyAccessToken(t2);
        expect(d1.jti).not.toBe(d2.jti);
    });

    it("returns a string token", () => {
        const token = signAccessToken(payload);
        expect(typeof token).toBe("string");
        expect(token.split(".")).toHaveLength(3); // JWT = header.payload.signature
    });

    it("throws on a tampered token", () => {
        const token   = signAccessToken(payload);
        const tampered = token.slice(0, -5) + "xxxxx";
        expect(() => verifyAccessToken(tampered)).toThrow();
    });

    it("throws on a completely invalid string", () => {
        expect(() => verifyAccessToken("not-a-jwt")).toThrow();
    });

    it("expires in ~ACCESS_TOKEN_EXPIRY_MS milliseconds", () => {
        const before  = Math.floor(Date.now() / 1000);
        const token   = signAccessToken(payload);
        const decoded = verifyAccessToken(token);
        const expectedExp = before + Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000);
        // Allow a 2-second window
        expect(decoded.exp!).toBeGreaterThanOrEqual(expectedExp - 2);
        expect(decoded.exp!).toBeLessThanOrEqual(expectedExp + 2);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// signRefreshToken / verifyRefreshToken
// ═════════════════════════════════════════════════════════════════════════════

describe("signRefreshToken + verifyRefreshToken", () => {
    const userId = "user-456";
    const family = "family-abc";

    it("returns an object with rawToken, tokenHash, expiresAt, and jti", () => {
        const result = signRefreshToken(userId, family);
        expect(result.rawToken).toBeDefined();
        expect(result.tokenHash).toBeDefined();
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(typeof result.jti).toBe("string");
    });

    it("rawToken is a valid JWT (3-part structure)", () => {
        const { rawToken } = signRefreshToken(userId, family);
        expect(rawToken.split(".")).toHaveLength(3);
    });

    it("tokenHash equals hashToken(rawToken)", () => {
        const { rawToken, tokenHash } = signRefreshToken(userId, family);
        expect(tokenHash).toBe(hashToken(rawToken));
    });

    it("expiresAt is approximately REFRESH_TOKEN_EXPIRY_MS in the future", () => {
        const { expiresAt } = signRefreshToken(userId, family);
        const delta = expiresAt.getTime() - Date.now();
        // Should be within ±5 seconds of the configured TTL
        expect(delta).toBeGreaterThan(REFRESH_TOKEN_EXPIRY_MS - 5000);
        expect(delta).toBeLessThanOrEqual(REFRESH_TOKEN_EXPIRY_MS + 5000);
    });

    it("verifyRefreshToken decodes the raw token correctly", () => {
        const { rawToken, jti } = signRefreshToken(userId, family);
        const decoded = verifyRefreshToken(rawToken);

        expect(decoded.sub).toBe(userId);
        expect(decoded.family).toBe(family);
        expect(decoded.jti).toBe(jti);
    });

    it("two calls produce unique jti values", () => {
        const r1 = signRefreshToken(userId, family);
        const r2 = signRefreshToken(userId, family);
        expect(r1.jti).not.toBe(r2.jti);
    });

    it("throws on tampered refresh token", () => {
        const { rawToken } = signRefreshToken(userId, family);
        const tampered = rawToken.slice(0, -4) + "xxxx";
        expect(() => verifyRefreshToken(tampered)).toThrow();
    });
});
