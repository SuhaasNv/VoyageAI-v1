/**
 * AI Service — Create Trip From Natural Language
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { selectModelConfig } from "@/lib/ai/modelRouter";
import { buildFullPrompt } from "@/lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "@/lib/ai/prompts";
import {
    CreateTripFromTextOutputSchema,
    type CreateTripFromTextOutput,
} from "@/lib/ai/schemas";

export async function extractTripFromText(text: string, contextBundle?: string): Promise<CreateTripFromTextOutput> {
    const system = SYSTEM_PROMPTS.CREATE_TRIP_FROM_TEXT;
    const schema = SCHEMA_INSTRUCTIONS.CREATE_TRIP_FROM_TEXT;
    const task = `Extract trip details from this message:\n\n${text}`;

    const fullPrompt = buildFullPrompt({ system, context: contextBundle || "", schema, task });

    const client = getLLMClient();
    const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], {
        ...selectModelConfig({ endpoint: "create-trip" }),
        responseFormat: "json" as const,
        retries: 2,
    });

    const raw = parseJSONResponse<unknown>(llmResponse.content);
    return CreateTripFromTextOutputSchema.parse(raw);
}
