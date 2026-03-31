"use client";

import type { FlowState } from "./types";

export const STORAGE_KEY = "voyageai_flow_session_v2";

export function saveToStorage(state: FlowState) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // quota exceeded — ignore
    }
}

export function loadFromStorage(): FlowState | null {
    if (typeof window === "undefined") return null;
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

export function clearStorage() {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}
