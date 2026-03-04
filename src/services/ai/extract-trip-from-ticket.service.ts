/**
 * AI Service — Extract Trip From Ticket Text
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { buildFullPrompt } from "@/lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "@/lib/ai/prompts";
import {
    ExtractTripFromTicketOutputSchema,
    type ExtractTripFromTicketOutput,
} from "@/lib/ai/schemas";
import { inferRouteFromTicketText } from "@/lib/ai/ticketRouteParser";

export async function extractTripFromTicket(
    text: string
): Promise<ExtractTripFromTicketOutput> {
    // Heuristically infer the overall route from the raw ticket text first.
    // This helps avoid the classic multi-segment bug where the first segment
    // (e.g. JFK → NRT) is chosen instead of the true origin/destination
    // (e.g. DXB → SIN).
    const inferredRoute = inferRouteFromTicketText(text);

    const system = SYSTEM_PROMPTS.EXTRACT_TRIP_FROM_TICKET;
    const schema = SCHEMA_INSTRUCTIONS.EXTRACT_TRIP_FROM_TICKET;
    const routeHint = inferredRoute
        ? `\n\nDetected route segments (first origin → last destination): ${inferredRoute.origin} → ${inferredRoute.destination}\n`
        : "";

    const task = `Extract trip details from this ticket/booking text.\n` +
        `If multiple flight segments exist, the overall journey should be interpreted as:\n` +
        `  first segment origin → last segment destination.\n` +
        `Prefer explicit itinerary/flight sections over baggage or historical trips.\n` +
        `${routeHint}\n` +
        `--- RAW TICKET TEXT START ---\n` +
        `${text}\n` +
        `--- RAW TICKET TEXT END ---`;

    const fullPrompt = buildFullPrompt({ system, context: "", schema, task });

    const client = getLLMClient();
    const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], {
        ...selectModelConfig({ endpoint: "ticket" }),
        responseFormat: "json" as const,
        retries: 2,
    });

    const raw = parseJSONResponse<unknown>(llmResponse.content);
    const parsed = ExtractTripFromTicketOutputSchema.parse(raw);

    // As a final guardrail, if we successfully inferred a route, override the
    // origin/destination fields with the heuristic result. This makes the
    // behaviour deterministic for multi-segment tickets even if the model
    // misinterprets which leg is primary.
    if (inferredRoute) {
        return {
            ...parsed,
            departureCity: inferredRoute.origin,
            destination: inferredRoute.destination,
        };
    }

    return parsed;
}
