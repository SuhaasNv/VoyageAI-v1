import { LLMClientFactory, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { logError } from "@/infrastructure/logger";

// ─────────────────────────────────────────
//  Domain Types
// ─────────────────────────────────────────

export type ScheduledActivity = {
  name: string;
  type: "attraction" | "experience" | "restaurant";
  description: string;
  estimatedCost?: number;
  timeSlot: "morning" | "afternoon" | "evening";
};

export type OptimizedDay = {
  day: number;
  theme: string;
  activities: ScheduledActivity[];
};

export type BudgetedTripContext = {
  destination: string;
  durationDays: number;
  preferences?: {
    budget?: number;
    style?: string;
    pace?: string;
  };
  days: OptimizedDay[];
  /** Present when output came from BudgetAgent (full OptimizedTripContext). */
  selectedHotel?: {
    name: string;
    priceRange: string;
    area: string;
    tags: string[];
    rating?: number;
  };
  budget: {
    totalEstimatedCost: number;
    costPerDay?: number[];
    isOverBudget: boolean;
    budgetGap?: number;
    suggestions?: string[];
  };
};

export type SafetyResult = {
  riskLevel: "low" | "medium" | "high";
  warnings: string[];
  tips: string[];
};

export type SafeTripContext = BudgetedTripContext & {
  safety: SafetyResult;
};

// ─────────────────────────────────────────
//  Risk Signal Pre-Analysis
// ─────────────────────────────────────────

type RiskSignals = {
  maxActivitiesInDay: number;
  hasFastPace: boolean;
  isOverBudget: boolean;
  hasOutdoorHeavyDay: boolean;
  hasFamousAttractions: boolean;
  destination: string;
};

const FAMOUS_ATTRACTION_KEYWORDS = [
  "eiffel", "louvre", "colosseum", "sagrada", "big ben", "times square",
  "shibuya", "senso", "forbidden city", "taj mahal", "burj", "opera house",
  "central park", "notre dame", "acropolis", "angkor", "machu picchu",
  "tower bridge", "versailles", "uffizi", "prado", "hagia sofia",
];

const OUTDOOR_ACTIVITY_KEYWORDS = [
  "park", "beach", "hike", "trail", "outdoor", "garden", "walk", "tour",
  "cruise", "market", "square", "promenade", "waterfall", "mountain",
];

function analyzeRiskSignals(context: BudgetedTripContext): RiskSignals {
  const activityCountsPerDay = context.days.map((d) => d.activities.length);
  const maxActivitiesInDay = Math.max(0, ...activityCountsPerDay);

  const allActivities = context.days.flatMap((d) => d.activities);

  const hasOutdoorHeavyDay = context.days.some((day) => {
    const outdoorCount = day.activities.filter((a) =>
      OUTDOOR_ACTIVITY_KEYWORDS.some(
        (kw) =>
          a.name.toLowerCase().includes(kw) ||
          a.description.toLowerCase().includes(kw)
      )
    ).length;
    return outdoorCount >= 2;
  });

  const hasFamousAttractions = allActivities.some((a) =>
    FAMOUS_ATTRACTION_KEYWORDS.some(
      (kw) =>
        a.name.toLowerCase().includes(kw) ||
        a.description.toLowerCase().includes(kw)
    )
  );

  return {
    maxActivitiesInDay,
    hasFastPace: context.preferences?.pace?.toLowerCase() === "fast",
    isOverBudget: context.budget.isOverBudget,
    hasOutdoorHeavyDay,
    hasFamousAttractions,
    destination: context.destination,
  };
}

// ─────────────────────────────────────────
//  Prompt Builders
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are a travel safety analyst.
Your task is to assess a finalized travel itinerary for risks and return a structured safety evaluation.

Rules:
- Do NOT suggest changes to the itinerary
- Fatigue risk: >4 activities/day = medium, >5 = high
- Fast pace elevates fatigue risk by one level
- Weather risk: flag outdoor-heavy days
- Crowd risk: flag famous tourist attractions
- Budget stress: flag if trip is over budget
- Warnings: max 3, one line each, clear and practical
- Tips: max 4, actionable, one line each
- Risk level: low (0 warnings), medium (1-2 warnings), high (3+ warnings OR severe fatigue)
- Always include a destination-specific crowding tip

Return ONLY valid JSON in this exact shape, no markdown, no explanation:
{"riskLevel":"low|medium|high","warnings":["..."],"tips":["..."]}`;

function buildUserPrompt(
  context: BudgetedTripContext,
  signals: RiskSignals
): string {
  const activitySummary = context.days
    .map(
      (d) =>
        `Day ${d.day} (${d.theme}): ${d.activities.length} activities — ${d.activities
          .map((a) => a.name)
          .join(", ")}`
    )
    .join("\n");

  return `Trip: ${context.destination} | ${context.durationDays} days | Pace: ${context.preferences?.pace ?? "moderate"}

Risk signals detected:
- Max activities in a single day: ${signals.maxActivitiesInDay}
- Fast pace preference: ${signals.hasFastPace}
- Over budget: ${signals.isOverBudget}
- Outdoor-heavy day detected: ${signals.hasOutdoorHeavyDay}
- Famous tourist attractions present: ${signals.hasFamousAttractions}

Daily breakdown:
${activitySummary}

Analyze the above and return the SafetyResult JSON.`;
}

// ─────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────

const VALID_RISK_LEVELS = new Set(["low", "medium", "high"]);

function validateAndClamp(raw: unknown): SafetyResult {
  const fallback: SafetyResult = { riskLevel: "low", warnings: [], tips: [] };

  if (!raw || typeof raw !== "object") return fallback;

  const result = raw as Record<string, unknown>;

  const riskLevel = result.riskLevel;
  if (typeof riskLevel !== "string" || !VALID_RISK_LEVELS.has(riskLevel)) {
    return fallback;
  }

  const warnings = Array.isArray(result.warnings)
    ? (result.warnings as unknown[])
        .filter((w): w is string => typeof w === "string")
        .slice(0, 3)
    : [];

  const tips = Array.isArray(result.tips)
    ? (result.tips as unknown[])
        .filter((t): t is string => typeof t === "string")
        .slice(0, 4)
    : [];

  // Re-derive risk level from warning count to ensure internal consistency
  let derivedRiskLevel = riskLevel as SafetyResult["riskLevel"];
  if (warnings.length >= 3) {
    derivedRiskLevel = "high";
  } else if (warnings.length >= 1 && derivedRiskLevel === "low") {
    derivedRiskLevel = "medium";
  }

  return { riskLevel: derivedRiskLevel, warnings, tips };
}

// ─────────────────────────────────────────
//  SafetyAgent
// ─────────────────────────────────────────

export class SafetyAgent {
  private readonly llmClient = LLMClientFactory.create({ agent: "safety" });

  async run(context: BudgetedTripContext): Promise<SafeTripContext> {
    const signals = analyzeRiskSignals(context);

    let safety: SafetyResult = { riskLevel: "low", warnings: [], tips: [] };

    try {
      const response = await executeWithRetry(
        this.llmClient,
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(context, signals) },
        ],
        {
          temperature: 0.4,
          responseFormat: "json",
          timeoutMs: 20000,
        }
      );

      const parsed = parseJSONResponse<unknown>(response.content);
      safety = validateAndClamp(parsed);
    } catch (err) {
      logError("[SafetyAgent] LLM call failed, using safe fallback", err);
      safety = { riskLevel: "low", warnings: [], tips: [] };
    }

    return { ...context, safety };
  }
}
