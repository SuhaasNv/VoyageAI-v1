/**
 * scripts/ci/validate-prompts.ts
 *
 * Prompt Validation — Stage 9 (static contract checks)
 *
 * Validates prompt STRUCTURE, not runtime behaviour.
 * Runs against the source files directly — no LLM calls.
 *
 * Checks:
 *   1. Presence   — every agent with an LLM call has a system prompt and it is non-empty
 *   2. Length     — prompts are within token-safe limits (< 3000 chars each)
 *   3. Format     — JSON output directive present in every agent's system prompt
 *   4. No secrets — prompts must not embed API keys or credentials
 *   5. No injection vectors — template strings free of unsanitised injection points
 *   6. Required tokens — user prompts include expected interpolation slots
 *   7. Orchestrator action set — valid actions exported from orchestrator are complete
 *   8. Schema instruction — research prompt schema matches known output fields
 *
 * Note: LogisticsAgent is entirely deterministic (no LLM calls), so there is
 * no logistics system prompt to validate. AgentOrchestrator uses rule-based
 * decision logic (no LLM prompt) — its contract is validated via exported types.
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

import {
    PLANNER_SYSTEM_PROMPT,
    buildPlannerUserPrompt,
    PLANNER_REPAIR_USER_PROMPT,
} from "../../src/agents/planner/plannerPrompts.js";

import {
    RESEARCH_SYSTEM_PROMPT,
    RESEARCH_SCHEMA_INSTRUCTION,
} from "../../src/agents/research/researchPrompts.js";

import { SAFETY_TIPS_SYSTEM_PROMPT } from "../../src/agents/safety/safetyAgent.js";
import { BUDGET_SUGGESTIONS_SYSTEM_PROMPT } from "../../src/agents/budget/budgetAgent.js";
import {
    ORCHESTRATOR_VALID_ACTIONS,
    type OrchestratorAction,
} from "../../src/orchestrator/agentOrchestrator.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium";
type CheckResult = { name: string; passed: boolean; severity: Severity; error?: string };

const results: CheckResult[] = [];

function check(name: string, severity: Severity, fn: () => void): void {
    try {
        fn();
        results.push({ name, passed: true, severity });
        console.log(`  ✅ [${severity}] ${name}`);
    } catch (err) {
        results.push({ name, passed: false, severity, error: (err as Error).message });
        console.error(`  ❌ [${severity}] ${name}: ${(err as Error).message}`);
    }
}

// ─── All prompts under test ───────────────────────────────────────────────────
// Only agents that actually make LLM calls are listed.
// LogisticsAgent = deterministic (no LLM); AgentOrchestrator = rule-based decisions.

const ALL_SYSTEM_PROMPTS: Record<string, string> = {
    planner:  PLANNER_SYSTEM_PROMPT,
    research: RESEARCH_SYSTEM_PROMPT,
    budget:   BUDGET_SUGGESTIONS_SYSTEM_PROMPT,
    safety:   SAFETY_TIPS_SYSTEM_PROMPT,
};

// ─── 1. Presence — every agent with a prompt has a non-empty system prompt ────

console.log("\n📋 Prompt presence checks");

for (const [agent, prompt] of Object.entries(ALL_SYSTEM_PROMPTS)) {
    check(`${agent}: system prompt is defined and non-empty`, "critical", () => {
        if (!prompt || typeof prompt !== "string") throw new Error("Prompt is undefined or not a string");
        if (prompt.trim().length === 0) throw new Error("Prompt is blank");
    });
}

check("planner: user prompt builder returns non-empty string", "critical", () => {
    const p = buildPlannerUserPrompt("5 days in Paris");
    if (!p || p.trim().length === 0) throw new Error("buildPlannerUserPrompt returned empty string");
});

check("planner: repair prompt is defined and non-empty", "high", () => {
    if (!PLANNER_REPAIR_USER_PROMPT || PLANNER_REPAIR_USER_PROMPT.trim().length === 0) {
        throw new Error("PLANNER_REPAIR_USER_PROMPT is empty");
    }
});

check("research: schema instruction is defined and non-empty", "high", () => {
    if (!RESEARCH_SCHEMA_INSTRUCTION || RESEARCH_SCHEMA_INSTRUCTION.trim().length === 0) {
        throw new Error("RESEARCH_SCHEMA_INSTRUCTION is empty");
    }
});

// ─── 2. Length — token-safe limits ───────────────────────────────────────────

console.log("\n📏 Prompt length checks (< 3000 chars per system prompt)");

const MAX_SYSTEM_PROMPT_CHARS = 3000;

for (const [agent, prompt] of Object.entries(ALL_SYSTEM_PROMPTS)) {
    check(`${agent}: system prompt under ${MAX_SYSTEM_PROMPT_CHARS} chars`, "medium", () => {
        if (prompt.length > MAX_SYSTEM_PROMPT_CHARS) {
            throw new Error(`${prompt.length} chars exceeds limit of ${MAX_SYSTEM_PROMPT_CHARS}`);
        }
    });
}

check("planner: user prompt does not exceed 8000 chars for typical input", "medium", () => {
    const longInput = "A".repeat(1000);
    const p = buildPlannerUserPrompt(longInput);
    if (p.length > 8000) throw new Error(`Prompt too long: ${p.length} chars`);
});

// ─── 3. JSON output directive — every LLM agent must instruct JSON output ─────

console.log("\n🔑 JSON output directive checks");

for (const agent of Object.keys(ALL_SYSTEM_PROMPTS)) {
    check(`${agent}: system prompt instructs JSON output`, "critical", () => {
        const p = ALL_SYSTEM_PROMPTS[agent]!;
        if (!/json/i.test(p)) throw new Error("No JSON instruction found in system prompt");
    });
}

// ─── 4. No secrets embedded in prompts ───────────────────────────────────────

console.log("\n🔒 Secret-free prompt checks");

const SECRET_PATTERNS = [
    { name: "OpenAI key", re: /sk-[a-zA-Z0-9]{32,}/ },
    { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
    { name: "Bearer token", re: /Bearer\s+[a-zA-Z0-9._-]{20,}/i },
    { name: "Postgres connection string", re: /postgresql:\/\/[^@]+:[^@]+@/ },
    { name: "Hardcoded password", re: /password\s*[:=]\s*["'][^"']{8,}["']/i },
];

for (const [agent, prompt] of Object.entries(ALL_SYSTEM_PROMPTS)) {
    for (const { name, re } of SECRET_PATTERNS) {
        check(`${agent}: no ${name} in prompt`, "critical", () => {
            if (re.test(prompt)) throw new Error(`Pattern matched: ${name}`);
        });
    }
}

for (const { name, re } of SECRET_PATTERNS) {
    check(`planner user prompt: no ${name}`, "critical", () => {
        const p = buildPlannerUserPrompt("Trip to Paris");
        if (re.test(p)) throw new Error(`Pattern matched in user prompt: ${name}`);
    });
}

// ─── 5. No injection vectors in prompt templates ─────────────────────────────

console.log("\n🛡️  Injection vector checks");

const INJECTION_PATTERNS = [
    { name: "eval() call", re: /\beval\s*\(/ },
    { name: "exec() call", re: /\bexec\s*\(/ },
    { name: "Dynamic template execution", re: /\$\{.*?\}/ },
    { name: "SQL injection vector", re: /'\s*(OR|AND)\s+'?1'?\s*=\s*'?1/i },
];

for (const [agent, prompt] of Object.entries(ALL_SYSTEM_PROMPTS)) {
    for (const { name, re } of INJECTION_PATTERNS) {
        check(`${agent}: no ${name} in system prompt template`, "high", () => {
            if (re.test(prompt)) throw new Error(`Injection vector found: ${name}`);
        });
    }
}

// ─── 6. Required tokens in user prompt builders ───────────────────────────────

console.log("\n🔡 Required token checks");

check("planner: user prompt includes the raw user input", "critical", () => {
    const input = "I want to visit Kyoto for 4 days";
    const p = buildPlannerUserPrompt(input);
    if (!p.includes(input)) throw new Error("Raw user input not present in built prompt");
});

check("planner: repair prompt references JSON", "high", () => {
    if (!/json/i.test(PLANNER_REPAIR_USER_PROMPT)) {
        throw new Error("Repair prompt should reference JSON output");
    }
});

check("research: schema instruction references 'hotels'", "critical", () => {
    if (!/hotel/i.test(RESEARCH_SCHEMA_INSTRUCTION)) {
        throw new Error("Schema instruction missing 'hotels' field — mandatory");
    }
});

check("research: schema instruction references 'activities'", "critical", () => {
    if (!/activit/i.test(RESEARCH_SCHEMA_INSTRUCTION)) {
        throw new Error("Schema instruction missing 'activities' field");
    }
});

check("research: schema instruction references 'days'", "high", () => {
    if (!/\bdays?\b/i.test(RESEARCH_SCHEMA_INSTRUCTION)) {
        throw new Error("Schema instruction missing 'days' field");
    }
});

check("safety: tips prompt references 'tips' output field", "critical", () => {
    if (!/tips/i.test(SAFETY_TIPS_SYSTEM_PROMPT)) {
        throw new Error("Safety tips prompt must reference 'tips' output field");
    }
});

check("safety: tips prompt references 'warnings' input context", "high", () => {
    if (!/warning/i.test(SAFETY_TIPS_SYSTEM_PROMPT)) {
        throw new Error("Safety tips prompt must reference 'warnings' context");
    }
});

check("budget: suggestions prompt references 'suggestions' output field", "high", () => {
    if (!/suggestions/i.test(BUDGET_SUGGESTIONS_SYSTEM_PROMPT)) {
        throw new Error("Budget prompt must reference 'suggestions' output field");
    }
});

// ─── 7. Orchestrator action set — validated via exported runtime array ─────────
//
// AgentOrchestrator no longer uses an LLM for decisions (rule-based).
// We validate the exported ORCHESTRATOR_VALID_ACTIONS array is complete.

console.log("\n🎛️  Orchestrator action set completeness");

const EXPECTED_ACTIONS: OrchestratorAction[] = [
    "reoptimize_budget",
    "rerun_logistics",
    "ask_user",
    "proceed",
];

for (const action of EXPECTED_ACTIONS) {
    check(`orchestrator: action '${action}' is in ORCHESTRATOR_VALID_ACTIONS`, "critical", () => {
        if (!(ORCHESTRATOR_VALID_ACTIONS as readonly string[]).includes(action)) {
            throw new Error(`Action '${action}' missing from ORCHESTRATOR_VALID_ACTIONS`);
        }
    });
}

check("orchestrator: ORCHESTRATOR_VALID_ACTIONS contains exactly 4 actions", "high", () => {
    if (ORCHESTRATOR_VALID_ACTIONS.length !== EXPECTED_ACTIONS.length) {
        throw new Error(
            `Expected ${EXPECTED_ACTIONS.length} actions, got ${ORCHESTRATOR_VALID_ACTIONS.length}: ${ORCHESTRATOR_VALID_ACTIONS.join(", ")}`
        );
    }
});

// ─── 8. Research schema instruction field coverage ────────────────────────────

console.log("\n🔬 Research schema field coverage");

const REQUIRED_SCHEMA_FIELDS = ["name", "type", "description", "priceRange", "area", "tags"];

for (const field of REQUIRED_SCHEMA_FIELDS) {
    check(`research schema instruction: references field '${field}'`, "high", () => {
        if (!RESEARCH_SCHEMA_INSTRUCTION.includes(field)) {
            throw new Error(`Field '${field}' not referenced in schema instruction`);
        }
    });
}

// ─── Report ───────────────────────────────────────────────────────────────────

const criticalFails = results.filter((r) => !r.passed && r.severity === "critical");
const passed = results.every((r) => r.passed);

const report = {
    stage: "prompt-validation",
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    failures: results.filter((r) => !r.passed).length,
    criticalFailures: criticalFails.length,
    checks: results,
};

mkdirSync("reports", { recursive: true });
writeFileSync(path.join("reports", "prompt-validation.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Prompt validation: ${results.filter((r) => r.passed).length}/${results.length} checks passed (${criticalFails.length} critical failures)`);

if (criticalFails.length > 0) {
    console.error("\nCritical failures:");
    for (const f of criticalFails) console.error(`  - ${f.name}: ${f.error}`);
}

process.exit(passed ? 0 : 1);
