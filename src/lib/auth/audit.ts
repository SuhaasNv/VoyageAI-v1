/**
 * lib/auth/audit.ts
 *
 * Write-only helper for persisting auth audit events.
 * Non-blocking – failures are logged but never thrown to callers.
 */

import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

export type AuditAction =
    | "REGISTER"
    | "LOGIN"
    | "LOGIN_FAILED"
    | "LOGOUT"
    | "REFRESH"
    | "REFRESH_REUSE_DETECTED"
    | "REFRESH_FAILED"
    | "RATE_LIMITED"
    | "CSRF_REJECTED";

interface AuditOptions {
    action: AuditAction;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}

export async function writeAuditLog(opts: AuditOptions): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: opts.action,
                userId: opts.userId,
                ipAddress: opts.ipAddress,
                userAgent: opts.userAgent,
                metadata: opts.metadata as any,
            },
        });
    } catch (err) {
        // Audit failures must never crash the auth flow
        logError("[audit] Failed to write audit log", err);
    }
}
