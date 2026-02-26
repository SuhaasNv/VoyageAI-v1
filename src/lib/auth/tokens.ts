/**
 * lib/auth/tokens.ts
 *
 * JWT access-token + refresh-token lifecycle.
 *
 * Keys involved
 * ─────────────
 *  JWT_ACCESS_SECRET   → signs access tokens  (HS256, 15 min)
 *  JWT_REFRESH_SECRET  → signs refresh tokens (HS256, 7 days)
 *
 * The raw refresh token is:
 *   base64url( sign(payload, REFRESH_SECRET) )
 *
 * The *hash* of the raw token is stored in the DB (SHA-256).
 * This means a DB compromise exposes no live tokens.
 */

import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

export const ACCESS_TOKEN_EXPIRY_MS = env.ACCESS_TOKEN_EXPIRY_MS ?? 900000;
export const REFRESH_TOKEN_EXPIRY_MS = env.REFRESH_TOKEN_EXPIRY_MS ?? 604800000;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
    sub: string;    // userId
    email: string;
    role: string;
    iat?: number;
    exp?: number;
    jti?: string;   // JWT ID for future revocation lists
}

export interface RefreshTokenPayload {
    sub: string;    // userId
    family: string; // rotation family – used for reuse detection
    jti: string;    // unique token identifier
    iat?: number;
    exp?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Access token
// ─────────────────────────────────────────────────────────────────────────────

export function signAccessToken(payload: Omit<AccessTokenPayload, "jti">): string {
    const secret = env.JWT_ACCESS_SECRET;
    const expiresInSeconds = Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000);

    return jwt.sign(
        {
            ...payload,
            jti: randomBytes(16).toString("hex"),
        },
        secret,
        {
            algorithm: "HS256",
            expiresIn: expiresInSeconds,
        } as SignOptions
    );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    const secret = env.JWT_ACCESS_SECRET;
    const decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
    }) as JwtPayload & AccessTokenPayload;

    if (!decoded.sub || !decoded.email || !decoded.role) {
        throw new Error("Malformed access token payload");
    }

    return decoded;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a signed refresh token + its DB-storable hash.
 */
export function signRefreshToken(
    userId: string,
    family: string
): { rawToken: string; tokenHash: string; expiresAt: Date; jti: string } {
    const secret = env.JWT_REFRESH_SECRET;
    const jti = randomBytes(16).toString("hex");
    const expiresInSeconds = Math.floor(REFRESH_TOKEN_EXPIRY_MS / 1000);

    const rawToken = jwt.sign(
        { sub: userId, family, jti } satisfies RefreshTokenPayload,
        secret,
        {
            algorithm: "HS256",
            expiresIn: expiresInSeconds,
        } as SignOptions
    );

    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    return { rawToken, tokenHash, expiresAt, jti };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
    const secret = env.JWT_REFRESH_SECRET;
    const decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
    }) as JwtPayload & RefreshTokenPayload;

    if (!decoded.sub || !decoded.family || !decoded.jti) {
        throw new Error("Malformed refresh token payload");
    }

    return decoded;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** One-way SHA-256 hash for safe DB storage of tokens. */
export function hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
}

/** Generate a new rotation family ID. */
export function newTokenFamily(): string {
    return randomBytes(16).toString("hex");
}
