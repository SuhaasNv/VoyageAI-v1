"use client";

/**
 * itinerary-flow/useFlowState.ts
 *
 * State machine for the 5-stage agent pipeline.
 * Uses useReducer for typed, testable state transitions.
 * Persists to localStorage so users can resume a planning session.
 */

import { useReducer, useEffect, useCallback, useRef, useState } from "react";
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
import { loadFromStorage, saveToStorage, clearStorage } from "./flowStorage";

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
    | { type: "RESET"; input: FlowInput; sessionId: string }
    | { type: "RESTORE"; session: FlowState };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: FlowState, action: Action): FlowState {
    switch (action.type) {
        case "SET_LOADING":
            return { ...state, isLoading: true, error: null };

        case "SET_ERROR":
            return { ...state, isLoading: false, error: action.error };

        case "SET_PLANNER":
            return {
                ...state,
                isLoading: false,
                stage: "planner",
                plannerResult: action.result,
                meta: { ...state.meta, planner: action.meta },
                error: null,
            };

        case "SET_RESEARCH":
            return {
                ...state,
                isLoading: false,
                stage: "research",
                researchResult: action.result,
                meta: { ...state.meta, research: action.meta },
                error: null,
            };

        case "SET_LOGISTICS":
            return {
                ...state,
                isLoading: false,
                stage: "logistics",
                logisticsResult: action.result,
                meta: { ...state.meta, logistics: action.meta },
                error: null,
            };

        case "SET_BUDGET":
            return {
                ...state,
                isLoading: false,
                stage: "budget",
                budgetResult: action.result,
                meta: { ...state.meta, budget: action.meta },
                error: null,
            };

        case "SET_SAFETY":
            return {
                ...state,
                isLoading: false,
                stage: "safety",
                safetyResult: action.result,
                meta: { ...state.meta, safety: action.meta },
                error: null,
            };

        case "ADVANCE": {
            const order: FlowStage[] = ["planner", "research", "logistics", "budget", "safety", "saved"];
            const idx = order.indexOf(state.stage);
            const next = order[idx + 1] ?? "saved";
            return { ...state, isLoading: false, stage: next, error: null };
        }

        case "SAVED":
            return { ...state, isLoading: false, stage: "saved", error: null };

        case "RESET":
            return {
                ...initialState(action.input, action.sessionId),
                iteration: state.iteration + 1,
            };

        case "RESTORE":
            return { ...action.session, isLoading: false, error: null };

        default:
            return state;
    }
}

// ─── Initial state factory ────────────────────────────────────────────────────

function initialState(input: FlowInput, sessionId: string): FlowState {
    return {
        stage: "planner",
        isLoading: false,
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

// Storage logic moved to flowStorage.ts

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
    // useState so that setting a saved session triggers a re-render and the
    // resume banner can appear in the UI.
    const [savedSession, setSavedSession] = useState<FlowState | null>(null);

    // Load saved session on mount (only once). Only offer resume if the saved
    // session is for a different trip (same tripId would cause confusing loops).
    useEffect(() => {
        const saved = loadFromStorage();
        if (saved && saved.input.tripId !== input.tripId) {
            setSavedSession(saved);
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
        if (!savedSession) return;
        dispatch({ type: "RESTORE", session: savedSession });
        setSavedSession(null);
    }, [savedSession]);

    const discardSavedSession = useCallback(() => {
        setSavedSession(null);
        clearStorage();
    }, []);

    return {
        state,
        dispatch,
        resetAllAndRestart,
        savedSession,
        resumeSavedSession,
        discardSavedSession,
    };
}
