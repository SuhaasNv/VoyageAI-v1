/**
 * scripts/ai-gate/risk-score.ts
 *
 * Risk Scoring — AI Security Gate Stage 4
 *
 * Aggregates the JSON reports from stages 1–3 into a composite 0–100 risk score.
 *
 * Scoring model:
 *   - Start at 100 (fully clean)
 *   - Each failing check deducts weighted points based on severity:
 *       critical → -25 pts (max deduction per stage: -50)
 *       high     → -10 pts (max deduction per stage: -20)
 *       medium   →  -3 pts (max deduction per stage:  -9)
 *   - Score is floored at 0
 *   - Pipeline is BLOCKED if score < RISK_THRESHOLD (env var, default 60)
 *
 * Output: reports/ai-gate/risk-score.json
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium";

interface CheckResult {
    name: string;
    passed: boolean;
    severity: Severity;
    error?: string;
}

interface StageReport {
    stage: string;
    timestamp: string;
    passed: boolean;
    total: number;
    failures: number;
    criticalFailures: number;
    checks: CheckResult[];
}

interface Deduction {
    stage: string;
    severity: Severity;
    check: string;
    points: number;
    error?: string;
}

interface RiskScoreReport {
    timestamp: string;
    score: number;
    threshold: number;
    approved: boolean;
    stages: {
        stage: string;
        total: number;
        failures: number;
        criticalFailures: number;
        passed: boolean;
    }[];
    deductions: Deduction[];
    summary: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const THRESHOLD = parseInt(process.env.RISK_THRESHOLD ?? "60", 10);

const DEDUCTION_WEIGHTS: Record<Severity, number> = {
    critical: 25,
    high: 10,
    medium: 3,
};

// Max deduction per stage (prevents a single bad stage from wiping everything)
const MAX_DEDUCTION_PER_STAGE: Record<Severity, number> = {
    critical: 50,
    high: 20,
    medium: 9,
};

const STAGE_REPORTS = [
    { name: "model-approval",  file: path.join("reports", "ai-gate", "model-approval.json") },
    { name: "data-approval",   file: path.join("reports", "ai-gate", "data-approval.json") },
    { name: "bias-check",      file: path.join("reports", "ai-gate", "bias-check.json") },
];

// ─── Load stage reports ───────────────────────────────────────────────────────

const stageResults: StageReport[] = [];
const loadErrors: string[] = [];

for (const { name, file } of STAGE_REPORTS) {
    try {
        const raw = readFileSync(file, "utf8");
        const parsed: StageReport = JSON.parse(raw);
        stageResults.push(parsed);
        console.log(`  📂 Loaded: ${name} (${parsed.total} checks, ${parsed.failures} failures)`);
    } catch (err) {
        loadErrors.push(`Failed to load '${name}' from '${file}': ${(err as Error).message}`);
        console.error(`  ❌ Failed to load '${name}': ${(err as Error).message}`);
    }
}

if (loadErrors.length > 0) {
    console.error("\n⛔ Cannot compute risk score — missing stage reports:");
    for (const e of loadErrors) console.error(`  • ${e}`);
    process.exit(1);
}

// ─── Compute score ────────────────────────────────────────────────────────────

console.log("\n📊 Computing composite risk score...\n");

let score = 100;
const deductions: Deduction[] = [];

for (const report of stageResults) {
    const failedChecks = report.checks.filter((c) => !c.passed);
    if (failedChecks.length === 0) {
        console.log(`  ✅ ${report.stage}: all ${report.total} checks passed — no deductions`);
        continue;
    }

    const stageDeductions = {
        critical: [] as Deduction[],
        high:     [] as Deduction[],
        medium:   [] as Deduction[],
    };

    for (const fc of failedChecks) {
        const severity = fc.severity as Severity;
        const points = DEDUCTION_WEIGHTS[severity];
        stageDeductions[severity].push({
            stage: report.stage,
            severity,
            check: fc.name,
            points,
            error: fc.error,
        });
    }

    // Apply per-severity caps per stage
    let stageScore = 0;
    for (const severity of ["critical", "high", "medium"] as const) {
        const sDeductions = stageDeductions[severity];
        if (sDeductions.length === 0) continue;

        const raw = sDeductions.reduce((acc, d) => acc + d.points, 0);
        const capped = Math.min(raw, MAX_DEDUCTION_PER_STAGE[severity]);
        stageScore += capped;

        if (raw !== capped) {
            console.log(`    ⚡ ${report.stage}/${severity}: deduction capped at -${capped} (was -${raw})`);
        }

        deductions.push(...sDeductions.map((d) => ({
            ...d,
            // Adjust individual deductions proportionally if capped
            points: raw !== capped ? Math.round((d.points / raw) * capped) : d.points,
        })));
    }

    score -= stageScore;
    console.log(`  ⚠️  ${report.stage}: ${failedChecks.length} failures → -${stageScore} pts`);
    for (const d of [...stageDeductions.critical, ...stageDeductions.high, ...stageDeductions.medium]) {
        console.log(`       [${d.severity}] ${d.check}`);
    }
}

score = Math.max(0, Math.min(100, score));
const approved = score >= THRESHOLD;

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log(`  Score      : ${score} / 100`);
console.log(`  Threshold  : ${THRESHOLD}`);
console.log(`  Decision   : ${approved ? "✅ APPROVED" : "❌ BLOCKED"}`);
console.log(`  Deductions : ${deductions.length} total`);
console.log("─".repeat(60));

const summaryParts: string[] = [];
if (deductions.filter((d) => d.severity === "critical").length > 0) {
    summaryParts.push(`${deductions.filter((d) => d.severity === "critical").length} critical issue(s) must be resolved`);
}
if (deductions.filter((d) => d.severity === "high").length > 0) {
    summaryParts.push(`${deductions.filter((d) => d.severity === "high").length} high-severity issue(s) to address`);
}
if (deductions.filter((d) => d.severity === "medium").length > 0) {
    summaryParts.push(`${deductions.filter((d) => d.severity === "medium").length} medium-severity recommendation(s)`);
}
const summary = summaryParts.length > 0 ? summaryParts.join("; ") : "All checks passed — no issues found";

// ─── Report ───────────────────────────────────────────────────────────────────

const report: RiskScoreReport = {
    timestamp: new Date().toISOString(),
    score,
    threshold: THRESHOLD,
    approved,
    stages: stageResults.map((r) => ({
        stage: r.stage,
        total: r.total,
        failures: r.failures,
        criticalFailures: r.criticalFailures,
        passed: r.passed,
    })),
    deductions,
    summary,
};

mkdirSync(path.join("reports", "ai-gate"), { recursive: true });
writeFileSync(
    path.join("reports", "ai-gate", "risk-score.json"),
    JSON.stringify(report, null, 2)
);

console.log(`\nReport written to reports/ai-gate/risk-score.json`);
console.log(`${approved ? "✅ AI Security Gate: APPROVED" : "❌ AI Security Gate: BLOCKED"} (${score}/100)`);

process.exit(approved ? 0 : 1);
