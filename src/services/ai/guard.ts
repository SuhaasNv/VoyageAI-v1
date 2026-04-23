/**
 * src/services/ai/guard.ts
 *
 * Guard layer for the Autonomous Runner.
 *
 * Responsibilities:
 *  1. Read AUTONOMY_MODE env var — fail-safe default is "OFF"
 *  2. Validate proposed action type against the mode's allow-list
 *  3. Enforce minimum confidence threshold (>= 0.7)
 *  4. Enforce per-anomaly cooldown (30 min by default) to prevent tight loops
 *  5. Reject any action not explicitly in the allow-list
 *
 * SAFE mode  → read-only checks + non-destructive cache clears only
 * FULL mode  → above + model-level overrides (token reduction, provider switch)
 *
 * The guard is stateless except for the in-memory cooldown registry.
 * Cooldown resets on process restart (acceptable — we re-evaluate fresh on each run).
 */

import { logInfo } from "@/infrastructure/logger";

// ─── Autonomy mode ────────────────────────────────────────────────────────────

export type AutonomyMode = "OFF" | "SAFE" | "FULL";

/** Reads from AUTONOMY_MODE env var. Secure default: "OFF". */
export function getAutonomyMode(): AutonomyMode {
    const raw = (process.env.AUTONOMY_MODE ?? "OFF").toUpperCase();
    if (raw === "SAFE" || raw === "FULL") return raw;
    return "OFF";
}

// ─── Action allow-lists ───────────────────────────────────────────────────────

export type AutonomousActionType =
    | "CLEAR_CACHE"
    | "CHECK_SYSTEM"
    | "CHECK_AI_PROVIDER"
    | "REDUCE_TOKENS_25PCT"
    | "REDUCE_TOKENS_50PCT"
    | "PREFER_GEMINI"
    | "ENABLE_TIMEOUT_REDUCTION";

/**
 * SAFE: informational + non-destructive.
 * These never modify production traffic routing.
 */
const SAFE_ACTIONS = new Set<AutonomousActionType>([
    "CHECK_SYSTEM",
    "CHECK_AI_PROVIDER",
    "CLEAR_CACHE",
]);

/**
 * FULL: above + model-level overrides that affect request routing.
 * All actions are reversible and time-limited.
 */
const FULL_ACTIONS = new Set<AutonomousActionType>([
    ...SAFE_ACTIONS,
    "REDUCE_TOKENS_25PCT",
    "REDUCE_TOKENS_50PCT",
    "PREFER_GEMINI",
    "ENABLE_TIMEOUT_REDUCTION",
]);

/** Returns the allow-set for a given autonomy mode. */
export function allowedActionsForMode(mode: AutonomyMode): Set<AutonomousActionType> {
    if (mode === "FULL") return FULL_ACTIONS;
    if (mode === "SAFE") return SAFE_ACTIONS;
    return new Set(); // OFF — nothing allowed
}

// ─── Confidence threshold ─────────────────────────────────────────────────────

export const MIN_CONFIDENCE = 0.70;

// ─── Cooldown registry (in-memory, per process) ───────────────────────────────

/** Cooldown per (anomalyId × actionType) pair — 30 minutes. */
export const COOLDOWN_MS = 30 * 60 * 1000;

type CooldownKey = string;
const _cooldownRegistry = new Map<CooldownKey, number>(); // key → acted-at epoch ms

function cooldownKey(anomalyId: string, actionType: AutonomousActionType): CooldownKey {
    return `${anomalyId}::${actionType}`;
}

function isInCooldown(anomalyId: string, actionType: AutonomousActionType): boolean {
    const key     = cooldownKey(anomalyId, actionType);
    const ackedAt = _cooldownRegistry.get(key);
    if (!ackedAt) return false;
    return Date.now() - ackedAt < COOLDOWN_MS;
}

function setCooldown(anomalyId: string, actionType: AutonomousActionType): void {
    _cooldownRegistry.set(cooldownKey(anomalyId, actionType), Date.now());
}

/** Exported for testing / inspection — returns number of active cooldown entries. */
export function activeCooldowns(): number {
    const now = Date.now();
    let count = 0;
    for (const [, ackedAt] of _cooldownRegistry) {
        if (now - ackedAt < COOLDOWN_MS) count++;
    }
    return count;
}

// ─── Proposed action type ─────────────────────────────────────────────────────

export interface ProposedAction {
    type:       AutonomousActionType;
    reason:     string;
    /**
     * Confidence score for this proposed action.
     *
     * ⚠  Epistemological category depends on source:
     *  - LLM-proposed actions: self-reported by the model (not statistically calibrated).
     *  - Rule-based fallback:  heuristic values hand-tuned per action type.
     *
     * Used as a gate: actions below MIN_CONFIDENCE (0.7) are rejected regardless
     * of other checks.  The threshold is a policy choice, not a statistical threshold.
     */
    confidence: number;
    anomalyId:  string;
}

export interface GuardDecision {
    allowed:    boolean;
    reason:     string;
    action:     ProposedAction;
}

// ─── Main validation function ─────────────────────────────────────────────────

/**
 * Validates a single proposed autonomous action.
 * Returns { allowed, reason } — never throws.
 *
 * @param proposed   The action the LLM suggested
 * @param mode       Current autonomy mode
 */
export function validateAction(
    proposed: ProposedAction,
    mode:     AutonomyMode,
): GuardDecision {
    const reject = (reason: string): GuardDecision =>
        ({ allowed: false, reason, action: proposed });

    // 1. Mode gate
    if (mode === "OFF") {
        return reject("Autonomous mode is OFF");
    }

    // 2. Action type in allow-list
    const allowed = allowedActionsForMode(mode);
    if (!allowed.has(proposed.type)) {
        return reject(`Action "${proposed.type}" is not permitted in ${mode} mode`);
    }

    // 3. Confidence gate
    if (proposed.confidence < MIN_CONFIDENCE) {
        return reject(
            `Confidence ${proposed.confidence.toFixed(2)} is below minimum threshold ${MIN_CONFIDENCE}`
        );
    }

    // 4. Cooldown gate
    if (isInCooldown(proposed.anomalyId, proposed.type)) {
        return reject(
            `Cooldown active for anomaly "${proposed.anomalyId}" × action "${proposed.type}"`
        );
    }

    logInfo("[Guard] action approved", {
        type:       proposed.type,
        confidence: proposed.confidence,
        anomalyId:  proposed.anomalyId,
        mode,
    });

    return { allowed: true, reason: "All checks passed", action: proposed };
}

/**
 * Mark an action as executed for this anomaly — starts the cooldown timer.
 * Call this only after the action has actually been dispatched.
 */
export function markActed(anomalyId: string, actionType: AutonomousActionType): void {
    setCooldown(anomalyId, actionType);
}
