/**
 * src/lib/featureFlags.ts
 *
 * Admin panel feature flags for demo control.
 * Flip any flag to true to re-enable the feature.
 *
 * SHOW_PREDICTIONS — OLS log-trend warnings in the Ops Assistant panel.
 *   Requires ≥7 days of aiUsageLog data with R² ≥ 0.3.
 *   Hidden by default: data is sparse in a demo environment.
 *
 * SHOW_AUTONOMY — Executable action buttons in Ops Assistant responses
 *   (CLEAR_CACHE, CHECK_AI_PROVIDER, etc.) and the Autonomous Runner API.
 *   Requires AUTONOMY_MODE ≠ OFF in the server environment.
 *   Hidden by default: actions are a no-op when AUTONOMY_MODE=OFF.
 *
 * SHOW_USERS_NAV  — Users section in the admin sidebar.
 * SHOW_CACHE_NAV  — Cache control section in the admin sidebar.
 *   Both are real and functional but are not part of the AI-focused demo path.
 */

export const ADMIN_FLAGS = {
    SHOW_PREDICTIONS: false,
    SHOW_AUTONOMY:    false,
    SHOW_USERS_NAV:   false,
    SHOW_CACHE_NAV:   false,
} as const;
