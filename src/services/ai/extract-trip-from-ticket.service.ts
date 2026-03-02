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

export async function extractTripFromTicket(
    text: string
): Promise<ExtractTripFromTicketOutput> {
    const system = SYSTEM_PROMPTS.EXTRACT_TRIP_FROM_TICKET;
    const schema = SCHEMA_INSTRUCTIONS.EXTRACT_TRIP_FROM_TICKET;
    const task = `Extract trip details from this ticket/booking text:\n\n${text}`;

    const fullPrompt = buildFullPrompt({ system, context: "", schema, task });

    const client = getLLMClient();
    const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], {
        ...selectModelConfig({ endpoint: "ticket" }),
        responseFormat: "json" as const,
        retries: 2,
    });

    const raw = parseJSONResponse<unknown>(llmResponse.content);
    return ExtractTripFromTicketOutputSchema.parse(raw);
}
