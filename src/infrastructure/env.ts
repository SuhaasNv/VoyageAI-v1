import { z } from "zod";

const isProduction =
    process.env.NODE_ENV === "production" &&
    process.env.SKIP_ENV_VALIDATION !== "true" &&
    process.env.SKIP_ENV_VALIDATION !== "1";

const EnvSchema = z
    .object({
        DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
        JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
        JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
        CSRF_SECRET: z.string().min(1, "CSRF_SECRET is required"),
        REDIS_URL: z.string().optional(),
        DIRECT_URL: z.string().optional(),
        NODE_ENV: z.enum(["development", "production", "test"]).optional(),
        ACCESS_TOKEN_EXPIRY_MS: z.coerce.number().optional(),
        REFRESH_TOKEN_EXPIRY_MS: z.coerce.number().optional(),
        LLM_PROVIDER: z.enum(["gemini", "openai"]).optional(),
        OPENAI_API_KEY: z.string().optional(),
        GEMINI_API_KEY: z.string().optional(),
        GEMINI_MODEL: z.string().optional(),
        GOOGLE_CLIENT_ID: z.string().optional(),
        GOOGLE_CLIENT_SECRET: z.string().optional(),
        NEXT_PUBLIC_APP_URL: z.string().optional(),
        PEXELS_API_KEY: z.string().optional(),
        // Comma-separated extra admin emails; merged with hardcoded defaults in src/lib/admin.ts.
        ADMIN_EMAILS: z.string().optional(),
        // Optional Bright Data SERP key; tool degrades gracefully when absent.
        BRIGHT_DATA_API_KEY: z.string().optional(),
        // LangGraph: shared secret for POST /api/internal/agent/execute (Python → Next). Optional when not using the Python service.
        INTERNAL_AGENT_SECRET: z.string().optional(),
        // Base URL of the Python LangGraph service (runViaLangGraph). Optional; defaults to http://localhost:8000 in code when unset.
        LANGGRAPH_SERVICE_URL: z.string().url().optional(),
        // Mapbox GL (dashboard maps). Optional; maps show a graceful empty state when unset.
        NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        if (!isProduction) return;
        if (!data.LLM_PROVIDER || !["gemini", "openai"].includes(data.LLM_PROVIDER)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["LLM_PROVIDER"], message: "LLM_PROVIDER must be openai or gemini in production" });
        }
        if (data.LLM_PROVIDER === "openai" && !(data.OPENAI_API_KEY?.trim())) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["OPENAI_API_KEY"], message: "OPENAI_API_KEY is required when LLM_PROVIDER is openai" });
        }
        if (data.LLM_PROVIDER === "gemini" && !(data.GEMINI_API_KEY?.trim())) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GEMINI_API_KEY"], message: "GEMINI_API_KEY is required when LLM_PROVIDER is gemini" });
        }
        // Redis is optional — caching is skipped gracefully when absent
        if (!data.GOOGLE_CLIENT_ID?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GOOGLE_CLIENT_ID"], message: "GOOGLE_CLIENT_ID is required in production" });
        }
        if (!data.GOOGLE_CLIENT_SECRET?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GOOGLE_CLIENT_SECRET"], message: "GOOGLE_CLIENT_SECRET is required in production" });
        }
        if (!data.PEXELS_API_KEY?.trim()) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["PEXELS_API_KEY"], message: "PEXELS_API_KEY is required in production" });
        }
        const appUrl = data.NEXT_PUBLIC_APP_URL?.trim();
        if (!appUrl) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["NEXT_PUBLIC_APP_URL"], message: "NEXT_PUBLIC_APP_URL is required in production" });
        } else {
            try {
                new URL(appUrl);
            } catch {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["NEXT_PUBLIC_APP_URL"], message: "NEXT_PUBLIC_APP_URL must be a valid URL" });
            }
        }
    });

const DEV_FALLBACKS = {
    DATABASE_URL: "postgresql://localhost:5432/voyageai_dev",
    JWT_ACCESS_SECRET: "dev-access-secret-do-not-use-in-production",
    JWT_REFRESH_SECRET: "dev-refresh-secret-do-not-use-in-production",
    CSRF_SECRET: "dev-csrf-secret-do-not-use-in-production",
} as const;

function getEnvInput() {
    if (process.env.NEXT_PUBLIC_PEXELS_API_KEY) {
        throw new Error("NEXT_PUBLIC_PEXELS_API_KEY must not exist — Pexels key must stay server-side only");
    }
    const raw = {
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
        CSRF_SECRET: process.env.CSRF_SECRET,
        REDIS_URL: process.env.REDIS_URL,
        DIRECT_URL: process.env.DIRECT_URL,
        NODE_ENV: process.env.NODE_ENV,
        ACCESS_TOKEN_EXPIRY_MS: process.env.ACCESS_TOKEN_EXPIRY_MS,
        REFRESH_TOKEN_EXPIRY_MS: process.env.REFRESH_TOKEN_EXPIRY_MS,
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        PEXELS_API_KEY: process.env.PEXELS_API_KEY,
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,
        BRIGHT_DATA_API_KEY: process.env.BRIGHT_DATA_API_KEY,
        INTERNAL_AGENT_SECRET: process.env.INTERNAL_AGENT_SECRET,
        LANGGRAPH_SERVICE_URL: process.env.LANGGRAPH_SERVICE_URL?.trim() || undefined,
        NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || undefined,
    };
    if (isProduction) return raw;
    return {
        ...raw,
        DATABASE_URL: raw.DATABASE_URL ?? DEV_FALLBACKS.DATABASE_URL,
        JWT_ACCESS_SECRET: raw.JWT_ACCESS_SECRET ?? DEV_FALLBACKS.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET ?? DEV_FALLBACKS.JWT_REFRESH_SECRET,
        CSRF_SECRET: raw.CSRF_SECRET ?? DEV_FALLBACKS.CSRF_SECRET,
    };
}

function validateEnv() {
    const result = EnvSchema.safeParse(getEnvInput());

    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        throw new Error(`Invalid environment: ${issues.join("; ")}`);
    }

    return result.data;
}

export const env = validateEnv();
