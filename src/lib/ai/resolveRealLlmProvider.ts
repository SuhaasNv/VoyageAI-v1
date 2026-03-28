/**
 * Resolves OpenAI vs Gemini from env. No mock — at least one API key is required.
 */

export type RealLLMProvider = "openai" | "gemini";

export function resolveRealLlmProvider(): RealLLMProvider {
    const pref = process.env.LLM_PROVIDER?.trim();
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
    const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());

    if (pref === "openai") {
        if (hasOpenAI) return "openai";
        if (hasGemini) return "gemini";
        throw new Error(
            "OPENAI_API_KEY is not set while LLM_PROVIDER=openai. Add the key or set GEMINI_API_KEY for fallback routing.",
        );
    }
    if (pref === "gemini") {
        if (hasGemini) return "gemini";
        if (hasOpenAI) return "openai";
        throw new Error(
            "GEMINI_API_KEY is not set while LLM_PROVIDER=gemini. Add the key or set OPENAI_API_KEY for fallback routing.",
        );
    }
    if (hasOpenAI) return "openai";
    if (hasGemini) return "gemini";
    throw new Error(
        "No LLM API keys configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY, and optionally LLM_PROVIDER=openai or gemini.",
    );
}
