/**
 * AI Service — Chat Companion
 *
 * Provides a conversational assistant that can answer travel queries,
 * give recommendations, and suggest actions. The service builds a prompt
 * with system instructions, optional context (travel DNA, itinerary, location),
 * and a user message, then calls the LLM and parses the structured JSON
 * response defined by the ChatResponseSchema.
 */

import { getLLMClient, executeWithRetry, parseJSONResponse } from "../../lib/ai/llm";
import { selectModelConfig } from "../../lib/ai/modelRouter";
import { logError } from "@/lib/logger";
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    ChatRequest,
    ChatResponse,
    ChatRequestSchema,
} from "../../lib/ai/schemas";
import { chatCacheKey, getChatCached, setChatCached } from "../../lib/ai/cache";

/**
 * Handles a chat request.
 * @param request - validated chat payload from the API route
 * @param contextBundle - optional additional context (travel DNA, itinerary, location, chat history)
 * @returns a structured ChatResponse object
 */
export async function chatCompanion(
    request: ChatRequest,
    contextBundle?: ReturnType<typeof assembleContext>
): Promise<ChatResponse> {
    const parsedReq = ChatRequestSchema.parse(request);

    const cacheKey = chatCacheKey({
        tripId: (parsedReq as { tripId?: string }).tripId,
        messages: parsedReq.messages,
        travelDNA: parsedReq.travelDNA,
        currentItinerary: parsedReq.currentItinerary,
        currentLocation: parsedReq.currentLocation,
    });
    const cached = await getChatCached(cacheKey);
    if (cached) return cached as ChatResponse;

    const system = SYSTEM_PROMPTS.CHAT_COMPANION;
    // Fallback to generic AI companion if specific key missing
    const systemPrompt = system ?? `You are VoyageAI's AI travel companion. Provide concise, friendly, and actionable answers.`;

    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.CHAT;
    const currentDay = (parsedReq as { currentDay?: number }).currentDay;

    const task = `
## Task
Respond to the user's query using the provided context. Follow these rules:
- Current Selected Day: ${currentDay ?? 'Not specified (default to Day 1 or general overview)'}
- Return ONLY a JSON object matching the ChatResponse schema.
- Include a short, helpful message.
- Detect the user's intent and populate the "intent" field.
- Suggest up to three actionable buttons in "suggestedActions" (label, action, optional payload).
- Provide related travel tips and a confidenceScore (0‑1).
- Include modelVersion and respondedAt timestamps.
`;

    const fullPrompt = buildFullPrompt({ system: systemPrompt, context, schema, task });

    const client = getLLMClient();
    const llmOptions = {
        ...selectModelConfig({ endpoint: "chat" }),
        responseFormat: "json" as const,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        const response = parseJSONResponse<ChatResponse>(llmResponse.content);
        const final = (await import("../../lib/ai/schemas")).ChatResponseSchema.parse(response);
        await setChatCached(cacheKey, final);
        return final;
    } catch (err) {
        logError("[Chat Service] LLM error", err);
        throw err;
    }
}
