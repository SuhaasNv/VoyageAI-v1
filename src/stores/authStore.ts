"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getCsrfToken } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
}

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    isLoading: boolean;
    error: string | null;

    setAuth: (user: AuthUser, accessToken: string) => void;
    updateUser: (updates: Partial<Pick<AuthUser, "name">>) => void;
    clearAuth: () => void;
    setLoading: (v: boolean) => void;
    setError: (msg: string | null) => void;
    refreshAccessToken: () => Promise<boolean>;
    logout: () => Promise<void>;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            isLoading: false,
            error: null,

            setAuth(user, accessToken) {
                set({ user, accessToken, error: null });
            },

            updateUser(updates) {
                const current = get().user;
                if (!current) return;
                set({ user: { ...current, ...updates } });
            },

            clearAuth() {
                set({ user: null, accessToken: null });
            },

            setLoading(v) {
                set({ isLoading: v });
            },

            setError(msg) {
                set({ error: msg });
            },

            async refreshAccessToken() {
                try {
                    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
                    if (!res.ok) {
                        get().clearAuth();
                        return false;
                    }
                    const json = await res.json();
                    if (json.success && json.data) {
                        set({
                            accessToken: json.data.accessToken,
                            user: json.data.user ?? get().user,
                        });
                        return true;
                    }
                    get().clearAuth();
                    return false;
                } catch {
                    get().clearAuth();
                    return false;
                }
            },

            async logout() {
                const { accessToken } = get();
                get().clearAuth();
                try {
                    await fetch("/api/auth/logout", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            Authorization: accessToken ? `Bearer ${accessToken}` : "",
                            "X-CSRF-Token": getCsrfToken(),
                        },
                    });
                } catch {
                    // best-effort
                }
            },
        }),
        {
            name: "voyageai-auth",
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
        }
    )
);
