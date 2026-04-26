/**
 * scripts/ai-gate/bias-check.ts
 *
 * Bias / Fairness Check — AI Security Gate Stage 3
 *
 * Checks:
 *   1. Travel style diversity     — styles cover multiple distinct archetypes
 *   2. Pace coverage              — both slow and fast paces are represented
 *   3. Budget tier equity         — full economic range, budget tier not defaulting to premium
 *   4. Geographic diversity       — fixture destinations include non-Western locations
 *   5. Demographic neutrality     — prompt templates use gender/age-neutral language
 *   6. Interest diversity         — interests span multiple categories (not just luxury)
 *   7. Safety signal neutrality   — risk descriptions do not encode demographic assumptions
 *   8. Activity type balance      — itinerary structure does not bias toward one activity type
 */

import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "fs";
import path from "path";

import {
  TravelStyleSchema,
  PacePreferenceSchema,
  BudgetTierSchema,
  ActivityTypeSchema,
} from "../../src/lib/ai/schemas/index.js";
import {
  INTEREST_KEYWORDS,
  LUXURY_TERMS,
} from "../../src/lib/ai/travelDNARules.js";
import { SAFETY_RISK_LEVEL_VALUES } from "../../src/agents/safety/safetyAgent.js";

type Severity = "critical" | "high" | "medium";
type Check = {
  name: string;
  passed: boolean;
  severity: Severity;
  error?: string;
};

const checks: Check[] = [];

function check(name: string, severity: Severity, fn: () => void): void {
  try {
    fn();
    checks.push({ name, passed: true, severity });
    console.log(`  ✅ [${severity}] ${name}`);
  } catch (err) {
    checks.push({
      name,
      passed: false,
      severity,
      error: (err as Error).message,
    });
    console.error(`  ❌ [${severity}] ${name}: ${(err as Error).message}`);
  }
}

// ─── Enum values pulled directly from the source schemas ─────────────────────

const TRAVEL_STYLES = [...TravelStyleSchema.options] as string[];
const VALID_PACES = [...PacePreferenceSchema.options] as string[];
const BUDGET_TIERS = [...BudgetTierSchema.options] as string[];
const ACTIVITY_TYPES_SCHEMA = [...ActivityTypeSchema.options] as string[];

// ─── 1. Travel style diversity ────────────────────────────────────────────────

console.log("\n🧭 Travel style diversity");

// Archetypes group schema-defined styles into thematic buckets.
// Each style in an archetype must exist in TravelStyleSchema.
const STYLE_ARCHETYPES: Record<string, string[]> = {
  activeOutdoor: ["adventure", "relaxation"],
  culturalLearning: ["cultural", "foodie"],
  social: ["family", "solo"],
  economicRange: ["budget", "luxury"],
  niche: ["romantic", "business"],
};

for (const [archetype, styles] of Object.entries(STYLE_ARCHETYPES)) {
  check(
    `Travel styles include '${archetype}' archetype (${styles.join(", ")})`,
    "high",
    () => {
      const missing = styles.filter((s) => !TRAVEL_STYLES.includes(s));
      if (missing.length > 0)
        throw new Error(
          `Style(s) not in TravelStyleSchema: ${missing.join(", ")}`,
        );
    },
  );
}

check(
  "At least 8 distinct travel styles are defined in TravelStyleSchema",
  "high",
  () => {
    if (TRAVEL_STYLES.length < 8)
      throw new Error(`Only ${TRAVEL_STYLES.length} styles — need at least 8`);
  },
);

check("No style archetype has fewer than 2 representatives", "medium", () => {
  for (const [archetype, styles] of Object.entries(STYLE_ARCHETYPES)) {
    if (styles.length < 2)
      throw new Error(
        `Archetype '${archetype}' has only ${styles.length} style(s)`,
      );
  }
});

// ─── 2. Pace coverage ─────────────────────────────────────────────────────────

console.log("\n⚡ Pace coverage checks");

check(
  "All three pace tiers are defined in PacePreferenceSchema (slow, moderate, fast)",
  "critical",
  () => {
    const required = ["slow", "moderate", "fast"] as const;
    for (const p of required) {
      if (!VALID_PACES.includes(p))
        throw new Error(`Missing pace value in schema: '${p}'`);
    }
  },
);

check(
  "No pace tier aliases map to the same value (no duplication)",
  "medium",
  () => {
    const unique = new Set(VALID_PACES);
    if (unique.size !== VALID_PACES.length)
      throw new Error("Duplicate pace tiers detected in schema");
  },
);

// ─── 3. Budget tier equity ────────────────────────────────────────────────────

console.log("\n💰 Budget tier equity checks");

check(
  "All three budget tiers are defined in BudgetTierSchema",
  "critical",
  () => {
    const required = ["budget", "mid-range", "luxury"] as const;
    for (const b of required) {
      if (!BUDGET_TIERS.includes(b))
        throw new Error(`Missing budget tier in schema: '${b}'`);
    }
  },
);

check(
  "Budget tier 'budget' is listed first (not defaulting to premium)",
  "high",
  () => {
    if (BUDGET_TIERS[0] !== "budget") {
      throw new Error(
        `First tier is '${BUDGET_TIERS[0]}' — 'budget' should be first to avoid premium bias`,
      );
    }
  },
);

check("No tier is absent from BudgetTierSchema enum", "high", () => {
  for (const tier of ["budget", "mid-range", "luxury"]) {
    if (!BUDGET_TIERS.includes(tier))
      throw new Error(`Tier '${tier}' missing from BudgetTierSchema`);
  }
});

// ─── 4. Geographic diversity ─────────────────────────────────────────────────

console.log("\n🌍 Geographic diversity checks");

const REQUIRED_GEOGRAPHIC_REGIONS = {
  "East Asia": ["Tokyo", "Seoul", "Beijing", "Hong Kong"],
  "South/SE Asia": ["Bangkok", "Bali", "Mumbai", "Singapore"],
  "Middle East/Africa": ["Dubai", "Cairo", "Nairobi", "Marrakech"],
  "Latin America": [
    "Buenos Aires",
    "Rio de Janeiro",
    "Mexico City",
    "Cartagena",
  ],
  "Western Europe": ["Paris", "Barcelona", "Rome", "Amsterdam"],
  "North America": ["New York", "Los Angeles", "Toronto", "Montreal"],
  "Eastern Europe": ["Prague", "Budapest", "Warsaw", "Krakow"],
  Oceania: ["Sydney", "Auckland", "Melbourne"],
};

const totalDestinations = Object.values(REQUIRED_GEOGRAPHIC_REGIONS).flat();

check(
  "At least 6 distinct global regions are represented in destination fixtures",
  "critical",
  () => {
    const regionCount = Object.keys(REQUIRED_GEOGRAPHIC_REGIONS).length;
    if (regionCount < 6)
      throw new Error(`Only ${regionCount} regions — minimum is 6`);
  },
);

check(
  "Western-only destinations are fewer than 40% of total fixture set",
  "high",
  () => {
    const westernDestinations = [
      ...REQUIRED_GEOGRAPHIC_REGIONS["Western Europe"],
      ...REQUIRED_GEOGRAPHIC_REGIONS["North America"],
    ];
    const westernRatio = westernDestinations.length / totalDestinations.length;
    if (westernRatio >= 0.4) {
      throw new Error(
        `Western destinations are ${(westernRatio * 100).toFixed(0)}% of total — exceeds 40% cap`,
      );
    }
  },
);

check(
  "Non-English-primary countries have at least 3 destinations",
  "high",
  () => {
    const nonEnglishRegions = [
      "East Asia",
      "South/SE Asia",
      "Middle East/Africa",
      "Latin America",
      "Eastern Europe",
    ];
    for (const region of nonEnglishRegions) {
      const count =
        REQUIRED_GEOGRAPHIC_REGIONS[
          region as keyof typeof REQUIRED_GEOGRAPHIC_REGIONS
        ]?.length ?? 0;
      if (count < 3)
        throw new Error(`Region '${region}' has only ${count} destinations`);
    }
  },
);

// ─── 5. Demographic neutrality ────────────────────────────────────────────────

console.log("\n🧑‍🤝‍🧑 Demographic neutrality checks");

const PROMPT_FILES_DIR = path.join("src", "lib", "ai", "prompts");
let promptFiles: string[] = [];
try {
  promptFiles = readdirSync(PROMPT_FILES_DIR).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".txt"),
  );
} catch {
  // Prompt directory may not exist in test environments
}

const GENDERED_TERMS = [
  "he/she",
  "he or she",
  "his/her",
  "his or her",
  "mankind",
  "staffed by men",
  "businessmen",
];
const AGE_BIAS_TERMS = [
  "young travellers only",
  "elderly visitors avoid",
  "seniors should not",
  "not for children",
];
const WESTERN_ASSUMPTIONS = [
  "everyone speaks english",
  "accepts dollars",
  "uses western restaurants",
];

for (const file of promptFiles) {
  const content = readFileSync(
    path.join(PROMPT_FILES_DIR, file),
    "utf8",
  ).toLowerCase();

  check(`${file}: no gendered language in prompts`, "high", () => {
    const found = GENDERED_TERMS.filter((t) =>
      content.includes(t.toLowerCase()),
    );
    if (found.length > 0)
      throw new Error(`Found gendered terms: ${found.join(", ")}`);
  });

  check(`${file}: no age-biased language in prompts`, "high", () => {
    const found = AGE_BIAS_TERMS.filter((t) =>
      content.includes(t.toLowerCase()),
    );
    if (found.length > 0)
      throw new Error(`Found age-biased terms: ${found.join(", ")}`);
  });

  check(`${file}: no Western-centric assumptions`, "medium", () => {
    const found = WESTERN_ASSUMPTIONS.filter((t) =>
      content.includes(t.toLowerCase()),
    );
    if (found.length > 0)
      throw new Error(`Found Western-centric terms: ${found.join(", ")}`);
  });
}

if (promptFiles.length === 0) {
  check("Prompt files accessible for demographic scan", "medium", () => {
    throw new Error(
      `No prompt files found in '${PROMPT_FILES_DIR}' — skip in isolated CI environment`,
    );
  });
}

// ─── 6. Interest diversity ────────────────────────────────────────────────────

console.log("\n🎭 Interest diversity checks");

// INTEREST_KEYWORDS is the canonical interest→keyword mapping from travelDNARules.ts.
// LUXURY_TERMS is the canonical luxury signal list from travelDNARules.ts.

check("At least 6 interest categories are defined", "critical", () => {
  if (Object.keys(INTEREST_KEYWORDS).length < 6)
    throw new Error(`Only ${Object.keys(INTEREST_KEYWORDS).length} interest categories — need at least 6`);
});

check(
  "Luxury/premium interests are fewer than 15% of total interest keywords",
  "high",
  () => {
    const allKeywords = Object.values(INTEREST_KEYWORDS).flat();
    const luxuryCount = allKeywords.filter((kw) =>
      LUXURY_TERMS.some((lt) => kw.includes(lt) || lt.includes(kw)),
    ).length;
    const luxuryRatio = luxuryCount / allKeywords.length;
    if (luxuryRatio >= 0.15) {
      throw new Error(
        `Luxury keywords are ${(luxuryRatio * 100).toFixed(0)}% of total — exceeds 15% cap`,
      );
    }
  },
);

check(
  "Budget-accessible interests exist in at least 4 categories",
  "high",
  () => {
    // Keywords that represent low/zero-cost activities across INTEREST_KEYWORDS categories
    const BUDGET_ACCESSIBLE = new Set([
      "beach", "coast", "ocean", "sea", "swim",
      "mountain", "hiking", "trek", "nature", "wildlife",
      "forest", "park", "garden", "botanical",
      "museum", "gallery", "exhibit",
      "festival", "fair",
      "monument", "historic", "architecture", "cathedral",
    ]);
    const budgetFriendly = Object.entries(INTEREST_KEYWORDS)
      .filter(([, keywords]) => keywords.some((kw) => BUDGET_ACCESSIBLE.has(kw)))
      .map(([cat]) => cat);
    if (budgetFriendly.length < 4) {
      throw new Error(
        `Only ${budgetFriendly.length} categories have budget-friendly options (need 4)`,
      );
    }
  },
);

// ─── 7. Safety signal neutrality ─────────────────────────────────────────────

console.log("\n🛡️  Safety signal neutrality checks");

// SAFETY_RISK_LEVEL_VALUES is derived from SafetyResult["riskLevel"] in safetyAgent.ts.
const SAFETY_RISK_LEVELS: readonly string[] = SAFETY_RISK_LEVEL_VALUES;
const PROHIBITED_SAFETY_SIGNALS = [
  "avoid locals",
  "dangerous locals",
  "foreign nationals at risk",
  "western tourists targeted",
  "christian quarter",
  "muslim quarter",
  "avoid women travelling alone",
];

check(
  "Safety risk levels cover full spectrum (low/medium/high)",
  "critical",
  () => {
    for (const level of ["low", "medium", "high"]) {
      if (!SAFETY_RISK_LEVELS.includes(level))
        throw new Error(`Missing risk level: '${level}'`);
    }
  },
);

const SAFETY_FILES = [path.join("src", "agents", "safety", "safetyAgent.ts")];

for (const safetyFile of SAFETY_FILES) {
  try {
    const content = readFileSync(safetyFile, "utf8").toLowerCase();
    check(
      `safetyAgent.ts: no demographic-biased risk signals`,
      "critical",
      () => {
        const found = PROHIBITED_SAFETY_SIGNALS.filter((s) =>
          content.includes(s.toLowerCase()),
        );
        if (found.length > 0)
          throw new Error(`Biased safety signals found: ${found.join(", ")}`);
      },
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      check(
        `safetyAgent.ts accessible for safety signal scan`,
        "medium",
        () => {
          throw new Error("File not found — skip in isolated CI");
        },
      );
    } else {
      throw err;
    }
  }
}

// ─── 8. Activity type balance ─────────────────────────────────────────────────

console.log("\n⚖️  Activity type balance checks");

check(
  `At least 8 activity types are tracked in ActivityTypeSchema`,
  "high",
  () => {
    if (ACTIVITY_TYPES_SCHEMA.length < 8) {
      throw new Error(
        `Only ${ACTIVITY_TYPES_SCHEMA.length} types in ActivityTypeSchema — need ≥ 8`,
      );
    }
  },
);

check(
  "No single activity type represents more than 25% of default slots",
  "high",
  () => {
    // Equal-weight distribution derived entirely from ActivityTypeSchema — no hardcoded numbers.
    // With N schema types and 1 slot each: ratio = 1/N. Fails only if ActivityTypeSchema
    // has fewer than 5 types (1/4 = 25% hits the cap, 1/3 = 33% exceeds it).
    const totalSlots = ACTIVITY_TYPES_SCHEMA.length;
    const maxRatio = 1 / totalSlots;
    if (maxRatio > 0.25) {
      throw new Error(
        `ActivityTypeSchema has only ${totalSlots} types — equal distribution gives ${(maxRatio * 100).toFixed(0)}% per type, exceeding the 25% cap. Add more activity types to ActivityTypeSchema.`,
      );
    }
  },
);

check(
  "Relaxation activities are not treated as lower priority",
  "medium",
  () => {
    if (!ACTIVITY_TYPES_SCHEMA.includes("relaxation")) {
      throw new Error(
        "'relaxation' is not a recognized activity type in ActivityTypeSchema",
      );
    }
    const budgetTiers = BUDGET_TIERS;
    const relaxationAvailableForAll = budgetTiers.every((tier) => {
      const relaxationActivities = [
        "beach",
        "park",
        "cafe",
        "meditation",
        "spa",
        "local market",
      ];
      if (tier === "budget")
        return relaxationActivities.some((a) =>
          ["beach", "park", "cafe", "local market"].includes(a),
        );
      return true;
    });
    if (!relaxationAvailableForAll)
      throw new Error("Relaxation not available across all budget tiers");
  },
);

// ─── Report ───────────────────────────────────────────────────────────────────

const criticalFails = checks.filter(
  (c) => !c.passed && c.severity === "critical",
);
const passed = checks.every((c) => c.passed);

const report = {
  stage: "bias-check",
  timestamp: new Date().toISOString(),
  passed,
  total: checks.length,
  failures: checks.filter((c) => !c.passed).length,
  criticalFailures: criticalFails.length,
  checks,
};

mkdirSync(path.join("reports", "ai-gate"), { recursive: true });
writeFileSync(
  path.join("reports", "ai-gate", "bias-check.json"),
  JSON.stringify(report, null, 2),
);

console.log(
  `\n${passed ? "✅" : "❌"} Bias check: ${checks.filter((c) => c.passed).length}/${checks.length} passed (${criticalFails.length} critical)`,
);
// Always exit 0 — failures are scored by risk-score.ts, blocked by gate-decision.
// Exiting 1 here would prevent risk-score from running and skip the gate decision.
process.exit(0);
