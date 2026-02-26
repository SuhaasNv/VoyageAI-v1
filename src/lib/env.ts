import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const EnvSchema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    CSRF_SECRET: z.string().min(1, "CSRF_SECRET is required"),
    REDIS_URL: z.string().optional(),
    DIRECT_URL: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    ACCESS_TOKEN_EXPIRY_MS: z.coerce.number().optional(),
    REFRESH_TOKEN_EXPIRY_MS: z.coerce.number().optional(),
});

const DEV_FALLBACKS = {
    DATABASE_URL: "postgresql://localhost:5432/voyageai_dev",
    JWT_ACCESS_SECRET: "dev-access-secret-do-not-use-in-production",
    JWT_REFRESH_SECRET: "dev-refresh-secret-do-not-use-in-production",
    CSRF_SECRET: "dev-csrf-secret-do-not-use-in-production",
} as const;

function getEnvInput() {
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
