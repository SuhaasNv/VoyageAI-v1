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
import { buildFullPrompt } from "../../lib/ai/prompts";
import { SYSTEM_PROMPTS, SCHEMA_INSTRUCTIONS } from "../../lib/ai/prompts";
import { assembleContext } from "../../lib/ai/context";
import {
    ChatRequest,
    ChatResponse,
    ChatRequestSchema,
} from "../../lib/ai/schemas";

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

    const system = SYSTEM_PROMPTS.CHAT_COMPANION;
    // Fallback to generic AI companion if specific key missing
    const systemPrompt = system ?? `You are VoyageAI's AI travel companion. Provide concise, friendly, and actionable answers.`;

    const context = contextBundle ? contextBundle : "";
    const schema = SCHEMA_INSTRUCTIONS.CHAT;
    const task = `
## Task
Respond to the user's query using the provided context. Follow these rules:
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
        temperature: 0.7,
        responseFormat: "json" as const,
        maxTokens: 2048,
        timeoutMs: 12000,
        retries: 2,
    };

    try {
        const llmResponse = await executeWithRetry(client, [{ role: "user", content: fullPrompt }], llmOptions);
        const response = parseJSONResponse<ChatResponse>(llmResponse.content);
        const final = (await import("../../lib/ai/schemas")).ChatResponseSchema.parse(response);
        return final;
    } catch (err) {
        console.error("[Chat Service] LLM error – fallback", err);
        // Minimal fallback response
        return {
            message: "Sorry, I couldn't process your request right now. Please try again later.",
            intent: "fallback",
            suggestedActions: [],
            relatedTips: [],
            confidenceScore: 0,
            modelVersion: "fallback-mock",
            respondedAt: new Date().toISOString(),
        };
    }
}
