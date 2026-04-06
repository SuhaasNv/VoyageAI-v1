"use client";

import type { FlowState } from "./types";

export const STORAGE_KEY = "voyageai_flow_session_v2";

// Sessions older than 24 hours are considered stale and discarded.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredEntry {
    savedAt: number;
    state: FlowState;
}

export function saveToStorage(state: FlowState) {
    if (typeof window === "undefined") return;
    try {
        const entry: StoredEntry = { savedAt: Date.now(), state };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
        // quota exceeded — ignore
    }
}

export function loadFromStorage(): FlowState | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<StoredEntry> & Partial<FlowState>;

        // Support legacy format (stored raw FlowState without wrapper)
        const savedAt: number = parsed.savedAt ?? 0;
        const state: FlowState = parsed.state ?? (parsed as FlowState);

        // Validate required shape
        if (!state.stage || !state.input || !state.sessionId) return null;

        // Discard completed sessions
        if (state.stage === "saved") return null;

        // Discard stale sessions
        if (savedAt > 0 && Date.now() - savedAt > SESSION_TTL_MS) {
            clearStorage();
            return null;
        }

        return state;
    } catch {
        return null;
    }
}

export function clearStorage() {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}
