import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        globals: true,
        // Load .env before any test module is imported so Prisma + env module
        // initialise with the real DATABASE_URL / JWT secrets.
        setupFiles: ["./tests/setup.ts"],
        // Allow individual tests to declare timeouts up to 3 minutes.
        // The E2E suite involves real LLM calls (planner + research) and DB writes.
        testTimeout: 180_000,
        hookTimeout: 30_000,
        include: [
            "src/**/*.{test,spec}.{ts,tsx}",
            "tests/**/*.{test,spec}.{ts,tsx}",
        ],
        // Exclude E2E suites from the default `npm test` run — they require
        // a live dev server on localhost:3000 and must be run from a dedicated
        // CI job that boots the server first.
        exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.next/**",
            "tests/e2e/**/*.{test,spec}.{ts,tsx}",
        ],
    },
});
