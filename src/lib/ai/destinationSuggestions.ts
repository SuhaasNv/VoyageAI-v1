/**
 * Deterministic destination recommendation engine.
 *
 * No AI calls — scores a curated static pool against the user's Travel DNA
 * and their existing trip history.
 *
 * Server-side only: calls getDestinationImage (Pexels, Redis-cached).
 */

import { getDestinationImage, type RequestImageCache } from "@/lib/services/image.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DestinationCandidate {
    city: string;
    country: string;
    region: string;
    /** Content tags used for interest matching. */
    tags: string[];
    budgetTier: "budget" | "mid-range" | "luxury";
    /** Travel style tokens this destination suits. */
    styles: string[];
    tagline: string;
}

export interface DestinationSuggestion {
    city: string;
    country: string;
    region: string;
    tag: string;
    tagline: string;
    score: number;
    imageUrl: string | null;
}

// ─── Curated destination pool ─────────────────────────────────────────────────

const POOL: DestinationCandidate[] = [
    // Europe
    { city: "Barcelona", country: "Spain", region: "Europe", tags: ["beach", "culture", "food", "architecture"], budgetTier: "mid-range", styles: ["food", "culture", "relaxing"], tagline: "Beaches, Gaudí, and tapas in one city" },
    { city: "Prague", country: "Czech Republic", region: "Europe", tags: ["culture", "history", "architecture"], budgetTier: "budget", styles: ["culture"], tagline: "Fairy-tale medieval streets on a budget" },
    { city: "Lisbon", country: "Portugal", region: "Europe", tags: ["culture", "food", "ocean", "architecture"], budgetTier: "budget", styles: ["food", "culture", "relaxing"], tagline: "Ocean-view pastéis and golden light" },
    { city: "Santorini", country: "Greece", region: "Europe", tags: ["beach", "romantic", "scenic"], budgetTier: "luxury", styles: ["relaxing", "luxury"], tagline: "Iconic caldera sunsets over the Aegean" },
    { city: "Amsterdam", country: "Netherlands", region: "Europe", tags: ["culture", "architecture", "museums"], budgetTier: "mid-range", styles: ["culture"], tagline: "Canal houses, world-class museums, cycling culture" },
    { city: "Amalfi Coast", country: "Italy", region: "Europe", tags: ["beach", "scenic", "food"], budgetTier: "luxury", styles: ["relaxing", "food"], tagline: "Cliff-top villages and turquoise waters" },
    { city: "Edinburgh", country: "Scotland", region: "Europe", tags: ["culture", "history", "nature", "festival"], budgetTier: "mid-range", styles: ["culture", "adventure"], tagline: "Dramatic castles, whisky, and highland air" },
    { city: "Dubrovnik", country: "Croatia", region: "Europe", tags: ["beach", "history", "culture"], budgetTier: "mid-range", styles: ["relaxing", "culture"], tagline: "Walled old town above an Adriatic sea" },

    // Asia
    { city: "Kyoto", country: "Japan", region: "Asia", tags: ["culture", "history", "nature", "temples"], budgetTier: "mid-range", styles: ["culture", "relaxing"], tagline: "Ancient temples, bamboo groves, and tea ceremony" },
    { city: "Bali", country: "Indonesia", region: "Asia", tags: ["beach", "wellness", "nature", "temples"], budgetTier: "budget", styles: ["relaxing", "adventure"], tagline: "Rice terraces, surf breaks, and Hindu temples" },
    { city: "Bangkok", country: "Thailand", region: "Asia", tags: ["food", "culture", "temples", "nightlife"], budgetTier: "budget", styles: ["food", "culture", "nightlife"], tagline: "Dazzling street food and gilded temples" },
    { city: "Singapore", country: "Singapore", region: "Asia", tags: ["food", "modern", "shopping"], budgetTier: "luxury", styles: ["food", "luxury"], tagline: "Futuristic skyline and Michelin-level hawker stalls" },
    { city: "Hoi An", country: "Vietnam", region: "Asia", tags: ["culture", "food", "history"], budgetTier: "budget", styles: ["culture", "food"], tagline: "Lantern-lit old town and banh mi on every corner" },
    { city: "Seoul", country: "South Korea", region: "Asia", tags: ["food", "culture", "shopping", "modern"], budgetTier: "mid-range", styles: ["food", "culture", "nightlife"], tagline: "K-culture, street food alleys, and rooftop bars" },
    { city: "Luang Prabang", country: "Laos", region: "Asia", tags: ["culture", "nature", "temples"], budgetTier: "budget", styles: ["culture", "relaxing"], tagline: "Monks at dawn, waterfalls at noon, silence at dusk" },

    // North America
    { city: "New Orleans", country: "USA", region: "North America", tags: ["food", "culture", "festival", "nightlife"], budgetTier: "mid-range", styles: ["food", "culture", "nightlife"], tagline: "Jazz, beignets, and the world's best festival city" },
    { city: "Vancouver", country: "Canada", region: "North America", tags: ["nature", "mountains", "outdoor", "beach"], budgetTier: "mid-range", styles: ["adventure", "relaxing"], tagline: "Mountains meet ocean in a liveable city" },
    { city: "Mexico City", country: "Mexico", region: "North America", tags: ["culture", "food", "art", "history"], budgetTier: "budget", styles: ["culture", "food"], tagline: "Murals, mezcal, and millennia of history" },
    { city: "Tulum", country: "Mexico", region: "North America", tags: ["beach", "wellness", "nature", "ruins"], budgetTier: "mid-range", styles: ["relaxing", "adventure"], tagline: "Cenote swims and Mayan ruins on the Caribbean" },

    // South America
    { city: "Cartagena", country: "Colombia", region: "South America", tags: ["beach", "culture", "history"], budgetTier: "budget", styles: ["culture", "relaxing"], tagline: "Pastel-walled colonial city on the Caribbean coast" },
    { city: "Buenos Aires", country: "Argentina", region: "South America", tags: ["culture", "food", "nightlife", "architecture"], budgetTier: "budget", styles: ["culture", "food", "nightlife"], tagline: "Tango, steak, and European flair in South America" },
    { city: "Medellín", country: "Colombia", region: "South America", tags: ["culture", "adventure", "modern"], budgetTier: "budget", styles: ["adventure", "culture"], tagline: "Once-rough city reborn as a model of innovation" },

    // Africa
    { city: "Marrakech", country: "Morocco", region: "Africa", tags: ["culture", "shopping", "food", "history"], budgetTier: "budget", styles: ["culture", "food"], tagline: "Souks, riads, and spice-scented medina alleys" },
    { city: "Cape Town", country: "South Africa", region: "Africa", tags: ["beach", "adventure", "nature", "mountains"], budgetTier: "mid-range", styles: ["adventure", "relaxing"], tagline: "Table Mountain, wine estates, and penguin beaches" },
    { city: "Zanzibar", country: "Tanzania", region: "Africa", tags: ["beach", "culture", "ocean"], budgetTier: "mid-range", styles: ["relaxing", "adventure"], tagline: "White coral beaches and Swahili spice history" },
    { city: "Nairobi", country: "Kenya", region: "Africa", tags: ["adventure", "nature", "culture", "wildlife"], budgetTier: "mid-range", styles: ["adventure", "culture"], tagline: "City safari hub with giraffes at the city limits" },

    // Middle East
    { city: "Petra", country: "Jordan", region: "Middle East", tags: ["history", "culture", "adventure", "ruins"], budgetTier: "mid-range", styles: ["culture", "adventure"], tagline: "Rose-red city carved into desert cliffs" },
    { city: "Dubai", country: "UAE", region: "Middle East", tags: ["modern", "shopping", "luxury", "desert"], budgetTier: "luxury", styles: ["luxury"], tagline: "Record-breaking skyline where desert meets indulgence" },
    { city: "Muscat", country: "Oman", region: "Middle East", tags: ["culture", "nature", "adventure", "beach"], budgetTier: "mid-range", styles: ["adventure", "culture"], tagline: "Unspoiled fjords, forts, and frank hospitality" },

    // Oceania
    { city: "Sydney", country: "Australia", region: "Oceania", tags: ["beach", "culture", "food", "modern"], budgetTier: "mid-range", styles: ["relaxing", "culture", "food"], tagline: "Opera House, harbour walks, and killer flat whites" },
    { city: "Queenstown", country: "New Zealand", region: "Oceania", tags: ["adventure", "mountains", "outdoor", "nature"], budgetTier: "mid-range", styles: ["adventure"], tagline: "Adrenaline capital of the world amid alpine lakes" },
    { city: "Bora Bora", country: "French Polynesia", region: "Oceania", tags: ["beach", "luxury", "ocean"], budgetTier: "luxury", styles: ["relaxing", "luxury"], tagline: "Overwater bungalows on the world's most famous lagoon" },
];

// ─── Matching maps ────────────────────────────────────────────────────────────

/** Maps DNA style label keywords → candidate style tokens */
const STYLE_MATCH: Record<string, string[]> = {
    "relax":     ["relaxing"],
    "wellness":  ["relaxing"],
    "adventure": ["adventure"],
    "outdoor":   ["adventure"],
    "culture":   ["culture"],
    "history":   ["culture"],
    "food":      ["food"],
    "drink":     ["food"],
    "nightlife": ["nightlife"],
    "luxury":    ["luxury"],
};

/** Maps DNA interest label → candidate tag tokens */
const INTEREST_MATCH: Record<string, string[]> = {
    beaches:      ["beach", "ocean"],
    mountains:    ["mountains", "mountain"],
    cities:       ["modern", "culture", "food"],
    nature:       ["nature", "outdoor", "wildlife"],
    museums:      ["culture", "history", "museums"],
    shopping:     ["shopping"],
    festivals:    ["festival"],
    architecture: ["architecture", "history"],
};

// ─── Visit extraction ─────────────────────────────────────────────────────────

interface VisitedMeta {
    countries: Set<string>;
    regions: Set<string>;
}

export function extractVisitedMeta(trips: Array<{ destination: string }>): VisitedMeta {
    const countries = new Set<string>();
    const regions = new Set<string>();

    for (const trip of trips) {
        const dest = trip.destination.toLowerCase();
        for (const c of POOL) {
            if (dest.includes(c.country.toLowerCase()) || dest.includes(c.city.toLowerCase())) {
                countries.add(c.country);
                regions.add(c.region);
                break;
            }
        }
    }

    return { countries, regions };
}

// ─── Scorer ───────────────────────────────────────────────────────────────────

export function scoreCandidate(
    candidate: DestinationCandidate,
    dnaData: Record<string, unknown> | null,
    visitedCountries: Set<string>,
    preferredRegions: string[]
): number {
    // Already visited: strong negative
    if (visitedCountries.has(candidate.country)) return -10;

    let score = 0;

    // ── Region preference match (+4) ─────────────────────────────────────────
    if (preferredRegions.some(r => candidate.region.toLowerCase() === r.toLowerCase())) {
        score += 4;
    }

    if (!dnaData) return score;

    const style     = String(dnaData.style    ?? "").toLowerCase();
    const budget    = String(dnaData.budget   ?? "").toLowerCase();
    const interests = Array.isArray(dnaData.interests)
        ? (dnaData.interests as string[]).map(i => i.toLowerCase())
        : [];

    // ── Style match (+3) ─────────────────────────────────────────────────────
    const styleMatched = Object.entries(STYLE_MATCH).some(
        ([key, tokens]) => style.includes(key) && tokens.some(t => candidate.styles.includes(t))
    );
    if (styleMatched) score += 3;

    // ── Interest overlap (+2 each, cap +4) ───────────────────────────────────
    let interestBonus = 0;
    for (const interest of interests) {
        const matchTags = INTEREST_MATCH[interest] ?? [interest];
        if (matchTags.some(t => candidate.tags.includes(t))) {
            interestBonus = Math.min(interestBonus + 2, 4);
        }
    }
    score += interestBonus;

    // ── Budget compatibility (+2 / -3) ───────────────────────────────────────
    if (budget.includes("budget") || budget.includes("$)")) {
        if (candidate.budgetTier === "budget")     score += 2;
        if (candidate.budgetTier === "luxury")     score -= 3;
    } else if (budget.includes("moderate") || budget.includes("$$")) {
        if (candidate.budgetTier === "mid-range")  score += 2;
        if (candidate.budgetTier === "budget")     score += 1;
    } else if (budget.includes("luxury") || budget.includes("$$$")) {
        if (candidate.budgetTier === "luxury")     score += 2;
        if (candidate.budgetTier === "budget")     score -= 1;
    }

    return score;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateSuggestions(
    userTrips: Array<{ destination: string }>,
    dnaData: Record<string, unknown> | null,
    limit = 5
): Promise<DestinationSuggestion[]> {
    const { countries: visitedCountries } = extractVisitedMeta(userTrips);

    const preferredRegions = Array.isArray(dnaData?.regions)
        ? (dnaData!.regions as string[])
        : [];

    const ranked = POOL
        .map(c => ({ c, score: scoreCandidate(c, dnaData, visitedCountries, preferredRegions) }))
        .filter(({ score }) => score > -5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    const imageCache: RequestImageCache = new Map();

    const results = await Promise.all(
        ranked.map(async ({ c, score }) => {
            const imageUrl = await getDestinationImage(`${c.city} ${c.country}`, imageCache);
            return {
                city: c.city,
                country: c.country,
                region: c.region,
                tag: c.tags[0].charAt(0).toUpperCase() + c.tags[0].slice(1),
                tagline: c.tagline,
                score,
                imageUrl,
            } satisfies DestinationSuggestion;
        })
    );

    return results;
}
