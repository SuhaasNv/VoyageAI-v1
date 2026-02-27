/**
 * AI Service — Dashboard Suggestions
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { buildFullPrompt } from "@/lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "@/lib/ai/prompts";
import {
    DashboardSuggestionsOutputSchema,
    type DashboardSuggestionsOutput,
} from "@/lib/ai/schemas";
import { rankSuggestions } from "@/lib/ai/travelDNARules";

interface TripContext {
    tripId: string;
    destination: string;
    style: string | null;
    budgetTotal: number;
    budgetCurrency: string;
}

export async function generateSuggestionsForTrip(
    trip: TripContext,
    dnaData?: Record<string, unknown> | null
): Promise<DashboardSuggestionsOutput> {
    const system = SYSTEM_PROMPTS.DASHBOARD_SUGGESTIONS;
    const schema = SCHEMA_INSTRUCTIONS.DASHBOARD_SUGGESTIONS;
    const task = `Generate 2 contextual suggestions for this trip:
- Destination: ${trip.destination}
- Style: ${trip.style ?? "not specified"}
- Budget: ${trip.budgetTotal} ${trip.budgetCurrency}`;

    const fullPrompt = buildFullPrompt({ system, context: "", schema, task });

    const client = getLLMClient();
    const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], {
        temperature: 0.7,
        responseFormat: "json",
        maxTokens: 512,
        timeoutMs: 10000,
        retries: 2,
    });

    const raw = parseJSONResponse<unknown>(llmResponse.content);
    const parsed = DashboardSuggestionsOutputSchema.parse(raw);

    return {
        suggestions: rankSuggestions(parsed.suggestions, dnaData),
    };
}
