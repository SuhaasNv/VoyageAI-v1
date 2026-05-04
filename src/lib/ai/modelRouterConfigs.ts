/**
 * src/lib/ai/modelRouterConfigs.ts
 *
 * Raw per-endpoint provider-matrix table.
 * Kept in a separate module with zero heavy dependencies so that both
 * modelRouter.ts (runtime) and scripts/ai-gate/model-approval.ts (CI gate)
 * share a single source of truth without pulling in Prisma, Redis, etc.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
}

export interface ProviderMatrix {
    openai: ProviderConfig;
    gemini: ProviderConfig;
}

// ─── Model name constant (overridable via env) ────────────────────────────────

export const GEMINI_FLASH =
    process.env.GEMINI_FLASH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ─── Per-endpoint config table ────────────────────────────────────────────────

export const CONFIGS: Record<string, (intent?: string) => ProviderMatrix> = {

    // ── Landing page prompt bar ────────────────────────────────────────────────
    landing: (intent) => {
        const isCreate = intent === "CREATE_TRIP";
        return {
            openai: { model: "gpt-4.1-mini", temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800,  timeoutMs: isCreate ? 15_000 : 25_000 },
            gemini: { model: GEMINI_FLASH,    temperature: isCreate ? 0.2 : 0.7, maxTokens: isCreate ? 400 : 800,  timeoutMs: isCreate ? 15_000 : 25_000 },
        };
    },

    // ── Landing preview — lightweight single-call markdown ────────────────────
    "landing-preview": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 1200, timeoutMs: 20_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 1200, timeoutMs: 20_000 },
    }),

    // ── Full itinerary generation ──────────────────────────────────────────────
    itinerary: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 8192, timeoutMs: 60_000 },
    }),

    // ── Structured diff reoptimization ────────────────────────────────────────
    reoptimize: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.3, maxTokens: 8192, timeoutMs: 45_000 },
    }),

    // ── Conversational chat companion ──────────────────────────────────────────
    chat: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    }),

    // ── Packing list ───────────────────────────────────────────────────────────
    packing: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
    }),

    // ── Trip risk simulation ───────────────────────────────────────────────────
    simulation: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 4096, timeoutMs: 30_000 },
    }),

    // ── NL → trip params extraction ───────────────────────────────────────────
    "create-trip": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.3, maxTokens: 512, timeoutMs: 15_000 },
    }),

    // ── Ticket / booking text extraction ──────────────────────────────────────
    ticket: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.2, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.2, maxTokens: 512, timeoutMs: 10_000 },
    }),

    // ── Budget constraint suggestions ─────────────────────────────────────────
    budget: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.3, maxTokens: 400, timeoutMs: 15_000 },
    }),

    // ── Dashboard contextual suggestions ──────────────────────────────────────
    suggestions: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 512, timeoutMs: 15_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 512, timeoutMs: 10_000 },
    }),

    // ── Research Agent — attraction/hotel/restaurant enrichment ───────────────
    research: () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.5, maxTokens: 4096, timeoutMs: 45_000 },
    }),

    // ── Logistics Agent — LLM-based per-day activity scheduling ───────────────
    // Low temperature for deterministic, structured output.
    // Compact token budget — each day is a small JSON array (≤ 8 activities).
    "logistics-schedule": () => ({
        openai: { model: "gpt-4.1-mini", temperature: 0.2, maxTokens: 2048, timeoutMs: 30_000 },
        gemini: { model: GEMINI_FLASH,    temperature: 0.2, maxTokens: 2048, timeoutMs: 30_000 },
    }),
};

export const DEFAULT_MATRIX: ProviderMatrix = {
    openai: { model: "gpt-4.1-mini", temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
    gemini: { model: GEMINI_FLASH,    temperature: 0.7, maxTokens: 2048, timeoutMs: 30_000 },
};
