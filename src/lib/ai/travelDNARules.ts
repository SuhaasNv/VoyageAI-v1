/**
 * Travel DNA Rules Builder
 *
 * Converts TravelPreference.data into concise behavioral constraints for AI prompts.
 * Keeps tokens minimal; no full DNA summary.
 */

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
