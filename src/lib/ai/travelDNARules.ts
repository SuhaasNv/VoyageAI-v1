/**
 * Travel DNA Rules Builder
 *
 * Converts TravelPreference.data into concise behavioral constraints for AI prompts.
 * Also provides scoreSuggestion() for deterministic, lightweight ranking.
 */

import type { DashboardSuggestion } from "./schemas";

// ─── Scoring lookup tables ────────────────────────────────────────────────────

const STYLE_KEYWORDS: Record<string, string[]> = {
    "relax":     ["relaxation", "wellness", "spa", "leisure", "scenic", "slow"],
    "wellness":  ["wellness", "spa", "yoga", "retreat"],
    "adventure": ["adventure", "outdoor", "hiking", "trek", "sport", "adrenaline", "explore"],
    "outdoor":   ["outdoor", "nature", "wildlife", "park"],
    "culture":   ["culture", "cultural", "history", "heritage", "local", "museum", "art"],
    "history":   ["history", "heritage", "monument", "historic", "landmark"],
    "food":      ["dining", "food", "culinary", "restaurant", "cuisine", "drink"],
    "drink":     ["bar", "drink", "cocktail", "winery", "brewery"],
    "nightlife": ["nightlife", "evening", "entertainment", "show", "club"],
};

const INTEREST_KEYWORDS: Record<string, string[]> = {
    beaches:      ["beach", "coast", "ocean", "sea", "swim", "snorkel"],
    mountains:    ["mountain", "hiking", "trek", "altitude", "summit", "ski"],
    cities:       ["city", "urban", "downtown", "metro", "street"],
    nature:       ["nature", "wildlife", "forest", "park", "garden", "botanical"],
    museums:      ["museum", "gallery", "exhibit", "art", "collection"],
    shopping:     ["shopping", "market", "bazaar", "boutique", "souvenir"],
    festivals:    ["festival", "event", "carnival", "celebration", "fair"],
    architecture: ["architecture", "building", "monument", "historic", "cathedral"],
};

const LUXURY_TERMS   = ["luxury", "premium", "5-star", "fine dining", "vip", "exclusive", "private tour"];
const ADRENALINE_TAGS = ["adventure", "outdoor", "sport", "adrenaline", "extreme", "high-energy"];

function haystack(s: DashboardSuggestion): string {
    return `${s.title} ${s.description} ${s.tag ?? ""} ${s.action ?? ""}`.toLowerCase();
}

/**
 * Scores a suggestion against the user's Travel DNA preference data.
 * Returns an integer score; higher = better fit.
 */
export function scoreSuggestion(
    suggestion: DashboardSuggestion,
    dnaData: Record<string, unknown> | null | undefined
): number {
    if (!dnaData || typeof dnaData !== "object") return 0;

    let score = 0;
    const text = haystack(suggestion);
    const budget  = String(dnaData.budget  ?? "").toLowerCase();
    const style   = String(dnaData.style   ?? "").toLowerCase();
    const pace    = String(dnaData.pace    ?? "").toLowerCase();
    const interests = Array.isArray(dnaData.interests) ? (dnaData.interests as string[]).map(s => s.toLowerCase()) : [];

    // ── Travel style match (+3) ──────────────────────────────────────────────
    for (const [key, keywords] of Object.entries(STYLE_KEYWORDS)) {
        if (style.includes(key) && keywords.some(kw => text.includes(kw))) {
            score += 3;
            break;
        }
    }

    // ── Interest match (+2 each, cap +4) ─────────────────────────────────────
    let interestBonus = 0;
    for (const interest of interests) {
        const keywords = INTEREST_KEYWORDS[interest] ?? [interest];
        if (keywords.some(kw => text.includes(kw))) {
            interestBonus += 2;
            if (interestBonus >= 4) break;
        }
    }
    score += interestBonus;

    // ── Budget match / conflict ───────────────────────────────────────────────
    const isLuxurySuggestion = LUXURY_TERMS.some(t => text.includes(t));
    if (isLuxurySuggestion) {
        if (budget.includes("luxury") || budget.includes("$$$")) score += 2;
        else if (budget.includes("budget") || budget.includes("$)"))  score -= 3;
    }

    // ── Pace conflict: slow traveler + high-adrenaline suggestion (-2) ────────
    if ((pace.includes("slow") || pace.includes("relaxed")) && ADRENALINE_TAGS.some(t => text.includes(t))) {
        score -= 2;
    }

    return score;
}

/**
 * Sorts suggestions descending by Travel DNA score.
 * Stable: equal scores preserve original LLM order.
 */
export function rankSuggestions(
    suggestions: DashboardSuggestion[],
    dnaData: Record<string, unknown> | null | undefined
): DashboardSuggestion[] {
    if (!dnaData) return suggestions;
    return [...suggestions].sort(
        (a, b) => scoreSuggestion(b, dnaData) - scoreSuggestion(a, dnaData)
    );
}

export function buildTravelDNARules(data: Record<string, unknown> | null | undefined): string {
    if (!data || typeof data !== "object") return "";

    const rules: string[] = [];

    // Budget → behavioral constraint
    const budget = String(data.budget ?? "").toLowerCase();
    if (budget.includes("budget") || budget.includes("$)")) {
        rules.push("Avoid luxury options; favor budget-friendly choices.");
    } else if (budget.includes("luxury") || budget.includes("$$$")) {
        rules.push("Prioritize premium experiences and higher-end options.");
    } else if (budget.includes("moderate") || budget.includes("$$")) {
        rules.push("Balance cost and quality; mid-range options.");
    }

    // Style → behavioral constraint
    const style = String(data.style ?? "").toLowerCase();
    if (style.includes("luxury")) {
        rules.push("Prioritize premium experiences.");
    } else if (style.includes("relax") || style.includes("wellness")) {
        rules.push("Include rest, wellness, and low-intensity activities.");
    } else if (style.includes("adventure") || style.includes("outdoor")) {
        rules.push("Bias toward adventure and outdoor activities.");
    } else if (style.includes("culture") || style.includes("history")) {
        rules.push("Prioritize cultural and historical sites.");
    } else if (style.includes("food") || style.includes("drink")) {
        rules.push("Emphasize food and dining experiences.");
    } else if (style.includes("nightlife")) {
        rules.push("Include evening and nightlife options.");
    }

    // Pace → behavioral constraint
    const pace = String(data.pace ?? "").toLowerCase();
    if (pace.includes("slow") || pace.includes("relaxed")) {
        rules.push("Limit daily activities to 2–3; allow rest blocks.");
    } else if (pace.includes("fast") || pace.includes("packed")) {
        rules.push("Allow 6+ activities/day; maximize coverage.");
    } else if (pace.includes("moderate")) {
        rules.push("4–5 activities/day; balanced pacing.");
    }

    // Interests → bias activity selection
    const interests = Array.isArray(data.interests) ? (data.interests as string[]) : [];
    if (interests.length > 0) {
        rules.push(`Bias activities toward: ${interests.slice(0, 5).join(", ")}.`);
    }

    // Regions → geographic bias
    const regions = Array.isArray(data.regions) ? (data.regions as string[]) : [];
    if (regions.length > 0) {
        rules.push(`Geographic bias: ${regions.slice(0, 3).join(", ")}.`);
    }

    if (rules.length === 0) return "";

    return `Travel DNA constraints (strict):\n${rules.map((r) => `- ${r}`).join("\n")}`;
}
