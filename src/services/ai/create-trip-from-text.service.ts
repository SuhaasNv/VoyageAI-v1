/**
 * AI Service — Create Trip From Natural Language
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "@/lib/ai/llm";
import { buildFullPrompt } from "@/lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "@/lib/ai/prompts";
import {
    CreateTripFromTextOutputSchema,
    type CreateTripFromTextOutput,
} from "@/lib/ai/schemas";

export async function extractTripFromText(text: string): Promise<CreateTripFromTextOutput> {
    const system = SYSTEM_PROMPTS.CREATE_TRIP_FROM_TEXT;
    const schema = SCHEMA_INSTRUCTIONS.CREATE_TRIP_FROM_TEXT;
    const task = `Extract trip details from this message:\n\n${text}`;

    const fullPrompt = buildFullPrompt({ system, context: "", schema, task });

    const client = getLLMClient();
    const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], {
        temperature: 0.3,
        responseFormat: "json",
        maxTokens: 512,
        timeoutMs: 10000,
        retries: 2,
    });

    const raw = parseJSONResponse<unknown>(llmResponse.content);
    return CreateTripFromTextOutputSchema.parse(raw);
}
