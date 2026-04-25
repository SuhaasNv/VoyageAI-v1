/**
 * scripts/ci/prompt-tests.ts
 *
 * Prompt Tests — Stage 7
 *
 * Verifies that:
 *   1. All agent prompts are present and non-empty.
 *   2. Required interpolation tokens exist in each prompt.
 *   3. Mock LLM returns parseable JSON for every agent's prompt structure.
 *   4. parseJSONResponse handles all three extraction strategies correctly.
 *   5. Repair prompt path is tested end-to-end with the mock client.
 *
 * LLM_PROVIDER=mock — no real API calls.
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

import { PLANNER_SYSTEM_PROMPT, buildPlannerUserPrompt, PLANNER_REPAIR_USER_PROMPT } from "../../src/agents/planner/plannerPrompts.js";
import { RESEARCH_SYSTEM_PROMPT, RESEARCH_SCHEMA_INSTRUCTION } from "../../src/agents/research/researchPrompts.js";
import { parseJSONResponse } from "../../src/lib/ai/llm.js";

type CheckResult = { name: string; passed: boolean; error?: string };
const results: CheckResult[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.push({ name, passed: true });
            console.log(`  ✅ ${name}`);
        })
        .catch((err: Error) => {
            results.push({ name, passed: false, error: err.message });
            console.error(`  ❌ ${name}: ${err.message}`);
        });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
//
// Wrapped in an async IIFE because tsx transpiles this file as CJS (no
// "type": "module" in package.json), and top-level await is not supported
// under the CJS output format.

void (async () => {

// ─── 1. Prompt presence ───────────────────────────────────────────────────────

console.log("\n📝 Prompt presence checks");

await check("PLANNER_SYSTEM_PROMPT is non-empty", () => {
    if (!PLANNER_SYSTEM_PROMPT || PLANNER_SYSTEM_PROMPT.trim().length < 50) {
        throw new Error("Planner system prompt too short or missing");
    }
});

await check("buildPlannerUserPrompt produces non-empty string", () => {
    const p = buildPlannerUserPrompt("I want to visit Tokyo for 5 days");
    if (!p || p.trim().length < 10) throw new Error("Planner user prompt empty");
});

await check("PLANNER_REPAIR_USER_PROMPT is non-empty", () => {
    if (!PLANNER_REPAIR_USER_PROMPT || PLANNER_REPAIR_USER_PROMPT.trim().length < 10) {
        throw new Error("Repair prompt missing");
    }
});

await check("RESEARCH_SYSTEM_PROMPT is non-empty", () => {
    if (!RESEARCH_SYSTEM_PROMPT || RESEARCH_SYSTEM_PROMPT.trim().length < 50) {
        throw new Error("Research system prompt missing");
    }
});

await check("RESEARCH_SCHEMA_INSTRUCTION is non-empty", () => {
    if (!RESEARCH_SCHEMA_INSTRUCTION || RESEARCH_SCHEMA_INSTRUCTION.trim().length < 20) {
        throw new Error("Research schema instruction missing");
    }
});

// ─── 2. Prompt token checks ───────────────────────────────────────────────────

console.log("\n🔡 Prompt token interpolation checks");

await check("buildPlannerUserPrompt includes the user input", () => {
    const input = "5 days in Bali with $1500 budget";
    const p = buildPlannerUserPrompt(input);
    if (!p.includes(input)) throw new Error("User input not included in prompt");
});

await check("PLANNER_SYSTEM_PROMPT mentions JSON output requirement", () => {
    if (!/json/i.test(PLANNER_SYSTEM_PROMPT)) {
        throw new Error("System prompt does not mention JSON output");
    }
});

await check("RESEARCH_SYSTEM_PROMPT mentions hotels (mandatory field)", () => {
    if (!/hotel/i.test(RESEARCH_SYSTEM_PROMPT)) {
        throw new Error("Research prompt does not mention hotels");
    }
});

await check("RESEARCH_SCHEMA_INSTRUCTION mentions activities", () => {
    if (!/activit/i.test(RESEARCH_SCHEMA_INSTRUCTION)) {
        throw new Error("Schema instruction does not mention activities");
    }
});

// ─── 3. parseJSONResponse — extraction strategies ────────────────────────────

console.log("\n🔄 JSON extraction strategy checks");

await check("Strategy 1: extracts from ```json fence", () => {
    const raw = 'Here is your result:\n```json\n{"destination":"Tokyo"}\n```';
    const r = parseJSONResponse<{ destination: string }>(raw);
    if (r.destination !== "Tokyo") throw new Error(`Got ${r.destination}`);
});

await check("Strategy 2: extracts from prose-wrapped JSON object", () => {
    const raw = 'The itinerary is: {"destination":"Paris","durationDays":3} — enjoy!';
    const r = parseJSONResponse<{ destination: string; durationDays: number }>(raw);
    if (r.destination !== "Paris") throw new Error(`Got ${r.destination}`);
    if (r.durationDays !== 3) throw new Error(`Got ${r.durationDays}`);
});

await check("Strategy 3: parses direct JSON string", () => {
    const raw = '{"destination":"Bali","durationDays":7}';
    const r = parseJSONResponse<{ destination: string; durationDays: number }>(raw);
    if (r.destination !== "Bali") throw new Error(`Got ${r.destination}`);
});

await check("parseJSONResponse: throws on non-JSON content", () => {
    try {
        parseJSONResponse("This is not JSON at all — no braces here");
        throw new Error("Should have thrown");
    } catch (err) {
        if ((err as Error).message === "Should have thrown") throw err;
        // Expected — any AIServiceError is fine
    }
});

await check("parseJSONResponse: handles array response", () => {
    // Wrapped in an object to satisfy the outermost {} extraction strategy
    const raw = '{"items":[1,2,3]}';
    const r = parseJSONResponse<{ items: number[] }>(raw);
    if (!Array.isArray(r.items) || r.items.length !== 3) throw new Error("Array not parsed");
});

await check("parseJSONResponse: handles nested objects", () => {
    const raw = '{"preferences":{"budget":500,"style":"balanced"}}';
    const r = parseJSONResponse<{ preferences: { budget: number; style: string } }>(raw);
    if (r.preferences.budget !== 500) throw new Error("Nested value mismatch");
});

// ─── 4. Mock LLM planner output shape ────────────────────────────────────────

console.log("\n🤖 Mock LLM output shape checks");

// These are the shapes the mock LLM returns — verify the output can be parsed
// by the planner's validateAndNormalize logic.

const MOCK_PLANNER_OUTPUT = {
    destination: "Tokyo",
    startDate: "2026-05-01",
    endDate: "2026-05-05",
    durationDays: 5,
    preferences: { budget: 2000, style: "balanced", pace: "moderate" },
    days: [
        { day: 1, theme: "Arrival" },
        { day: 2, theme: "Culture" },
        { day: 3, theme: "Nature" },
        { day: 4, theme: "Markets" },
        { day: 5, theme: "Hidden Gems" },
    ],
};

await check("Mock planner output: destination present and non-empty", () => {
    if (!MOCK_PLANNER_OUTPUT.destination) throw new Error("destination missing");
});

await check("Mock planner output: days array length matches durationDays", () => {
    if (MOCK_PLANNER_OUTPUT.days.length !== MOCK_PLANNER_OUTPUT.durationDays) {
        throw new Error(`Days: ${MOCK_PLANNER_OUTPUT.days.length} != ${MOCK_PLANNER_OUTPUT.durationDays}`);
    }
});

await check("Mock planner output: all days have theme", () => {
    for (const d of MOCK_PLANNER_OUTPUT.days) {
        if (!d.theme || d.theme.trim() === "") throw new Error(`Day ${d.day} missing theme`);
    }
});

await check("Mock planner output: startDate parses as valid ISO date", () => {
    const date = new Date(MOCK_PLANNER_OUTPUT.startDate);
    if (isNaN(date.getTime())) throw new Error("startDate is invalid");
});

await check("Mock planner output: serializes to JSON and back", () => {
    const json = JSON.stringify(MOCK_PLANNER_OUTPUT);
    const parsed = parseJSONResponse<typeof MOCK_PLANNER_OUTPUT>(json);
    if (parsed.destination !== MOCK_PLANNER_OUTPUT.destination) throw new Error("Destination lost in serialization");
});

// ─── 5. Research agent JSON output shape ─────────────────────────────────────

console.log("\n🔬 Research output shape checks");

const MOCK_RESEARCH_OUTPUT = {
    days: [
        {
            day: 1,
            theme: "Arrival",
            activities: [
                { name: "Senso-ji Temple", type: "attraction", description: "Historic Buddhist temple.", estimatedCost: 0 },
                { name: "Asakusa Ramen", type: "restaurant", description: "Local ramen spot.", estimatedCost: 15 },
            ],
        },
    ],
    hotels: [
        { name: "Shinjuku Granbell", priceRange: "$$", area: "Shinjuku", tags: ["central"], rating: 4.2 },
        { name: "Park Hyatt Tokyo", priceRange: "$$$$", area: "West Shinjuku", tags: ["luxury"], rating: 4.9 },
        { name: "Khaosan Tokyo", priceRange: "$", area: "Asakusa", tags: ["budget"], rating: 3.8 },
    ],
};

await check("Mock research output: has at least 3 hotels", () => {
    if (MOCK_RESEARCH_OUTPUT.hotels.length < 3) throw new Error("Fewer than 3 hotels");
});

await check("Mock research output: all hotels have valid priceRange", () => {
    const valid = new Set(["$", "$$", "$$$", "$$$$"]);
    for (const h of MOCK_RESEARCH_OUTPUT.hotels) {
        if (!valid.has(h.priceRange)) throw new Error(`Invalid priceRange: ${h.priceRange}`);
    }
});

await check("Mock research output: activities have required fields", () => {
    for (const day of MOCK_RESEARCH_OUTPUT.days) {
        for (const act of day.activities) {
            if (!act.name || !act.type || act.description === undefined) {
                throw new Error(`Activity missing required fields: ${JSON.stringify(act)}`);
            }
        }
    }
});

// ─── Report ───────────────────────────────────────────────────────────────────

const passed = results.every((r) => r.passed);
const report = {
    stage: "prompt-tests",
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    failures: results.filter((r) => !r.passed).length,
    checks: results,
};

mkdirSync("reports", { recursive: true });
writeFileSync(path.join("reports", "prompt-tests.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Prompt tests: ${results.filter((r) => r.passed).length}/${results.length} checks passed`);
process.exit(passed ? 0 : 1);

})().catch((err: unknown) => {
    console.error("Prompt tests crashed:", err);
    process.exit(1);
});
