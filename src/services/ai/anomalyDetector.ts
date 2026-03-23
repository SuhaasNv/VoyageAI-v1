/**
 * src/services/ai/anomalyDetector.ts
 *
 * Standalone metric collection and rule-based anomaly detection.
 * Consumed by the Autonomous Runner — intentionally independent from
 * autoHealing.service.ts so both systems can evolve separately.
 *
 * Exports:
 *   SystemMetrics    — raw numeric snapshot returned by collectSystemMetrics()
 *   Anomaly          — structured anomaly with id, severity, category, metric
 *   analyzeSystem()  — collect metrics + run all anomaly rules, returns both
 */

import { prisma } from "@/lib/prisma";
import { whereAiCallFailedSince } from "@/lib/metrics/aiUsageLog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SystemMetrics {
    allTime: { avgLatencyMs: number; totalCalls: number };
    h1:      { avgLatencyMs: number; calls: number; errors: number; total: number; costUsd: number };
    m5:      { avgLatencyMs: number; calls: number; errors: number; total: number };
    d7DailyAvgCost:  number;
    d30DailyAvgCost: number;
    sampledAt: string;
}

export interface Anomaly {
    id:       string;
    severity: "low" | "medium" | "high" | "critical";
    category: "cost" | "latency" | "error_rate" | "availability";
    label:    string;
    detail:   string;
    metric:   { observed: number; threshold: number; unit: string };
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const T = {
    costSurgePct:             30,    // % increase 7d vs 30d daily avg
    latencySpikeMultiplier:   2.0,   // 1h avg must stay ≤ 2× all-time avg
    latencyAbsoluteCeilingMs: 15_000,// hard ceiling regardless of ratio
    latencySpike5mMultiplier: 2.5,   // 5m avg must stay ≤ 2.5× 1h avg
    errorRatePct:             5,     // % failed LLM calls (see aiUsageLog metrics)
    minCallsForErrorFlag:     5,     // require this many calls before flagging
    minCallsForAvailability:  50,    // historical volume before flagging zero-activity
} as const;

// ─── Metric collection ────────────────────────────────────────────────────────

async function collectSystemMetrics(): Promise<SystemMetrics> {
    const now           = Date.now();
    const oneHourAgo    = new Date(now - 60 * 60 * 1000);
    const fiveMinAgo    = new Date(now - 5  * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
        allTime,
        h1, h1Errors, h1Total,
        m5, m5Errors, m5Total,
        d7, d30,
    ] = await Promise.all([
        prisma.aiUsageLog.aggregate({ _avg: { latencyMs: true }, _count: { id: true } }),

        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: oneHourAgo } },
            _avg: { latencyMs: true }, _count: { id: true }, _sum: { costEstimateUsd: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(oneHourAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: oneHourAgo } } }),

        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: fiveMinAgo } },
            _avg: { latencyMs: true }, _count: { id: true },
        }),
        prisma.aiUsageLog.count({ where: whereAiCallFailedSince(fiveMinAgo) }),
        prisma.aiUsageLog.count({ where: { createdAt: { gte: fiveMinAgo } } }),

        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: sevenDaysAgo } }, _sum: { costEstimateUsd: true },
        }),
        prisma.aiUsageLog.aggregate({
            where: { createdAt: { gte: thirtyDaysAgo } }, _sum: { costEstimateUsd: true },
        }),
    ]);

    return {
        allTime: { avgLatencyMs: allTime._avg.latencyMs ?? 0, totalCalls: allTime._count.id },
        h1:      { avgLatencyMs: h1._avg.latencyMs ?? 0, calls: h1._count.id, errors: h1Errors, total: h1Total, costUsd: h1._sum.costEstimateUsd ?? 0 },
        m5:      { avgLatencyMs: m5._avg.latencyMs ?? 0, calls: m5._count.id, errors: m5Errors, total: m5Total },
        d7DailyAvgCost:  (d7._sum.costEstimateUsd  ?? 0) / 7,
        d30DailyAvgCost: (d30._sum.costEstimateUsd ?? 0) / 30,
        sampledAt: new Date().toISOString(),
    };
}

// ─── Anomaly rules ────────────────────────────────────────────────────────────

function runAnomalyRules(m: SystemMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Cost surge
    if (m.d30DailyAvgCost > 0 && m.d7DailyAvgCost > 0) {
        const pct = ((m.d7DailyAvgCost - m.d30DailyAvgCost) / m.d30DailyAvgCost) * 100;
        if (pct > T.costSurgePct) {
            anomalies.push({
                id: "cost_surge",
                severity: pct > 80 ? "critical" : pct > 50 ? "high" : "medium",
                category: "cost",
                label:  "Cost surge",
                detail: `7d daily avg ($${m.d7DailyAvgCost.toFixed(5)}) is ${pct.toFixed(1)}% above 30d baseline ($${m.d30DailyAvgCost.toFixed(5)}).`,
                metric: { observed: pct, threshold: T.costSurgePct, unit: "%" },
            });
        }
    }

    // Latency spike 1h vs all-time
    if (m.allTime.avgLatencyMs > 0 && m.h1.avgLatencyMs > 0) {
        const ratio = m.h1.avgLatencyMs / m.allTime.avgLatencyMs;
        if (ratio > T.latencySpikeMultiplier || m.h1.avgLatencyMs > T.latencyAbsoluteCeilingMs) {
            anomalies.push({
                id: "latency_spike_1h",
                severity: ratio > 4 || m.h1.avgLatencyMs > 20_000 ? "critical" : ratio > 3 ? "high" : "medium",
                category: "latency",
                label:  "Latency spike (1h)",
                detail: `Avg latency last hour: ${Math.round(m.h1.avgLatencyMs)}ms (${ratio.toFixed(1)}× all-time avg ${Math.round(m.allTime.avgLatencyMs)}ms).`,
                metric: { observed: m.h1.avgLatencyMs, threshold: m.allTime.avgLatencyMs * T.latencySpikeMultiplier, unit: "ms" },
            });
        }
    }

    // Latency spike 5m vs 1h (fast-moving)
    if (m.h1.avgLatencyMs > 0 && m.m5.avgLatencyMs > 0 && m.m5.calls >= 3) {
        const ratio5m = m.m5.avgLatencyMs / m.h1.avgLatencyMs;
        if (ratio5m > T.latencySpike5mMultiplier) {
            anomalies.push({
                id: "latency_spike_5m",
                severity: ratio5m > 5 ? "critical" : "high",
                category: "latency",
                label:  "Latency spike (5m)",
                detail: `5m avg latency (${Math.round(m.m5.avgLatencyMs)}ms) is ${ratio5m.toFixed(1)}× the 1h avg (${Math.round(m.h1.avgLatencyMs)}ms).`,
                metric: { observed: m.m5.avgLatencyMs, threshold: m.h1.avgLatencyMs * T.latencySpike5mMultiplier, unit: "ms" },
            });
        }
    }

    // Error rate (1h)
    if (m.h1.total >= T.minCallsForErrorFlag) {
        const errorPct = (m.h1.errors / m.h1.total) * 100;
        if (errorPct > T.errorRatePct) {
            anomalies.push({
                id: "error_rate_1h",
                severity: errorPct > 40 ? "critical" : errorPct > 20 ? "high" : "medium",
                category: "error_rate",
                label:  "Elevated error rate (1h)",
                detail: `${errorPct.toFixed(1)}% of AI calls (${m.h1.errors}/${m.h1.total}) returned 0 tokens.`,
                metric: { observed: errorPct, threshold: T.errorRatePct, unit: "%" },
            });
        }
    }

    // Availability: zero 1h calls despite historical volume
    if (m.allTime.totalCalls > T.minCallsForAvailability && m.h1.calls === 0) {
        anomalies.push({
            id: "no_activity_1h",
            severity: "high",
            category: "availability",
            label:  "Zero AI activity (1h)",
            detail: "No AI calls in the last hour despite sustained historical usage. Possible silent provider failure.",
            metric: { observed: 0, threshold: 1, unit: "calls/h" },
        });
    }

    return anomalies;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SystemAnalysis {
    metrics:   SystemMetrics;
    anomalies: Anomaly[];
}

/**
 * Collect live system metrics and run all anomaly detection rules.
 * Safe to call concurrently — each call issues independent DB queries.
 */
export async function analyzeSystem(): Promise<SystemAnalysis> {
    const metrics   = await collectSystemMetrics();
    const anomalies = runAnomalyRules(metrics);
    return { metrics, anomalies };
}
