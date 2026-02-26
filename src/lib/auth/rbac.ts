/**
 * lib/auth/rbac.ts
 *
 * Role-Based Access Control helpers.
 *
 * Role hierarchy:
 *   USER < MODERATOR < ADMIN
 *
 * Usage:
 *   hasRole(user.role, "MODERATOR")   // true for MODERATOR and ADMIN
 *   requireRole(user.role, "ADMIN")   // throws ForbiddenError for others
 */

import type { Role } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Role hierarchy
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = {
    USER: 10,
    MODERATOR: 20,
    ADMIN: 30,
};

/**
 * Returns true if `userRole` meets or exceeds the `requiredRole`.
 */
export function hasRole(userRole: Role, requiredRole: Role): boolean {
    return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

/**
 * Throws an error with HTTP-compatible status if access is denied.
 */
export function requireRole(userRole: Role, requiredRole: Role): void {
    if (!hasRole(userRole, requiredRole)) {
        throw Object.assign(
            new Error(
                `Forbidden: requires role ${requiredRole}, got ${userRole}`
            ),
            { statusCode: 403 }
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route permission map (extend as needed)
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
    | "dashboard:read"
    | "admin:read"
    | "admin:write"
    | "moderation:read"
    | "moderation:write";

const PERMISSION_ROLES: Record<Permission, Role> = {
    "dashboard:read": "USER",
    "moderation:read": "MODERATOR",
    "moderation:write": "MODERATOR",
    "admin:read": "ADMIN",
    "admin:write": "ADMIN",
};

export function hasPermission(userRole: Role, permission: Permission): boolean {
    const required = PERMISSION_ROLES[permission];
    return hasRole(userRole, required);
}

export function requirePermission(userRole: Role, permission: Permission): void {
    if (!hasPermission(userRole, permission)) {
        throw Object.assign(
            new Error(`Forbidden: missing permission ${permission}`),
            { statusCode: 403 }
        );
    }
}
