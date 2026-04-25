/**
 * src/services/ai/predictive.service.ts
 *
 * Predictive Intelligence Engine for VoyageAI.
 *
 * Predicts system issues BEFORE they happen using lightweight statistical
 * trend analysis (ordinary least squares linear regression — no external ML
 * libraries, no heavy computation).
 *
 * ─── HOW IT WORKS ────────────────────────────────────────────────────────────
 *
 *  1. COLLECT  — fetch last 14 days of AiUsageLog in a single DB query,
 *                then bucket metrics in memory by day (cost, latency, volume)
 *                and by hour (latency, error rate) for short-horizon forecasts.
 *
 *  2. REGRESS  — ordinary least squares (OLS) linear regression on each
 *                bucketed time series.  The coefficient of determination (R²)
 *                becomes the confidence score — a natural 0–1 measure of how
 *                strong and consistent the trend is.
 *
 *  3. PROJECT  — extrapolate the regression line forward and compare the
 *                projected value to known safety thresholds.  Generate a
 *                human-readable Prediction only when:
 *                  • R² ≥ MIN_R2 (trend is meaningful, not just noise)
 *                  • At least MIN_POINTS buckets of data exist
 *                  • The change is directionally significant (> 10%)
 *
 *  4. CACHE    — results are cached for CACHE_TTL_MS (5 min, stale-while-
 *                revalidate) so repeated assistant calls don't hammer the DB.
 *
 * ─── INTEGRATION POINTS ──────────────────────────────────────────────────────
 *
 *   getPredictions()             → admin assistant route (injected into context)
 *   GET /api/admin/predictions   → admin panel + assistant UI
 *   formatPredictionsForContext  → compact string block for LLM context
 *
 * ─── METRICS COVERED ─────────────────────────────────────────────────────────
 *
 *   COST       — daily spend trend (14d window, 3d + 7d horizon)
 *   LATENCY    — hourly avg latency trend (48h window, 4h + 24h horizon)
 *   ERROR RATE — hourly error rate trend  (48h window, 4h + 24h horizon)
 *   VOLUME     — daily call-count trend   (14d window, 3d horizon)
 */

import { logInfo, logError } from "@/infrastructure/logger";
import { isAiUsageLogFailure } from "@/lib/metrics/aiUsageLog";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PredictionMetric  = "cost" | "latency" | "error_rate" | "volume";
export type PredictionSeverity = "low" | "medium" | "high" | "critical";

export interface Prediction {
    id:                  string;
    metric:              PredictionMetric;
    /** Human-readable forecast horizon, e.g. "3d", "24h". */
    horizon:             string;
    currentValue:        number;
    predictedValue:      number;
    changeDirection:     "increasing" | "decreasing" | "stable";
    /** % change from currentValue to predictedValue (signed). */
    changePct:           number;
    /**
     * R² (coefficient of determination) of the underlying OLS regression.
     *
     * Ranges 0–1: 1.0 = the linear model explains all variance in the data;
     * 0.0 = the model explains none.  This is a goodness-of-fit measure, NOT
     * a probability that the prediction will be correct.  A high R² only means
     * the historical trend is strongly linear — it says nothing about whether
     * that trend will continue.
     *
     * `confidenceType: "regression_r2"` distinguishes this from heuristic
     * pipeline scores so UI labels can be set accurately.
     */
    confidence:          number;
    /** Epistemological category — always "regression_r2" for predictions. */
    confidenceType:      "regression_r2";
    willBreachThreshold: boolean;
    thresholdValue?:     number;
    /** One sentence, human-readable forecast. */
    prediction:          string;
    /** What the admin should do now, before the issue materialises. */
    recommendedAction:   string;
    severity:            PredictionSeverity;
    unit:                string;
}

export interface PredictiveReport {
    generatedAt:    string;
    predictions:    Prediction[];
    hasHighRisk:    boolean;
    summary:        string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const MIN_R2       = 0.25;             // minimum R² to surface a prediction
const MIN_POINTS   = 4;               // minimum time buckets needed
const MIN_CHANGE   = 0.10;            // minimum 10% change to count as a trend

const MS_PER_DAY  = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const THRESHOLDS = {
    latencyHighMs:     10_000,  // project exceeding this → high severity
    latencyCriticalMs: 15_000,
    errorRateHighPct:  5,       // project exceeding this → high severity
    errorRateCritical: 20,
    costDoublingDays:  7,       // if cost doubles within 7 days → high severity
} as const;

// ─── Linear regression (OLS) ─────────────────────────────────────────────────

interface TimePoint { x: number; y: number; }

interface RegressionResult {
    slope:     number;   // change per unit x (day or hour)
    intercept: number;
    r2:        number;   // coefficient of determination (0–1)
    meanY:     number;
    predict:   (x: number) => number;
}

/**
 * Ordinary least squares linear regression.
 * Returns a zero-slope trivial result if fewer than MIN_POINTS points supplied.
 */
function linearRegression(points: TimePoint[]): RegressionResult {
    const n = points.length;
    if (n < MIN_POINTS) {
        const mean = n > 0 ? points.reduce((s, p) => s + p.y, 0) / n : 0;
        return { slope: 0, intercept: mean, r2: 0, meanY: mean, predict: () => mean };
    }

    const meanX = points.reduce((s, p) => s + p.x, 0) / n;
    const meanY = points.reduce((s, p) => s + p.y, 0) / n;

    const ssXY = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
    const ssXX = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);

    const slope     = ssXX > 1e-10 ? ssXY / ssXX : 0;
    const intercept = meanY - slope * meanX;
    const predict   = (x: number) => slope * x + intercept;

    // R² = 1 - SS_res / SS_tot
    const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
    const ssRes = points.reduce((s, p) => s + (p.y - predict(p.x)) ** 2, 0);
    const r2    = ssTot > 1e-10 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

    return { slope, intercept, r2, meanY, predict };
}

// ─── Data collection ──────────────────────────────────────────────────────────

interface RawRow {
    createdAt:       Date;
    costEstimateUsd: number;
    latencyMs:       number;
    totalTokens:     number;
    callSucceeded:   boolean | null;
}

async function fetchRawData(windowStart: Date): Promise<RawRow[]> {
    const { prisma } = await import("@/lib/prisma");
    return prisma.aiUsageLog.findMany({
        where:   { createdAt: { gte: windowStart } },
        select:  { createdAt: true, costEstimateUsd: true, latencyMs: true, totalTokens: true, callSucceeded: true },
        orderBy: { createdAt: "asc" },
    });
}

// ─── Bucketing helpers ────────────────────────────────────────────────────────

interface DayBucket {
    dayIndex: number;      // 0 = oldest day in window
    totalCost: number;
    latencies: number[];
    calls:     number;
    errors:    number;
}

interface HourBucket {
    hourIndex:  number;
    latencies:  number[];
    calls:      number;
    errors:     number;
}

function bucketByDay(rows: RawRow[], windowStart: Date, windowDays: number): DayBucket[] {
    const buckets: DayBucket[] = Array.from({ length: windowDays }, (_, i) => ({
        dayIndex: i, totalCost: 0, latencies: [], calls: 0, errors: 0,
    }));

    for (const row of rows) {
        const idx = Math.floor((row.createdAt.getTime() - windowStart.getTime()) / MS_PER_DAY);
        if (idx < 0 || idx >= windowDays) continue;
        const b = buckets[idx];
        b.totalCost += row.costEstimateUsd;
        b.latencies.push(row.latencyMs);
        b.calls++;
        if (isAiUsageLogFailure(row)) b.errors++;
    }

    return buckets;
}

function bucketByHour(rows: RawRow[], windowStart: Date, windowHours: number): HourBucket[] {
    const buckets: HourBucket[] = Array.from({ length: windowHours }, (_, i) => ({
        hourIndex: i, latencies: [], calls: 0, errors: 0,
    }));

    for (const row of rows) {
        const idx = Math.floor((row.createdAt.getTime() - windowStart.getTime()) / MS_PER_HOUR);
        if (idx < 0 || idx >= windowHours) continue;
        const b = buckets[idx];
        b.latencies.push(row.latencyMs);
        b.calls++;
        if (isAiUsageLogFailure(row)) b.errors++;
    }

    return buckets;
}

// ─── Prediction generators ────────────────────────────────────────────────────

function severityFromConfidence(r2: number, willBreach: boolean): PredictionSeverity {
    if (willBreach) return r2 > 0.6 ? "high" : "medium";
    return r2 > 0.7 ? "medium" : "low";
}

/** Daily cost trend → 3-day and 7-day projections. */
function buildCostPredictions(dayBuckets: DayBucket[]): Prediction[] {
    const activeBuckets = dayBuckets.filter((b) => b.calls > 0);
    if (activeBuckets.length < MIN_POINTS) return [];

    const points: TimePoint[] = activeBuckets.map((b) => ({ x: b.dayIndex, y: b.totalCost }));
    const reg = linearRegression(points);
    if (reg.r2 < MIN_R2) return [];

    const predictions: Prediction[] = [];
    const currentDay = dayBuckets.length - 1;

    for (const horizonDays of [3, 7] as const) {
        const currentCost   = reg.predict(currentDay);
        const projectedCost = Math.max(0, reg.predict(currentDay + horizonDays));
        const changePct     = currentCost > 0 ? ((projectedCost - currentCost) / currentCost) * 100 : 0;

        if (Math.abs(changePct) < MIN_CHANGE * 100) continue;

        const direction = reg.slope > 0 ? "increasing" : "decreasing";
        const willBreach = projectedCost > currentCost * (1 + THRESHOLDS.costDoublingDays / horizonDays * 0.5);
        const severity   = reg.slope > 0
            ? (willBreach && reg.r2 > 0.6 ? "high" : reg.r2 > 0.5 ? "medium" : "low")
            : "low";

        if (reg.slope <= 0 && !willBreach) continue; // only surface concerning trends

        predictions.push({
            id:                  `cost_trend_${horizonDays}d`,
            metric:              "cost",
            horizon:             `${horizonDays}d`,
            currentValue:        Math.max(0, currentCost),
            predictedValue:      projectedCost,
            changeDirection:     direction,
            changePct:           Math.round(changePct * 10) / 10,
            confidence:          Math.round(reg.r2 * 100) / 100,
            confidenceType:      "regression_r2" as const,
            willBreachThreshold: willBreach,
            prediction:          `Daily AI spend is ${direction} at +$${Math.abs(reg.slope).toFixed(5)}/day. ` +
                                  `Projected ${horizonDays}-day daily cost: $${projectedCost.toFixed(4)} ` +
                                  `(${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}% from today).`,
            recommendedAction:   willBreach
                ? `Run cost analysis now and consider enabling REDUCE_TOKENS_25PCT in auto-healing to cap the spend trajectory.`
                : `Monitor daily cost — trend is upward but not yet critical. Review high-cost endpoints in model insights.`,
            severity,
            unit: "USD/day",
        });
    }

    return predictions;
}

/** Hourly latency trend → 4h and 24h projections. */
function buildLatencyPredictions(hourBuckets: HourBucket[]): Prediction[] {
    const activeBuckets = hourBuckets.filter((b) => b.latencies.length > 0);
    if (activeBuckets.length < MIN_POINTS) return [];

    const points: TimePoint[] = activeBuckets.map((b) => ({
        x: b.hourIndex,
        y: b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length,
    }));

    const reg = linearRegression(points);
    if (reg.r2 < MIN_R2 || reg.slope <= 0) return []; // only surface degradation trends

    const currentHour     = hourBuckets.length - 1;
    const currentLatency  = Math.max(0, reg.predict(currentHour));

    const predictions: Prediction[] = [];

    for (const horizonHours of [4, 24] as const) {
        const projected  = Math.max(0, reg.predict(currentHour + horizonHours));
        const changePct  = currentLatency > 0 ? ((projected - currentLatency) / currentLatency) * 100 : 0;

        if (changePct < MIN_CHANGE * 100) continue;

        const willBreachHigh     = projected > THRESHOLDS.latencyHighMs;
        const willBreachCritical = projected > THRESHOLDS.latencyCriticalMs;
        const severity: PredictionSeverity =
            willBreachCritical && reg.r2 > 0.6 ? "critical" :
            willBreachHigh     && reg.r2 > 0.5 ? "high" :
            reg.r2 > 0.5 ? "medium" : "low";

        predictions.push({
            id:                  `latency_trend_${horizonHours}h`,
            metric:              "latency",
            horizon:             `${horizonHours}h`,
            currentValue:        Math.round(currentLatency),
            predictedValue:      Math.round(projected),
            changeDirection:     "increasing",
            changePct:           Math.round(changePct * 10) / 10,
            confidence:          Math.round(reg.r2 * 100) / 100,
            confidenceType:      "regression_r2" as const,
            willBreachThreshold: willBreachHigh,
            thresholdValue:      THRESHOLDS.latencyHighMs,
            prediction:          `Avg latency is trending upward at +${Math.round(reg.slope)}ms/hour. ` +
                                  `Projected ${horizonHours}h latency: ${Math.round(projected)}ms ` +
                                  `(+${changePct.toFixed(0)}% from ${Math.round(currentLatency)}ms now).`,
            recommendedAction:   willBreachHigh
                ? `Check AI provider health immediately. Consider enabling ENABLE_TIMEOUT_REDUCTION to fail fast and prevent cascading delays.`
                : `Latency is climbing — check for long prompts, large responses, or provider slowdown. Enable VERIFY_MONITORING.`,
            severity,
            unit: "ms",
        });
    }

    return predictions;
}

/** Hourly error rate trend → 4h and 24h projections. */
function buildErrorRatePredictions(hourBuckets: HourBucket[]): Prediction[] {
    const activeBuckets = hourBuckets.filter((b) => b.calls >= 3);
    if (activeBuckets.length < MIN_POINTS) return [];

    const points: TimePoint[] = activeBuckets.map((b) => ({
        x: b.hourIndex,
        y: (b.errors / b.calls) * 100,
    }));

    const reg = linearRegression(points);
    if (reg.r2 < MIN_R2 || reg.slope <= 0) return []; // only surface rising trends

    const currentHour      = hourBuckets.length - 1;
    const currentErrorRate = Math.max(0, reg.predict(currentHour));

    const predictions: Prediction[] = [];

    for (const horizonHours of [4, 24] as const) {
        const projected = Math.min(100, Math.max(0, reg.predict(currentHour + horizonHours)));
        const changePct = currentErrorRate > 0
            ? ((projected - currentErrorRate) / currentErrorRate) * 100
            : projected * 10; // from ~0 to something — treat as relative increase

        if (projected < 2) continue; // below noise floor

        const willBreachHigh     = projected > THRESHOLDS.errorRateHighPct;
        const willBreachCritical = projected > THRESHOLDS.errorRateCritical;
        const severity: PredictionSeverity =
            willBreachCritical && reg.r2 > 0.6 ? "critical" :
            willBreachHigh     && reg.r2 > 0.5 ? "high" :
            reg.r2 > 0.5 ? "medium" : "low";

        predictions.push({
            id:                  `error_rate_trend_${horizonHours}h`,
            metric:              "error_rate",
            horizon:             `${horizonHours}h`,
            currentValue:        Math.round(currentErrorRate * 10) / 10,
            predictedValue:      Math.round(projected * 10) / 10,
            changeDirection:     "increasing",
            changePct:           Math.round(changePct * 10) / 10,
            confidence:          Math.round(reg.r2 * 100) / 100,
            confidenceType:      "regression_r2" as const,
            willBreachThreshold: willBreachHigh,
            thresholdValue:      THRESHOLDS.errorRateHighPct,
            prediction:          `AI error rate (0-token responses) is rising at +${reg.slope.toFixed(2)}%/hour. ` +
                                  `Projected ${horizonHours}h error rate: ${projected.toFixed(1)}% ` +
                                  `(from ${currentErrorRate.toFixed(1)}% now).`,
            recommendedAction:   willBreachHigh
                ? `Run CHECK_AI_PROVIDER immediately — an error rate above ${THRESHOLDS.errorRateHighPct}% indicates provider instability. Consider switching to Gemini as fallback.`
                : `Error rate is forming an upward trend. Run CHECK_API_LOGS to identify which endpoints are failing.`,
            severity,
            unit: "% error rate",
        });
    }

    return predictions;
}

/** Daily call volume trend → 3-day projection (informational, capacity planning). */
function buildVolumePrediction(dayBuckets: DayBucket[]): Prediction | null {
    const activeBuckets = dayBuckets.filter((b) => b.calls > 0);
    if (activeBuckets.length < MIN_POINTS) return null;

    const points: TimePoint[] = activeBuckets.map((b) => ({ x: b.dayIndex, y: b.calls }));
    const reg = linearRegression(points);

    // Only surface high-growth volume trends (>20% in 3 days)
    if (reg.r2 < MIN_R2 || reg.slope <= 0) return null;

    const currentDay    = dayBuckets.length - 1;
    const currentVol    = Math.max(0, reg.predict(currentDay));
    const projectedVol  = Math.max(0, reg.predict(currentDay + 3));
    const changePct     = currentVol > 0 ? ((projectedVol - currentVol) / currentVol) * 100 : 0;

    if (changePct < 20) return null;

    const severity = severityFromConfidence(reg.r2, changePct > 50);

    return {
        id:                  "volume_growth_3d",
        metric:              "volume",
        horizon:             "3d",
        currentValue:        Math.round(currentVol),
        predictedValue:      Math.round(projectedVol),
        changeDirection:     "increasing",
        changePct:           Math.round(changePct * 10) / 10,
        confidence:          Math.round(reg.r2 * 100) / 100,
        confidenceType:      "regression_r2" as const,
        willBreachThreshold: false,
        prediction:          `AI call volume is growing at +${Math.round(reg.slope)} calls/day. ` +
                              `Projected 3-day daily volume: ${Math.round(projectedVol)} calls/day (+${changePct.toFixed(0)}%).`,
        recommendedAction:   `Volume growth is healthy — ensure token budgets and rate limits are scaled accordingly. Monitor cost trajectory.`,
        severity,
        unit: "calls/day",
    };
}

// ─── Result cache (stale-while-revalidate) ────────────────────────────────────

let _cachedReport: PredictiveReport | null = null;
let _cacheRefreshedAt: Date | null = null;

function isCacheStale(): boolean {
    if (!_cacheRefreshedAt) return true;
    return Date.now() - _cacheRefreshedAt.getTime() > CACHE_TTL_MS;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute predictive intelligence for all tracked metrics.
 *
 * Results are cached for 5 minutes — safe to call from the assistant on
 * every request without hammering the database.
 *
 * @param forceRefresh  Bypass cache and recompute (e.g. for the admin panel).
 */
export async function getPredictions(forceRefresh = false): Promise<PredictiveReport> {
    if (!forceRefresh && !isCacheStale() && _cachedReport) {
        return _cachedReport;
    }

    const generatedAt  = new Date().toISOString();
    const windowStart  = new Date(Date.now() - 14 * MS_PER_DAY);
    const hourStart    = new Date(Date.now() - 48 * MS_PER_HOUR);

    try {
        const [dailyRaw, hourlyRaw] = await Promise.all([
            fetchRawData(windowStart),
            fetchRawData(hourStart),
        ]);

        const dayBuckets  = bucketByDay(dailyRaw, windowStart, 14);
        const hourBuckets = bucketByHour(hourlyRaw, hourStart, 48);

        const allPredictions: Prediction[] = [
            ...buildCostPredictions(dayBuckets),
            ...buildLatencyPredictions(hourBuckets),
            ...buildErrorRatePredictions(hourBuckets),
        ];

        const volumePred = buildVolumePrediction(dayBuckets);
        if (volumePred) allPredictions.push(volumePred);

        // Deduplicate: keep highest-severity prediction per metric
        const byMetric = new Map<PredictionMetric, Prediction[]>();
        for (const p of allPredictions) {
            const existing = byMetric.get(p.metric) ?? [];
            existing.push(p);
            byMetric.set(p.metric, existing);
        }

        const SEVERITY_ORDER: PredictionSeverity[] = ["critical", "high", "medium", "low"];
        const deduplicated: Prediction[] = [];
        for (const [, preds] of byMetric) {
            // Sort by severity descending, then confidence descending
            const sorted = [...preds].sort((a, b) => {
                const si = SEVERITY_ORDER.indexOf(a.severity);
                const sj = SEVERITY_ORDER.indexOf(b.severity);
                return si !== sj ? si - sj : b.confidence - a.confidence;
            });
            deduplicated.push(sorted[0]); // best prediction per metric
        }

        const hasHighRisk = deduplicated.some((p) => p.severity === "high" || p.severity === "critical");
        const highCount   = deduplicated.filter((p) => p.severity === "high" || p.severity === "critical").length;

        const summary = deduplicated.length === 0
            ? "No significant trends detected — system metrics appear stable over the last 14 days."
            : `${deduplicated.length} predictive signal${deduplicated.length > 1 ? "s" : ""} detected. ` +
              (highCount > 0
                  ? `${highCount} high-risk trend${highCount > 1 ? "s" : ""} forming — preemptive action recommended.`
                  : "Trends are forming but not yet critical.");

        logInfo("[PredictiveEngine] predictions computed", {
            count:      deduplicated.length,
            hasHighRisk,
            metrics:    deduplicated.map((p) => `${p.metric}:${p.severity}:${p.confidence}`),
        });

        const report: PredictiveReport = {
            generatedAt,
            predictions: deduplicated,
            hasHighRisk,
            summary,
        };

        _cachedReport      = report;
        _cacheRefreshedAt  = new Date();
        return report;

    } catch (err) {
        logError("[PredictiveEngine] failed", { error: (err as Error).message });
        return { generatedAt, predictions: [], hasHighRisk: false, summary: "Predictive analysis unavailable." };
    }
}

// ─── Context formatter (for admin assistant) ─────────────────────────────────

/**
 * Returns a compact multi-line string to inject as a [PREDICTIONS] block
 * into the admin assistant's LLM context.
 */
export function formatPredictionsForContext(report: PredictiveReport): string {
    if (report.predictions.length === 0) {
        return "[PREDICTIONS] No significant trends detected.";
    }

    const lines = report.predictions.map((p) =>
        `[${p.severity.toUpperCase()}] ${p.prediction} ` +
        `(R² trend fit: ${(p.confidence * 100).toFixed(0)}%) → ${p.recommendedAction}`
    );

    return `[PREDICTIONS — act preemptively to prevent these from becoming anomalies]\n${lines.join("\n")}`;
}
