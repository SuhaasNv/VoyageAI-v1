export interface LLMMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface LLMRequestOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "json" | "text";
    timeoutMs?: number;
    retries?: number;
}

export interface LLMResponse {
    content: string;
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    provider: string;
}

export interface LLMClient {
    execute(
        messages: LLMMessage[],
        options?: LLMRequestOptions
    ): Promise<LLMResponse>;
}
