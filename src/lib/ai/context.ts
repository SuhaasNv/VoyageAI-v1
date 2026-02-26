/**
 * AI Orchestration Layer — Context Injection Utilities
 *
 * Builds rich, structured context for LLM prompts by combining:
 * - Travel DNA profiles
 * - Current itinerary state
 * - Real-time location data
 * - Historical user preferences
 *
 * Context is injected between the system prompt and task instruction
 * to provide the LLM with maximum relevant information without
 * exceeding token limits.
 */

import type { TravelDNA, Itinerary, ChatMessage } from "./schemas";
import { getTravelDNA } from "./contextStore";
import { truncateContext, MAX_CONTEXT_TOKENS, estimateTokenCount } from "./prompts";
import { logInfo } from "@/lib/logger";

// ─────────────────────────────────────────
//  Context Types
// ─────────────────────────────────────────

export interface LocationContext {
    lat: number;
    lng: number;
    cityName?: string;
    countryName?: string;
    timezone?: string;
}

export interface TripContext {
    tripId?: string;
    destination: string;
    startDate: string;
    endDate: string;
    groupSize?: number;
    budget?: {
        total: number;
        spent: number;
        currency: string;
    };
}

export interface FullContextBundle {
    travelDNA?: TravelDNA;
    itinerary?: Itinerary;
    location?: LocationContext;
    trip?: TripContext;
    chatHistory?: ChatMessage[];
    additionalContext?: Record<string, string>;
}

// ─────────────────────────────────────────
//  Individual Context Builders
// ─────────────────────────────────────────

/**
 * Builds a rich Travel DNA profile context block.
 */
export function buildDNAContext(dna: TravelDNA): string {
    const lines: string[] = [
        "### Traveler DNA Profile",
        `- **Travel Styles**: ${dna.travelStyles.join(", ")}`,
        `- **Pace**: ${dna.pacePreference} (${getPaceDescription(dna.pacePreference)})`,
        `- **Budget Tier**: ${dna.budgetTier}`,
        `- **Interests**: ${dna.interests.join(", ")}`,
    ];

    if (dna.dietaryRestrictions.length > 0) {
        lines.push(`- **Dietary Restrictions**: ${dna.dietaryRestrictions.join(", ")}`);
    }
    if (dna.mobilityConsiderations.length > 0) {
        lines.push(`- **Mobility Considerations**: ${dna.mobilityConsiderations.join(", ")}`);
    }
    if (dna.avoidanceList.length > 0) {
        lines.push(`- **Avoid**: ${dna.avoidanceList.join(", ")}`);
    }
    if (dna.previousDestinations.length > 0) {
        lines.push(`- **Previously Visited**: ${dna.previousDestinations.join(", ")}`);
    }

    lines.push(`- **Accommodation Preference**: ${dna.preferredAccommodation}`);
    lines.push(`- **Languages**: ${dna.languages.join(", ")}`);

    return lines.join("\n");
}

function getPaceDescription(pace: TravelDNA["pacePreference"]): string {
    switch (pace) {
        case "slow":
            return "max 3 activities/day, long breaks, no rushing";
        case "moderate":
            return "4–5 activities/day, balanced energy management";
        case "fast":
            return "6+ activities/day, maximize coverage";
    }
}

/**
 * Builds a compact itinerary summary for context injection.
 * Avoids injecting the full itinerary (too many tokens).
 */
export function buildItinerarySummaryContext(itinerary: Itinerary): string {
    const lines: string[] = [
        "### Current Trip Overview",
        `- **Destination**: ${itinerary.destination}`,
        `- **Dates**: ${itinerary.startDate} → ${itinerary.endDate} (${itinerary.totalDays} days)`,
        `- **Total Budget**: ${itinerary.totalEstimatedCost.amount} ${itinerary.totalEstimatedCost.currency}`,
        `- **Pacing Score**: ${itinerary.pacingAnalysis.overallScore}/10`,
        "",
        "**Daily Themes:**",
    ];

    for (const day of itinerary.days) {
        const activityNames = day.activities.map((a) => a.name).join(", ");
        lines.push(
            `  - Day ${day.day} (${day.date}): ${day.theme} — Activities: ${activityNames}`
        );
    }

    if (itinerary.pacingAnalysis.warnings.length > 0) {
        lines.push("", "**Pacing Warnings:**");
        itinerary.pacingAnalysis.warnings.forEach((w) => lines.push(`  - ${w}`));
    }

    if (itinerary.aiInsights.length > 0) {
        lines.push("", "**AI Insights:**");
        itinerary.aiInsights.slice(0, 3).forEach((i) => lines.push(`  - ${i}`));
    }

    return lines.join("\n");
}

/**
 * Builds chat history context (last N messages).
 */
export function buildChatHistoryContext(
    messages: ChatMessage[],
    maxMessages = 10
): string {
    const recentMessages = messages.slice(-maxMessages);

    if (recentMessages.length === 0) return "";

    const lines: string[] = ["### Conversation History"];

    for (const msg of recentMessages) {
        const role = msg.role === "assistant" ? "Voyage (AI)" : "Traveler";
        const preview =
            msg.content.length > 200
                ? msg.content.substring(0, 200) + "..."
                : msg.content;
        lines.push(`**${role}**: ${preview}`);
    }

    return lines.join("\n");
}

/**
 * Builds location context for real-time chat assistance.
 */
export function buildLocationContext(location: LocationContext): string {
    const parts = [
        `- **Current Location**: ${location.cityName ?? "Unknown"}, ${location.countryName ?? "Unknown"}`,
        `- **Coordinates**: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
    ];

    if (location.timezone) {
        parts.push(`- **Timezone**: ${location.timezone}`);
    }

    return `### Current Location\n${parts.join("\n")}`;
}

/**
 * Builds trip-level context block.
 */
export function buildTripContext(trip: TripContext): string {
    const lines: string[] = [
        "### Trip Details",
        `- **Destination**: ${trip.destination}`,
        `- **Dates**: ${trip.startDate} → ${trip.endDate}`,
    ];

    if (trip.groupSize) {
        lines.push(`- **Group Size**: ${trip.groupSize} traveler(s)`);
    }

    if (trip.budget) {
        const remaining = trip.budget.total - trip.budget.spent;
        const percentUsed = Math.round((trip.budget.spent / trip.budget.total) * 100);
        lines.push(
            `- **Budget**: ${trip.budget.total} ${trip.budget.currency} total`,
            `- **Spent**: ${trip.budget.spent} ${trip.budget.currency} (${percentUsed}%)`,
            `- **Remaining**: ${remaining} ${trip.budget.currency}`
        );
    }

    return lines.join("\n");
}

// ─────────────────────────────────────────
//  Full Context Assembler
// ─────────────────────────────────────────

/**
 * Assembles context with optional RAG enrichment (fetches stored Travel DNA when userId provided).
 */
export async function assembleContextWithRAG(bundle: FullContextBundle, userId?: string): Promise<string> {
  const enriched: FullContextBundle = userId && !bundle.travelDNA
    ? { ...bundle, travelDNA: (await getTravelDNA(userId)) ?? undefined }
    : bundle;
  return assembleContext(enriched);
}

/**
 * Assembles a complete context bundle from available data.
 * Respects token limits by truncating if necessary.
 * Order of priority: DNA > Trip > Itinerary > Location > Chat History
 */
export function assembleContext(bundle: FullContextBundle): string {
    const sections: string[] = [];

    if (bundle.travelDNA) {
        sections.push(buildDNAContext(bundle.travelDNA));
    }

    if (bundle.trip) {
        sections.push(buildTripContext(bundle.trip));
    }

    if (bundle.itinerary) {
        sections.push(buildItinerarySummaryContext(bundle.itinerary));
    }

    if (bundle.location) {
        sections.push(buildLocationContext(bundle.location));
    }

    if (bundle.chatHistory && bundle.chatHistory.length > 0) {
        sections.push(buildChatHistoryContext(bundle.chatHistory));
    }

    if (bundle.additionalContext) {
        const extras = Object.entries(bundle.additionalContext)
            .map(([k, v]) => `- **${k}**: ${v}`)
            .join("\n");
        sections.push(`### Additional Context\n${extras}`);
    }

    const assembled = sections.join("\n\n---\n\n");

    // Enforce token budget
    const estimatedTokens = estimateTokenCount(assembled);
    if (estimatedTokens > MAX_CONTEXT_TOKENS * 0.4) {
        // Context taking up too many tokens; truncate
        logInfo("[Context] Estimated tokens in context, truncating", {
            estimatedTokens,
            level: "warn",
        });
        return truncateContext(assembled, MAX_CONTEXT_TOKENS * 4 * 0.4);
    }

    return assembled;
}

// ─────────────────────────────────────────
//  Context Validation
// ─────────────────────────────────────────

/**
 * Checks if a context bundle has minimum viable data for an AI call.
 */
export function validateContextBundle(
    bundle: FullContextBundle,
    required: (keyof FullContextBundle)[]
): { valid: boolean; missingFields: string[] } {
    const missingFields = required.filter(
        (field) => bundle[field] === undefined || bundle[field] === null
    );

    return {
        valid: missingFields.length === 0,
        missingFields,
    };
}

// ─────────────────────────────────────────
//  Request ID Generator
// ─────────────────────────────────────────

export function generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `req_${timestamp}_${random}`;
}

// ─────────────────────────────────────────
//  Metadata Extractor for Logging
// ─────────────────────────────────────────

export interface RequestMetadata {
    requestId: string;
    endpoint: string;
    userId?: string;
    tripId?: string;
    timestamp: string;
    contextSize: number;
}

export function buildRequestMetadata(
    endpoint: string,
    contextContent: string,
    tripId?: string,
    userId?: string
): RequestMetadata {
    return {
        requestId: generateRequestId(),
        endpoint,
        userId,
        tripId,
        timestamp: new Date().toISOString(),
        contextSize: estimateTokenCount(contextContent),
    };
}
