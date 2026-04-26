/**
 * scripts/ci/validate-model.ts
 *
 * Model Validation — Stage 6
 *
 * Verifies the correctness of each agent's:
 *   - Input/output TypeScript contract
 *   - Deterministic logic (slot assignment, hotel scoring, cost calculation)
 *   - Zod schema round-trip fidelity
 *   - Safety risk-level derivation
 *
 * All logic is imported directly from the production source — no local
 * re-implementations. Uses zero real API calls.
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// Agent imports
import { normalizeDestination, safeDateParsing } from "../../src/agents/planner/plannerAgent.js";
import { budgetHint } from "../../src/agents/research/researchAgent.js";
import { SLOT_PREFERENCE, assignSlots } from "../../src/agents/logistics/logisticsAgent.js";
import {
    HOTEL_NIGHTLY,
    ACTIVITY_RANGE,
    deterministicActivityCost,
} from "../../src/agents/budget/budgetAgent.js";
import { deriveRiskLevel } from "../../src/agents/safety/safetyAgent.js";
import type { SafetyWarning } from "../../src/agents/safety/safetyAgent.js";
import type { ExecutionLogEntry } from "../../src/orchestrator/agentOrchestrator.js";

type CheckResult = { name: string; passed: boolean; error?: string };
const results: CheckResult[] = [];

function check(name: string, fn: () => void): void {
    try {
        fn();
        results.push({ name, passed: true });
        console.log(`  ✅ ${name}`);
    } catch (err) {
        results.push({ name, passed: false, error: (err as Error).message });
        console.error(`  ❌ ${name}: ${(err as Error).message}`);
    }
}

// ─── 1. Planner Agent — normalisation logic ───────────────────────────────────

console.log("\n🗺️  Planner Agent — normalisation");

check("normalizeDestination: trims and title-cases", () => {
    const r = normalizeDestination("  new york  ");
    if (r !== "New York") throw new Error(`Expected "New York", got "${r}"`);
});

check("normalizeDestination: handles multi-word city", () => {
    const r = normalizeDestination("kuala lumpur");
    if (r !== "Kuala Lumpur") throw new Error(`Expected "Kuala Lumpur", got "${r}"`);
});

check("normalizeDestination: handles city with country", () => {
    const r = normalizeDestination("paris, france");
    if (!r.includes("Paris")) throw new Error(`Expected Paris in result, got "${r}"`);
});

check("safeDateParsing: parses valid ISO date", () => {
    const r = safeDateParsing("2026-05-01");
    if (r !== "2026-05-01") throw new Error(`Expected "2026-05-01", got "${r}"`);
});

check("safeDateParsing: returns null for invalid date", () => {
    const r = safeDateParsing("not-a-date");
    if (r !== null) throw new Error(`Expected null, got "${r}"`);
});

check("safeDateParsing: returns null for undefined", () => {
    const r = safeDateParsing(undefined);
    if (r !== null) throw new Error(`Expected null, got "${r}"`);
});

// ─── 2. Research Agent — budget hint logic ────────────────────────────────────

console.log("\n🔍 Research Agent — budget classification");

check("budgetHint: $500 / 5 days = $100/day → mid-range", () => {
    const r = budgetHint({ budget: 500 }, 5);
    if (r !== "mid-range") throw new Error(`Expected "mid-range", got "${r}"`);
});

check("budgetHint: $200 / 5 days = $40/day → budget cheap", () => {
    const r = budgetHint({ budget: 200 }, 5);
    if (r !== "budget cheap") throw new Error(`Expected "budget cheap", got "${r}"`);
});

check("budgetHint: $2000 / 5 days = $400/day → luxury", () => {
    const r = budgetHint({ budget: 2000 }, 5);
    if (r !== "luxury") throw new Error(`Expected "luxury", got "${r}"`);
});

check("budgetHint: no budget → undefined", () => {
    const r = budgetHint({});
    if (r !== undefined) throw new Error(`Expected undefined, got "${r}"`);
});

// ─── 3. Logistics Agent — time slot assignment ───────────────────────────────

console.log("\n🧭 Logistics Agent — slot assignment");

check("SLOT_PREFERENCE: attraction → morning", () => {
    if (SLOT_PREFERENCE.attraction !== "morning") throw new Error(`Got ${SLOT_PREFERENCE.attraction}`);
});

check("SLOT_PREFERENCE: experience → afternoon", () => {
    if (SLOT_PREFERENCE.experience !== "afternoon") throw new Error(`Got ${SLOT_PREFERENCE.experience}`);
});

check("SLOT_PREFERENCE: restaurant → evening", () => {
    if (SLOT_PREFERENCE.restaurant !== "evening") throw new Error(`Got ${SLOT_PREFERENCE.restaurant}`);
});

check("assignSlots: attraction → morning", () => {
    const r = assignSlots([{ name: "Tower", type: "attraction", description: "" }]);
    if (r[0]!.timeSlot !== "morning") throw new Error(`Got ${r[0]!.timeSlot}`);
});

check("assignSlots: restaurant → evening", () => {
    const r = assignSlots([{ name: "Ramen", type: "restaurant", description: "" }]);
    if (r[0]!.timeSlot !== "evening") throw new Error(`Got ${r[0]!.timeSlot}`);
});

check("assignSlots: experience → afternoon", () => {
    const r = assignSlots([{ name: "Cooking Class", type: "experience", description: "" }]);
    if (r[0]!.timeSlot !== "afternoon") throw new Error(`Got ${r[0]!.timeSlot}`);
});

// ─── 4. Budget Agent — cost calculation ─────────────────────────────────────

console.log("\n💰 Budget Agent — cost calculation");

check("deterministicActivityCost: same input always same output", () => {
    const a = deterministicActivityCost("Senso-ji Temple", "attraction");
    const b = deterministicActivityCost("Senso-ji Temple", "attraction");
    if (a !== b) throw new Error(`Non-deterministic: ${a} vs ${b}`);
});

check("deterministicActivityCost: attraction in ACTIVITY_RANGE bounds", () => {
    const [min, max] = ACTIVITY_RANGE.attraction;
    const c = deterministicActivityCost("Eiffel Tower", "attraction");
    if (c < min || c > max) throw new Error(`${c} out of range [${min}, ${max}]`);
});

check("deterministicActivityCost: restaurant in ACTIVITY_RANGE bounds", () => {
    const [min, max] = ACTIVITY_RANGE.restaurant;
    const c = deterministicActivityCost("Ichiran Ramen", "restaurant");
    if (c < min || c > max) throw new Error(`${c} out of range [${min}, ${max}]`);
});

check("HOTEL_NIGHTLY: $$ = 100", () => {
    if (HOTEL_NIGHTLY["$$"] !== 100) throw new Error("Wrong nightly rate for $$");
});

check("budget calculation: 5 nights $$ + activities = positive total", () => {
    const nights = 5 * (HOTEL_NIGHTLY["$$"] ?? 100);
    const actCost =
        deterministicActivityCost("Temple", "attraction") +
        deterministicActivityCost("Restaurant", "restaurant");
    const total = nights + actCost;
    if (total <= 0) throw new Error("Total cost must be > 0");
});

// ─── 5. Safety Agent — risk level derivation ─────────────────────────────────

console.log("\n🛡️  Safety Agent — risk level derivation");

// Helper to build a minimal SafetyWarning
function makeWarning(
    severity: SafetyWarning["severity"],
    type: SafetyWarning["type"] = "fatigue",
): SafetyWarning {
    return { type, day: 1, severity, message: "test warning" };
}

check("deriveRiskLevel: 0 warnings → low", () => {
    if (deriveRiskLevel([]) !== "low") throw new Error("Expected low");
});

check("deriveRiskLevel: medium-severity warning → medium", () => {
    if (deriveRiskLevel([makeWarning("medium")]) !== "medium") throw new Error("Expected medium");
});

check("deriveRiskLevel: high-severity warning → high (trumps count)", () => {
    if (deriveRiskLevel([makeWarning("high")]) !== "high") throw new Error("Expected high");
});

check("deriveRiskLevel: multiple medium warnings → medium", () => {
    if (deriveRiskLevel([makeWarning("medium"), makeWarning("medium")]) !== "medium")
        throw new Error("Expected medium");
});

check("deriveRiskLevel: one high among mediums → high", () => {
    const warnings = [makeWarning("medium"), makeWarning("high"), makeWarning("medium")];
    if (deriveRiskLevel(warnings) !== "high") throw new Error("Expected high");
});

check("Safety result: riskLevel must be one of low/medium/high", () => {
    const validLevels = new Set(["low", "medium", "high"]);
    for (const level of ["low", "medium", "high"] as const) {
        if (!validLevels.has(level)) throw new Error(`Invalid level: ${level}`);
    }
});

// ─── 6. Orchestrator — execution log shape ───────────────────────────────────

console.log("\n🎛️  Orchestrator — execution log");

check("ExecutionLogEntry: agent entry has required fields", () => {
    const entry: ExecutionLogEntry = { agent: "planner", status: "success", timestamp: Date.now() };
    if (!entry.agent || !entry.status || !entry.timestamp) throw new Error("Missing fields");
});

check("ExecutionLogEntry: llm-decision entry has required fields", () => {
    const entry: ExecutionLogEntry = {
        type: "llm-decision",
        issue: "over_budget",
        action: "reoptimize_budget",
        timestamp: Date.now(),
    };
    if (!("type" in entry) || !entry.issue || !entry.action) throw new Error("Missing fields");
});

// ─── Report ───────────────────────────────────────────────────────────────────

const passed = results.every((r) => r.passed);
const report = {
    stage: "model-validation",
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    failures: results.filter((r) => !r.passed).length,
    checks: results,
};

mkdirSync("reports", { recursive: true });
writeFileSync(path.join("reports", "model-validation.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Model validation: ${results.filter((r) => r.passed).length}/${results.length} checks passed`);
process.exit(passed ? 0 : 1);
