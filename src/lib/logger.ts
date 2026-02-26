/**
 * src/lib/logger.ts
 *
 * Minimal structured logger abstraction.
 * Development: console.log / console.error
 * Production: timestamp + level prefix, JSON meta
 */

const isProduction = process.env.NODE_ENV === "production";

function safeStringify(meta: unknown): string {
    try {
        return JSON.stringify(meta);
    } catch {
        return String(meta);
    }
}

export function logInfo(message: string, meta?: unknown): void {
    if (isProduction) {
        const ts = new Date().toISOString();
        const metaStr = meta !== undefined ? ` ${safeStringify(meta)}` : "";
        console.log(`[${ts}] INFO ${message}${metaStr}`);
    } else {
        if (meta !== undefined) console.log(message, meta);
        else console.log(message);
    }
}

export function logError(message: string, meta?: unknown): void {
    if (isProduction) {
        const ts = new Date().toISOString();
        const metaStr = meta !== undefined ? ` ${safeStringify(meta)}` : "";
        console.error(`[${ts}] ERROR ${message}${metaStr}`);
    } else {
        if (meta !== undefined) console.error(message, meta);
        else console.error(message);
    }
}
