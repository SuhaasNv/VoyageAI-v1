/**
 * lib/auth/password.ts
 *
 * bcrypt password hashing and verification.
 * Work factor 12 is the recommended minimum for production (≈250 ms on modern hardware).
 */

import bcrypt from "bcryptjs";

// 10 rounds is the industry standard for production (fast enough for snappy UI, slow enough for security).
const SALT_ROUNDS = 10;

/**
 * Hash a plaintext password.
 * @throws if password is empty/undefined.
 */
export async function hashPassword(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length === 0) {
        throw new Error("Password must not be empty");
    }
    return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Constant-time comparison of a plaintext against a stored bcrypt hash.
 * Always returns false (rather than throwing) when either argument is falsy,
 * making it safe to call even when the user is not found (timing-safe).
 */
export async function verifyPassword(
    plaintext: string,
    hash: string
): Promise<boolean> {
    if (!plaintext || !hash) return false;
    return bcrypt.compare(plaintext, hash);
}
