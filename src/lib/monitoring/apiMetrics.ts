/**
 * API-level Prometheus metrics.
 *
 * Tracks per-endpoint request counts, latency distributions, and error rates.
 */

import { getOrCreateCounter, getOrCreateHistogram, getOrCreateGauge } from "./registry";

// ── Request count ─────────────────────────────────────────────────────────────

export const httpRequestsTotal = getOrCreateCounter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"] as const,
});

// ── Latency histogram (p50 / p95 / p99) ──────────────────────────────────────

export const httpRequestDurationSeconds = getOrCreateHistogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

// ── Error rate ────────────────────────────────────────────────────────────────

export const httpErrorsTotal = getOrCreateCounter({
    name: "http_errors_total",
    help: "Total number of HTTP 4xx/5xx responses",
    labelNames: ["method", "route", "status_code", "error_class"] as const,
});

// ── Active requests gauge ─────────────────────────────────────────────────────

export const httpActiveRequests = getOrCreateGauge({
    name: "http_active_requests",
    help: "Number of requests currently being processed",
    labelNames: ["method", "route"] as const,
});

// ── Helper: normalise a Next.js pathname to a metric label ───────────────────
// Collapses dynamic segments so high-cardinality paths like /api/trips/clxxx
// do not explode the label set.

const DYNAMIC_SEGMENT_RE = /\/[0-9a-f-]{8,}|\/\[[^\]]+\]/gi;

export function normaliseRoute(pathname: string): string {
    return pathname.replace(DYNAMIC_SEGMENT_RE, "/:id").toLowerCase();
}

// ── Record a completed request ────────────────────────────────────────────────

export function recordRequest(opts: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
}): void {
    const { method, route, statusCode, durationMs } = opts;
    const labels = { method, route, status_code: String(statusCode) };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationMs / 1000);

    if (statusCode >= 400) {
        httpErrorsTotal.inc({
            ...labels,
            error_class: statusCode >= 500 ? "5xx" : "4xx",
        });
    }
}
