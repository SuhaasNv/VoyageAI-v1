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

export function logDebug(message: string, meta?: unknown): void {
    if (isProduction) return;
    if (meta !== undefined) console.debug(`[DEBUG] ${message}`, meta);
    else console.debug(`[DEBUG] ${message}`);
}

// ─── Structured tracing ───────────────────────────────────────────────────────

export type LogStep =
    | "start"
    | "input"
    | "llm-call"
    | "llm-response"
    | "output"
    | "error"
    | "end"
    | "fallback"
    | "matrix_fetch"
    | "matrix_cache_hit"
    | "matrix_truncated"
    | "fallback_used"
    | "route_built"
    | "activities_dropped"
    | "cache_hit"
    | "cache_miss"
    | "cache_disabled"
    | "success"
    | "failed"
    | "invalid_result"
    | "retry_attempt"
    | "geocoding_complete"
    | "invalid_coord_fallback"
    | "matrix_miss"
    | "coord_validated"
    | "geocode_accuracy"
    | "second_pass"
    | "low_hotel_count"
    | "restaurant_enriched"
    | "meals_injected"
    | "restaurant_reclassified"
    | "food_cost_computed"
    | "ledger_built"
    | "budget_analysis"
    | "budget_optimization"
    | "adjustment_applied"
    | "optimization_complete"
    | "plan_applied"
    | "rules_applied";

export type StructuredLogEntry = {
    layer: "agent" | "orchestrator" | "llm" | "service";
    service?: string;
    agent?: string;
    step: LogStep;
    requestId?: string;
    data?: Record<string, unknown>;
};

/**
 * Generates a short request-scoped trace ID.
 * Uses crypto.randomUUID() when available (Node 19+, all browsers).
 */
export function generateRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Truncates a string to `max` chars — prevents large payload dumps in logs. */
export function trunc(value: string, max = 200): string {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Emits a structured log entry.
 *
 * Development:  "[layer:agent] step  { requestId, ...data }"  (pretty, console)
 * Production:   single-line JSON — machine-parseable, no secrets, data is truncated.
 */
export function logStructured(entry: StructuredLogEntry): void {
    const tag = entry.agent
        ? `[${entry.layer}:${entry.agent}]`
        : `[${entry.layer}]`;
    const prefix = `${tag} ${entry.step}`;

    if (isProduction) {
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            level: entry.step === "error" ? "ERROR" : "INFO",
            layer: entry.layer,
            ...(entry.agent && { agent: entry.agent }),
            step: entry.step,
            ...(entry.requestId && { requestId: entry.requestId }),
            ...(entry.data && { data: entry.data }),
        });
        if (entry.step === "error") console.error(line);
        else console.log(line);
    } else {
        const meta: Record<string, unknown> = {};
        if (entry.requestId) meta.requestId = entry.requestId;
        if (entry.data) Object.assign(meta, entry.data);
        if (Object.keys(meta).length > 0) {
            if (entry.step === "error") console.error(prefix, meta);
            else console.log(prefix, meta);
        } else {
            if (entry.step === "error") console.error(prefix);
            else console.log(prefix);
        }
    }
}
