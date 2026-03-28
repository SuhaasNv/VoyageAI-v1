"use client";

/**
 * itinerary-flow/useFlowState.ts
 *
 * State machine for the 5-stage agent pipeline.
 * Uses useReducer for typed, testable state transitions.
 * Persists to localStorage so users can resume a planning session.
 */

import { useReducer, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
    FlowStage,
    FlowState,
    FlowInput,
    FlowMetadata,
    TripContext,
    EnrichedTripContext,
    OptimizedTripContext,
    BudgetedTripContext,
    SafeTripContext,
} from "./types";

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
    | { type: "SET_LOADING"; stage: FlowStage }
    | { type: "SET_ERROR"; error: string }
    | { type: "SET_PLANNER"; result: TripContext; meta: FlowMetadata }
    | { type: "SET_RESEARCH"; result: EnrichedTripContext; meta: FlowMetadata }
    | { type: "SET_LOGISTICS"; result: OptimizedTripContext; meta: FlowMetadata }
    | { type: "SET_BUDGET"; result: BudgetedTripContext; meta: FlowMetadata }
    | { type: "SET_SAFETY"; result: SafeTripContext; meta: FlowMetadata }
    | { type: "ADVANCE" }
    | { type: "SAVED" }
    | { type: "RESET"; input: FlowInput; sessionId: string };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: FlowState, action: Action): FlowState {
    switch (action.type) {
        case "SET_LOADING":
            return { ...state, error: null };

        case "SET_ERROR":
            return { ...state, error: action.error };

        case "SET_PLANNER":
            return {
                ...state,
                stage: "planner",
                plannerResult: action.result,
                meta: { ...state.meta, planner: action.meta },
                error: null,
            };

        case "SET_RESEARCH":
            return {
                ...state,
                stage: "research",
                researchResult: action.result,
                meta: { ...state.meta, research: action.meta },
                error: null,
            };

        case "SET_LOGISTICS":
            return {
                ...state,
                stage: "logistics",
                logisticsResult: action.result,
                meta: { ...state.meta, logistics: action.meta },
                error: null,
            };

        case "SET_BUDGET":
            return {
                ...state,
                stage: "budget",
                budgetResult: action.result,
                meta: { ...state.meta, budget: action.meta },
                error: null,
            };

        case "SET_SAFETY":
            return {
                ...state,
                stage: "safety",
                safetyResult: action.result,
                meta: { ...state.meta, safety: action.meta },
                error: null,
            };

        case "ADVANCE": {
            const order: FlowStage[] = ["planner", "research", "logistics", "budget", "safety", "saved"];
            const idx = order.indexOf(state.stage);
            const next = order[idx + 1] ?? "saved";
            return { ...state, stage: next, error: null };
        }

        case "SAVED":
            return { ...state, stage: "saved", error: null };

        case "RESET":
            return {
                ...initialState(action.input, action.sessionId),
                iteration: state.iteration + 1,
            };

        default:
            return state;
    }
}

// ─── Initial state factory ────────────────────────────────────────────────────

function initialState(input: FlowInput, sessionId: string): FlowState {
    return {
        stage: "planner",
        input,
        plannerResult: null,
        researchResult: null,
        logisticsResult: null,
        budgetResult: null,
        safetyResult: null,
        meta: {},
        iteration: 1,
        sessionId,
        error: null,
    };
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = "voyageai_flow_session_v2";

function saveToStorage(state: FlowState) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // quota exceeded — ignore
    }
}

function loadFromStorage(): FlowState | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as FlowState;
        // Validate it has the required shape
        if (!parsed.stage || !parsed.input || !parsed.sessionId) return null;
        // Don't resume a "saved" session
        if (parsed.stage === "saved") return null;
        return parsed;
    } catch {
        return null;
    }
}

function clearStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseFlowStateReturn {
    state: FlowState;
    dispatch: React.Dispatch<Action>;
    /** Resets all results and restarts from the planner stage. Increments iteration. */
    resetAllAndRestart: () => void;
    /** Returns a saved session if one exists for a different destination. */
    savedSession: FlowState | null;
    resumeSavedSession: () => void;
    discardSavedSession: () => void;
}

export function useFlowState(input: FlowInput): UseFlowStateReturn {
    const sessionId = useRef(uuidv4()).current;
    const [state, dispatch] = useReducer(reducer, initialState(input, sessionId));
    const savedSessionRef = useRef<FlowState | null>(null);

    // Load saved session on mount (only once)
    useEffect(() => {
        const saved = loadFromStorage();
        if (saved && saved.input.tripId !== input.tripId) {
            savedSessionRef.current = saved;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist state on every change (except "saved" terminal state)
    useEffect(() => {
        if (state.stage !== "saved") {
            saveToStorage(state);
        } else {
            clearStorage();
        }
    }, [state]);

    const resetAllAndRestart = useCallback(() => {
        dispatch({ type: "RESET", input, sessionId: uuidv4() });
    }, [input]);

    const resumeSavedSession = useCallback(() => {
        // Not implemented as a state dispatch — parent component handles
        // redirect/reload to the saved session's tripId.
    }, []);

    const discardSavedSession = useCallback(() => {
        savedSessionRef.current = null;
        clearStorage();
    }, []);

    return {
        state,
        dispatch,
        resetAllAndRestart,
        savedSession: savedSessionRef.current,
        resumeSavedSession,
        discardSavedSession,
    };
}
