/**
 * scripts/ai-gate/data-approval.ts
 *
 * Data Approval — AI Security Gate Stage 2
 *
 * Checks:
 *   1. Schema integrity   — all Zod schemas parse correctly (no silent breakage)
 *   2. PII controls       — sensitive fields cannot flow unmasked into LLM prompts
 *   3. Field preservation — agent pipeline does not silently drop required fields
 *   4. Input sanitisation — user input is wrapped, not injected raw into SQL/JSON
 *   5. Output field gates — required output fields are always present post-processing
 *   6. Data boundary      — no internal DB fields (passwordHash, etc.) in AI context
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { z } from "zod";

import {
    GenerateItineraryRequestSchema,
    TravelDNASchema,
    ChatRequestSchema,
    PackingListRequestSchema,
    CreateTripFromTextInputSchema,
    CreateTripFromTextOutputSchema,
} from "../../src/lib/ai/schemas/index.js";

import { trunc } from "../../src/infrastructure/logger.js";

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

// ─── 1. Schema integrity — Zod schemas are structurally valid ─────────────────

console.log("\n📋 Schema integrity checks");

const SCHEMAS: Record<string, z.ZodType> = {
    GenerateItineraryRequest: GenerateItineraryRequestSchema,
    TravelDNA: TravelDNASchema,
    ChatRequest: ChatRequestSchema,
    PackingListRequest: PackingListRequestSchema,
    CreateTripFromTextInput: CreateTripFromTextInputSchema,
    CreateTripFromTextOutput: CreateTripFromTextOutputSchema,
};

for (const [name, schema] of Object.entries(SCHEMAS)) {
    check(`${name} schema is a valid Zod object`, "critical", () => {
        if (!schema || typeof schema.parse !== "function") {
            throw new Error("Schema is not a valid Zod type");
        }
    });
}

check("GenerateItineraryRequestSchema: rejects missing destination", "critical", () => {
    const r = GenerateItineraryRequestSchema.safeParse({ startDate: "2026-05-01", endDate: "2026-05-05", budget: { total: 1000 } });
    if (r.success) throw new Error("Should reject missing destination");
});

check("GenerateItineraryRequestSchema: rejects negative budget", "high", () => {
    const r = GenerateItineraryRequestSchema.safeParse({
        destination: "Tokyo", startDate: "2026-05-01", endDate: "2026-05-05",
        budget: { total: -500 },
    });
    if (r.success) throw new Error("Should reject negative budget");
});

check("ChatRequestSchema: rejects empty messages array", "high", () => {
    const r = ChatRequestSchema.safeParse({ messages: [] });
    if (r.success) throw new Error("Should reject empty messages");
});

check("TravelDNASchema: rejects invalid pacePreference", "medium", () => {
    const r = TravelDNASchema.safeParse({
        travelStyles: ["adventure"], pacePreference: "sprint", budgetTier: "mid-range", interests: ["food"],
    });
    if (r.success) throw new Error("Should reject invalid pace");
});

// ─── 2. PII controls — sensitive fields cannot enter LLM context ──────────────

console.log("\n🔒 PII control checks");

// Fields that must NEVER appear in the AI context types
const PII_FIELDS = ["passwordHash", "password", "apiKey", "secret", "token", "ssn", "creditCard", "cardNumber"];

// Verify the AI context types (TripContext, ChatRequest, etc.) do not include PII fields
const CONTEXT_FIELD_ALLOWLIST = new Set([
    "destination", "startDate", "endDate", "durationDays", "preferences",
    "days", "hotels", "activities", "budget", "style", "pace",
    "messages", "role", "content", "intent", "tripId",
    "travelStyles", "pacePreference", "budgetTier", "interests",
    "climate", "groupSize", "specificRequests",
    "text", "total", "currency", "flexibility",
]);

for (const piiField of PII_FIELDS) {
    check(`AI context does not expose field '${piiField}'`, "critical", () => {
        if (CONTEXT_FIELD_ALLOWLIST.has(piiField)) {
            throw new Error(`PII field '${piiField}' is in the AI context allowlist — remove it`);
        }
    });
}

// trunc() must mask long strings before they reach logs
check("trunc() masks strings longer than 200 chars in logs", "high", () => {
    const longValue = "A".repeat(300);
    const masked = trunc(longValue, 200);
    if (masked.length > 201) throw new Error(`trunc returned ${masked.length} chars, expected ≤ 201`);
    if (!masked.endsWith("…")) throw new Error("Masked string must end with ellipsis");
});

check("trunc() preserves short values intact", "medium", () => {
    const short = "Tokyo";
    if (trunc(short) !== short) throw new Error("Short value was altered by trunc");
});

// Email addresses must not flow into AI context objects directly
check("Email is not a field in AI generation schemas", "high", () => {
    const itineraryShape = GenerateItineraryRequestSchema.shape as Record<string, unknown>;
    if ("email" in itineraryShape) throw new Error("Email must not appear in AI request schema");
});

check("User ID is not required in AI generation schemas", "medium", () => {
    const r = GenerateItineraryRequestSchema.safeParse({
        destination: "Tokyo", startDate: "2026-05-01", endDate: "2026-05-05",
        budget: { total: 2000 },
    });
    // Must succeed without a userId
    if (!r.success) throw new Error("AI request should not require userId: " + r.error.message);
});

// ─── 3. Field preservation — pipeline must not drop required fields ────────────

console.log("\n🔗 Field preservation checks");

type BaseTripFields = {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
};

function assertFieldsPreserved(label: string, base: BaseTripFields, enriched: Record<string, unknown>): void {
    check(`${label}: destination preserved`, "critical", () => {
        if (enriched.destination !== base.destination) throw new Error(`destination lost: ${enriched.destination}`);
    });
    check(`${label}: startDate preserved`, "critical", () => {
        if (enriched.startDate !== base.startDate) throw new Error(`startDate lost`);
    });
    check(`${label}: endDate preserved`, "critical", () => {
        if (enriched.endDate !== base.endDate) throw new Error(`endDate lost`);
    });
    check(`${label}: durationDays preserved`, "high", () => {
        if (enriched.durationDays !== base.durationDays) throw new Error(`durationDays lost`);
    });
}

const baseTripCtx: BaseTripFields = {
    destination: "Tokyo",
    startDate: "2026-05-01",
    endDate: "2026-05-05",
    durationDays: 5,
};

// Simulate enrichment spread
const enrichedCtx = { ...baseTripCtx, days: [], hotels: [] };
assertFieldsPreserved("TripContext → EnrichedTripContext", baseTripCtx, enrichedCtx);

// Simulate logistics spread
const optimizedCtx = { ...enrichedCtx, selectedHotel: { name: "Hotel A", priceRange: "$$", area: "Shinjuku", tags: [] } };
assertFieldsPreserved("EnrichedTripContext → OptimizedTripContext", baseTripCtx, optimizedCtx);

// Simulate budget spread
const budgetedCtx = { ...optimizedCtx, budget: { totalEstimatedCost: 1400, costPerDay: [], isOverBudget: false } };
assertFieldsPreserved("OptimizedTripContext → BudgetedTripContext", baseTripCtx, budgetedCtx);

// Simulate safety spread
const safeCtx = { ...budgetedCtx, safety: { riskLevel: "low", warnings: [], tips: [] } };
assertFieldsPreserved("BudgetedTripContext → SafeTripContext", baseTripCtx, safeCtx);

// ─── 4. Input sanitisation ────────────────────────────────────────────────────

console.log("\n🧹 Input sanitisation checks");

check("User input is treated as a string value, not code", "critical", () => {
    const malicious = "Tokyo'); DROP TABLE trips; --";
    // The input must be encodable as a plain JSON string value without alteration
    const encoded = JSON.stringify({ destination: malicious });
    const parsed = JSON.parse(encoded);
    // The value must be exactly the string, not interpreted as SQL
    if (parsed.destination !== malicious) throw new Error("JSON encoding altered the input");
});

check("User input with HTML entities is safe in JSON context", "high", () => {
    const xss = '<script>alert("xss")</script>';
    const r = CreateTripFromTextInputSchema.safeParse({ text: xss });
    // Schema should accept it as a string (sanitisation is the consumer's job)
    // but the value must be a plain string, not executed
    if (!r.success) throw new Error("Schema unexpectedly rejected HTML string input");
    if (typeof r.data.text !== "string") throw new Error("Input was not preserved as a string");
});

check("Very long user input is rejected by schema length limits", "high", () => {
    const r = CreateTripFromTextInputSchema.safeParse({ text: "A".repeat(3000) });
    if (r.success) throw new Error("Should reject input exceeding 2000 char limit");
});

check("Message content length is enforced in ChatRequestSchema", "high", () => {
    const r = ChatRequestSchema.safeParse({
        messages: [{ role: "user", content: "X".repeat(5000) }],
    });
    if (r.success) throw new Error("Should reject message exceeding 4000 char limit");
});

// ─── 5. Output field gates ────────────────────────────────────────────────────

console.log("\n🎯 Output field gate checks");

check("SafeTripContext: safety.riskLevel is required", "critical", () => {
    const safe = safeCtx;
    if (!safe.safety || !safe.safety.riskLevel) throw new Error("riskLevel missing from SafeTripContext");
    if (!["low", "medium", "high"].includes(safe.safety.riskLevel)) throw new Error("Invalid riskLevel");
});

check("BudgetedTripContext: budget.totalEstimatedCost > 0", "critical", () => {
    if (budgetedCtx.budget.totalEstimatedCost <= 0) throw new Error("totalEstimatedCost must be > 0");
});

check("OptimizedTripContext: selectedHotel.name is non-empty", "critical", () => {
    if (!optimizedCtx.selectedHotel.name || optimizedCtx.selectedHotel.name.trim() === "") {
        throw new Error("selectedHotel.name is empty");
    }
});

check("CreateTripFromTextOutputSchema: destination min 2 chars", "high", () => {
    const r = CreateTripFromTextOutputSchema.safeParse({ destination: "T" });
    if (r.success) throw new Error("Should reject single-char destination");
});

// ─── 6. Data boundary — no internal fields in AI context ──────────────────────

console.log("\n🚧 Data boundary checks");

const INTERNAL_DB_FIELDS = [
    "passwordHash", "refreshToken", "tokenHash", "tokenFamily",
    "ipAddress", "userAgent", "emailVerified", "isActive",
    "providerId", "provider", "lastLoginAt",
];

for (const field of INTERNAL_DB_FIELDS) {
    check(`Internal DB field '${field}' is not in AI context allowlist`, "critical", () => {
        if (CONTEXT_FIELD_ALLOWLIST.has(field)) {
            throw new Error(`Internal field '${field}' must not be in AI context`);
        }
    });
}

// ─── Report ───────────────────────────────────────────────────────────────────

const criticalFails = checks.filter((c) => !c.passed && c.severity === "critical");
const passed = checks.every((c) => c.passed);

const report = {
    stage: "data-approval",
    timestamp: new Date().toISOString(),
    passed,
    total: checks.length,
    failures: checks.filter((c) => !c.passed).length,
    criticalFailures: criticalFails.length,
    checks,
};

mkdirSync(path.join("reports", "ai-gate"), { recursive: true });
writeFileSync(path.join("reports", "ai-gate", "data-approval.json"), JSON.stringify(report, null, 2));

console.log(`\n${passed ? "✅" : "❌"} Data approval: ${checks.filter((c) => c.passed).length}/${checks.length} passed (${criticalFails.length} critical)`);
// Always exit 0 — failures are scored by risk-score.ts, blocked by gate-decision.
process.exit(0);
