/**
 * scripts/ai-gate/model-approval.ts
 *
 * Model Approval — AI Security Gate Stage 1
 *
 * Checks:
 *   1. Approved model list  — every model in CONFIGS is on the allowlist
 *   2. Forbidden models     — no deprecated / unsafe models are referenced
 *   3. Temperature bounds   — all endpoints: 0.0 ≤ temp ≤ 1.0
 *   4. Token bounds         — maxTokens within provider limits
 *   5. Timeout bounds       — timeoutMs: 5s ≤ t ≤ 120s
 *   6. Endpoint coverage    — every known endpoint has an explicit config
 *   7. Fallback integrity   — both OpenAI and Gemini configs exist per endpoint
 *   8. Provider env safety  — LLM_PROVIDER=mock must not reach production
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

import { CONFIGS } from "../../src/lib/ai/modelRouterConfigs.js";
import type { ProviderMatrix } from "../../src/lib/ai/modelRouterConfigs.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium";
type Check = { name: string; passed: boolean; severity: Severity; error?: string };

const checks: Check[] = [];

function check(name: string, severity: Severity, fn: () => void): void {
    try {
        fn();
        checks.push({ name, passed: true, severity });
        console.log(`  ✅ [${severity}] ${name}`);
    } catch (err) {
        checks.push({ name, passed: false, severity, error: (err as Error).message });
        console.error(`  ❌ [${severity}] ${name}: ${(err as Error).message}`);
    }
}

// ─── Approved model registry ──────────────────────────────────────────────────
// Any model added to modelRouterConfigs.ts must appear here first.

const APPROVED_OPENAI_MODELS = new Set([
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
]);

const APPROVED_GEMINI_MODELS = new Set([
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
]);

// Models that must never be used in production (deprecated, unsafe, or data-leaking)
const FORBIDDEN_MODELS = new Set([
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-instruct",
    "gpt-4-32k",          // Deprecated
    "text-davinci-003",   // Legacy completion model
    "text-davinci-002",
    "davinci",
    "curie",
    "babbage",
    "ada",
    "gemini-pro",         // Old, superseded
]);

// ─── Evaluate every endpoint at default (no intent) ──────────────────────────
// Calling fn() with no argument produces the standard non-intent-specific matrix.
// The landing endpoint has an intent-dependent branch; default covers the common path.

const LIVE_CONFIGS: Record<string, ProviderMatrix> = Object.fromEntries(
    Object.entries(CONFIGS).map(([endpoint, fn]) => [endpoint, fn()])
);

const KNOWN_ENDPOINTS = Object.keys(LIVE_CONFIGS);

// ─── 1. Approved model list ───────────────────────────────────────────────────

console.log("\n📋 Approved model list checks");

for (const [endpoint, cfg] of Object.entries(LIVE_CONFIGS)) {
    check(`${endpoint} → OpenAI model is approved`, "critical", () => {
        if (!APPROVED_OPENAI_MODELS.has(cfg.openai.model)) {
            throw new Error(`Model '${cfg.openai.model}' is not on the approved OpenAI list`);
        }
    });
    check(`${endpoint} → Gemini model is approved`, "critical", () => {
        if (!APPROVED_GEMINI_MODELS.has(cfg.gemini.model)) {
            throw new Error(`Model '${cfg.gemini.model}' is not on the approved Gemini list`);
        }
    });
}

// ─── 2. Forbidden models ──────────────────────────────────────────────────────

console.log("\n🚫 Forbidden model checks");

const allModels = Object.values(LIVE_CONFIGS).flatMap((c) => [c.openai.model, c.gemini.model]);

for (const model of new Set(allModels)) {
    check(`Model '${model}' is not on the forbidden list`, "critical", () => {
        if (FORBIDDEN_MODELS.has(model)) {
            throw new Error(`Forbidden model '${model}' is referenced in the router`);
        }
    });
}

// ─── 3. Temperature bounds ────────────────────────────────────────────────────

console.log("\n🌡️  Temperature bound checks");

for (const [endpoint, cfg] of Object.entries(LIVE_CONFIGS)) {
    for (const [provider, pcfg] of Object.entries(cfg) as [string, ProviderMatrix["openai"]][]) {
        check(`${endpoint}/${provider}: temperature in [0.0, 1.0]`, "high", () => {
            if (pcfg.temperature < 0 || pcfg.temperature > 1) {
                throw new Error(`temperature ${pcfg.temperature} out of bounds`);
            }
        });
    }
}

// Creative/generative endpoints should not use temperature = 0 (too deterministic)
const GENERATIVE_ENDPOINTS = ["itinerary", "chat", "packing", "suggestions", "landing"];
for (const ep of GENERATIVE_ENDPOINTS) {
    check(`${ep}/openai: temperature > 0 (not fully deterministic)`, "medium", () => {
        const t = LIVE_CONFIGS[ep]?.openai.temperature ?? 0;
        if (t === 0) throw new Error(`temperature is 0 — generative endpoint should have t > 0`);
    });
}

// Extraction/parsing endpoints should use low temperature
const EXTRACTION_ENDPOINTS = ["ticket", "create-trip", "budget", "reoptimize"];
for (const ep of EXTRACTION_ENDPOINTS) {
    check(`${ep}/openai: temperature ≤ 0.4 (extraction endpoint)`, "medium", () => {
        const t = LIVE_CONFIGS[ep]?.openai.temperature ?? 1;
        if (t > 0.4) throw new Error(`temperature ${t} too high for extraction — should be ≤ 0.4`);
    });
}

// ─── 4. Token bounds ─────────────────────────────────────────────────────────

console.log("\n🔢 Token bound checks");

const MAX_OPENAI_TOKENS = 16384;
const MAX_GEMINI_TOKENS = 65536;
const MIN_TOKENS = 128;

for (const [endpoint, cfg] of Object.entries(LIVE_CONFIGS)) {
    check(`${endpoint}/openai: maxTokens in [${MIN_TOKENS}, ${MAX_OPENAI_TOKENS}]`, "high", () => {
        if (cfg.openai.maxTokens < MIN_TOKENS || cfg.openai.maxTokens > MAX_OPENAI_TOKENS) {
            throw new Error(`maxTokens ${cfg.openai.maxTokens} out of bounds [${MIN_TOKENS}, ${MAX_OPENAI_TOKENS}]`);
        }
    });
    check(`${endpoint}/gemini: maxTokens in [${MIN_TOKENS}, ${MAX_GEMINI_TOKENS}]`, "high", () => {
        if (cfg.gemini.maxTokens < MIN_TOKENS || cfg.gemini.maxTokens > MAX_GEMINI_TOKENS) {
            throw new Error(`maxTokens ${cfg.gemini.maxTokens} out of bounds [${MIN_TOKENS}, ${MAX_GEMINI_TOKENS}]`);
        }
    });
}

// ─── 5. Timeout bounds ───────────────────────────────────────────────────────

console.log("\n⏱️  Timeout bound checks");

const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

for (const [endpoint, cfg] of Object.entries(LIVE_CONFIGS)) {
    for (const [provider, pcfg] of Object.entries(cfg) as [string, ProviderMatrix["openai"]][]) {
        check(`${endpoint}/${provider}: timeout in [${MIN_TIMEOUT_MS}ms, ${MAX_TIMEOUT_MS}ms]`, "high", () => {
            if (pcfg.timeoutMs < MIN_TIMEOUT_MS || pcfg.timeoutMs > MAX_TIMEOUT_MS) {
                throw new Error(`timeoutMs ${pcfg.timeoutMs} out of bounds`);
            }
        });
    }
}

// ─── 6. Endpoint coverage ────────────────────────────────────────────────────

console.log("\n🗺️  Endpoint coverage checks");

for (const ep of KNOWN_ENDPOINTS) {
    check(`Endpoint '${ep}' has an explicit config`, "high", () => {
        if (!LIVE_CONFIGS[ep]) throw new Error(`No config found for endpoint '${ep}'`);
    });
}

// ─── 7. Fallback integrity ────────────────────────────────────────────────────

console.log("\n🔄 Fallback integrity checks");

for (const [endpoint, cfg] of Object.entries(LIVE_CONFIGS)) {
    check(`${endpoint}: both OpenAI and Gemini configs are present`, "critical", () => {
        if (!cfg.openai?.model) throw new Error("Missing OpenAI config");
        if (!cfg.gemini?.model) throw new Error("Missing Gemini config");
    });
    check(`${endpoint}: OpenAI and Gemini have same maxTokens (symmetric fallback)`, "medium", () => {
        if (cfg.openai.maxTokens !== cfg.gemini.maxTokens) {
            throw new Error(`Token asymmetry: OpenAI=${cfg.openai.maxTokens}, Gemini=${cfg.gemini.maxTokens}`);
        }
    });
}

// ─── 8. Provider env safety ───────────────────────────────────────────────────

console.log("\n🔒 Provider environment safety");

check("LLM_PROVIDER=mock only active in CI (not production)", "critical", () => {
    const provider = process.env.LLM_PROVIDER;
    const nodeEnv = process.env.NODE_ENV;
    if (provider === "mock" && nodeEnv === "production") {
        throw new Error("LLM_PROVIDER=mock must never run in NODE_ENV=production");
    }
});

check("SKIP_ENV_VALIDATION is not set in production context", "critical", () => {
    const skip = process.env.SKIP_ENV_VALIDATION;
    const nodeEnv = process.env.NODE_ENV;
    if (skip === "1" && nodeEnv === "production") {
        throw new Error("SKIP_ENV_VALIDATION=1 must never be set in production");
    }
});

// ─── Report ───────────────────────────────────────────────────────────────────

const criticalFails = checks.filter((c) => !c.passed && c.severity === "critical");
const passed = checks.every((c) => c.passed);

const report = {
    stage: "model-approval",
    timestamp: new Date().toISOString(),
    passed,
    total: checks.length,
    failures: checks.filter((c) => !c.passed).length,
    criticalFailures: criticalFails.length,
    checks,
};

mkdirSync(path.join("reports", "ai-gate"), { recursive: true });
writeFileSync(path.join("reports", "ai-gate", "model-approval.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Model approval: ${checks.filter((c) => c.passed).length}/${checks.length} passed (${criticalFails.length} critical)`);
process.exit(passed ? 0 : 1);
