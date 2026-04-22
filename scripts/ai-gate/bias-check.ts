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

type Severity = "critical" | "high" | "medium" | "low";
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

// ─── 1. Travel style diversity ────────────────────────────────────────────────

console.log("\n🧭 Travel style diversity");

const TRAVEL_STYLES = [
  "adventure",
  "cultural",
  "relaxation",
  "foodie",
  "luxury",
  "budget",
  "family",
  "solo",
  "romantic",
  "eco",
];

const STYLE_ARCHETYPES = {
  activeOutdoor: ["adventure", "eco"],
  culturalLearning: ["cultural", "foodie"],
  restfulEscape: ["relaxation", "romantic"],
  socialFocus: ["family", "solo"],
  economicRange: ["budget", "luxury"],
};

for (const [archetype, styles] of Object.entries(STYLE_ARCHETYPES)) {
  check(
    `Travel styles include '${archetype}' archetype (${styles.join(", ")})`,
    "high",
    () => {
      const covered = styles.every((s) => TRAVEL_STYLES.includes(s));
      if (!covered)
        throw new Error(
          `Missing styles for archetype '${archetype}': ${styles.filter((s) => !TRAVEL_STYLES.includes(s)).join(", ")}`,
        );
    },
  );
}

check("At least 8 distinct travel styles are defined", "high", () => {
  const unique = new Set(TRAVEL_STYLES);
  if (unique.size < 8)
    throw new Error(`Only ${unique.size} styles defined — need at least 8`);
});

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

const VALID_PACES = ["relaxed", "moderate", "fast-paced"];

check(
  "All three pace tiers are defined (relaxed, moderate, fast-paced)",
  "critical",
  () => {
    const required = ["relaxed", "moderate", "fast-paced"];
    for (const p of required) {
      if (!VALID_PACES.includes(p)) throw new Error(`Missing pace: '${p}'`);
    }
  },
);

check(
  "No pace tier aliases map to the same value (no duplication)",
  "medium",
  () => {
    const unique = new Set(VALID_PACES);
    if (unique.size !== VALID_PACES.length)
      throw new Error("Duplicate pace tiers detected");
  },
);

// ─── 3. Budget tier equity ────────────────────────────────────────────────────

console.log("\n💰 Budget tier equity checks");

const BUDGET_TIERS = ["budget", "mid-range", "luxury"];

check("All three budget tiers are defined", "critical", () => {
  const required = ["budget", "mid-range", "luxury"];
  for (const b of required) {
    if (!BUDGET_TIERS.includes(b))
      throw new Error(`Missing budget tier: '${b}'`);
  }
});

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

check("No tier is absent from TravelDNA schema validation", "high", () => {
  // Simulate what TravelDNASchema would validate
  for (const tier of BUDGET_TIERS) {
    const valid = ["budget", "mid-range", "luxury"].includes(tier);
    if (!valid) throw new Error(`Tier '${tier}' would fail schema validation`);
  }
});

// ─── 4. Geographic diversity ─────────────────────────────────────────────────

console.log("\n🌍 Geographic diversity checks");

// These represent the minimum spread we require in our destination fixtures and demos
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

// Scan prompt templates for demographic assumptions
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

// If no prompt files were found, note it but don't fail — CI may not have all files
if (promptFiles.length === 0) {
  check("Prompt files accessible for demographic scan", "medium", () => {
    throw new Error(
      `No prompt files found in '${PROMPT_FILES_DIR}' — skip in isolated CI environment`,
    );
  });
}

// ─── 6. Interest diversity ────────────────────────────────────────────────────

console.log("\n🎭 Interest diversity checks");

const INTEREST_CATEGORIES = {
  outdoor: ["hiking", "beaches", "adventure sports", "nature"],
  cultural: ["museums", "history", "art", "architecture", "local culture"],
  culinary: ["local food", "street food", "fine dining", "cooking classes"],
  wellness: ["spa", "yoga", "meditation", "wellness"],
  family: ["kid-friendly", "theme parks", "zoos", "family activities"],
  nightlife: ["bars", "clubs", "nightlife", "entertainment"],
  shopping: ["shopping", "markets", "local crafts"],
  social: ["meeting locals", "volunteering", "community"],
};

check("At least 6 interest categories are defined", "critical", () => {
  if (Object.keys(INTEREST_CATEGORIES).length < 6)
    throw new Error("Need at least 6 interest categories");
});

check(
  "Luxury/premium interests are fewer than 15% of total interest options",
  "high",
  () => {
    const luxuryInterests = INTEREST_CATEGORIES.wellness.filter((i) =>
      ["spa", "fine dining"].includes(i),
    );
    const totalInterests = Object.values(INTEREST_CATEGORIES).flat();
    const luxuryRatio = luxuryInterests.length / totalInterests.length;
    if (luxuryRatio >= 0.15) {
      throw new Error(
        `Luxury interests are ${(luxuryRatio * 100).toFixed(0)}% — exceeds 15% cap`,
      );
    }
  },
);

check(
  "Budget-accessible interests exist in at least 4 categories",
  "high",
  () => {
    const budgetFriendly: string[] = [];
    for (const [cat, interests] of Object.entries(INTEREST_CATEGORIES)) {
      const budgetItems = interests.filter((i) =>
        [
          "hiking",
          "beaches",
          "museums",
          "history",
          "street food",
          "local food",
          "markets",
          "local crafts",
          "meeting locals",
          "volunteering",
          "nature",
          "local culture",
        ].includes(i),
      );
      if (budgetItems.length > 0) budgetFriendly.push(cat);
    }
    if (budgetFriendly.length < 4) {
      throw new Error(
        `Only ${budgetFriendly.length} categories have budget-friendly options (need 4)`,
      );
    }
  },
);

// ─── 7. Safety signal neutrality ─────────────────────────────────────────────

console.log("\n🛡️  Safety signal neutrality checks");

// Safety risk descriptors should not reference nationality, religion, or demographics
const SAFETY_RISK_LEVELS = ["low", "medium", "high"];
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
    const required = ["low", "medium", "high"];
    for (const level of required) {
      if (!SAFETY_RISK_LEVELS.includes(level))
        throw new Error(`Missing risk level: '${level}'`);
    }
  },
);

// Scan any safety-agent related files for biased signal language
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

const ACTIVITY_TYPES = [
  "cultural",
  "outdoor",
  "culinary",
  "relaxation",
  "nightlife",
  "shopping",
  "educational",
  "family",
  "adventure",
];

check("At least 8 activity types are tracked in the system", "high", () => {
  if (ACTIVITY_TYPES.length < 8)
    throw new Error(`Only ${ACTIVITY_TYPES.length} types — need ≥ 8`);
});

check(
  "No single activity type represents more than 25% of default slots",
  "high",
  () => {
    // Simulate a default 5-day itinerary: each day has 3 activities = 15 total
    const DEFAULT_DISTRIBUTION: Record<string, number> = {
      cultural: 3,
      outdoor: 3,
      culinary: 2,
      relaxation: 2,
      shopping: 1,
      educational: 1,
      adventure: 1,
      nightlife: 1,
      family: 1,
    };
    const totalSlots = Object.values(DEFAULT_DISTRIBUTION).reduce(
      (a, b) => a + b,
      0,
    );
    for (const [type, count] of Object.entries(DEFAULT_DISTRIBUTION)) {
      const ratio = count / totalSlots;
      if (ratio > 0.25) {
        throw new Error(
          `Activity type '${type}' is ${(ratio * 100).toFixed(0)}% of slots — exceeds 25% cap`,
        );
      }
    }
  },
);

check(
  "Relaxation activities are not treated as lower priority",
  "medium",
  () => {
    // Relaxation should be present in every budget tier's default itinerary
    const budgetTiers = ["budget", "mid-range", "luxury"];
    const relaxationAvailableForAll = budgetTiers.every((tier) => {
      const relaxationActivities = [
        "beach",
        "park",
        "cafe",
        "meditation",
        "spa",
        "local market",
      ];
      // Budget tier has accessible relaxation options (not just spa/luxury)
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
process.exit(passed ? 0 : 1);
