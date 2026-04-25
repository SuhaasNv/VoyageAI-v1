import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rule-level overrides applied after preset configs.
  {
    rules: {
      // react-hooks v5 (React 19 plugin) made this an error for patterns like
      // `useEffect(() => setMounted(true), [])` (hydration guards, initialising
      // state from browser APIs / localStorage, etc.) which are widely-used and
      // accepted by the React team.  Demote to warn so CI is not blocked.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // One-off migration scripts use CommonJS require() — not part of the app.
    "scripts/**",
    // Placeholder image for DigitalOcean App Platform — CJS, not part of the app.
    "infra/placeholder/**",
    // Generated load/perf artifacts (JMeter HTML bundles third-party vendor JS).
    "report-clean/**",
    "report/**",
    "performance/report/**",
    "jmeter/results/**",
    "coverage/**",
    // Generated test artifacts.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
