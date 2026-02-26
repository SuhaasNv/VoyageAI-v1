"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getCsrfToken } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    role: string;
    hasOnboarded?: boolean;
    createdAt: string;
}

interface AuthState {
    user: AuthUser | null;
    accessToken: string | null;
    isLoading: boolean;
    error: string | null;
    _hasHydrated: boolean;
    _logoutPending: boolean;

    setAuth: (user: AuthUser, accessToken: string) => void;
    setUserFromServer: (user: AuthUser) => void;
    setOnboarded: () => void;
    updateUser: (updates: Partial<Pick<AuthUser, "name" | "image" | "hasOnboarded">>) => void;
    clearAuth: () => void;
    setLoading: (v: boolean) => void;
    setError: (msg: string | null) => void;
    refreshAccessToken: () => Promise<boolean>;
    hydrateUser: () => Promise<boolean>;
    logout: () => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            isLoading: false,
            error: null,
            _hasHydrated: false,
            _logoutPending: false,

            setAuth(user, accessToken) {
                set({ user, accessToken, error: null });
            },

            setUserFromServer(user) {
                if (get()._logoutPending) return;
                set({ user, _hasHydrated: true });
            },

            setOnboarded() {
                const u = get().user;
                if (u) set({ user: { ...u, hasOnboarded: true } });
            },

            updateUser(updates) {
                const current = get().user;
                if (!current) return;
                set({ user: { ...current, ...updates } });
            },

            clearAuth() {
                set({ user: null, accessToken: null, _logoutPending: false });
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

            async hydrateUser() {
                try {
                    const res = await fetch("/api/profile", { method: "GET", credentials: "include" });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.data?.user) {
                            set({ user: json.data.user });
                            return true;
                        }
                    }
                    if (res.status === 401) {
                        return get().refreshAccessToken();
                    }
                    return false;
                } catch {
                    return get().refreshAccessToken();
                }
            },

            logout() {
                const { accessToken } = get();
                set({ _logoutPending: true });
                set({ user: null, accessToken: null });
                fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Authorization: accessToken ? `Bearer ${accessToken}` : "",
                        "X-CSRF-Token": getCsrfToken(),
                    },
                }).catch(() => {});
            },
        }),
        {
            name: "voyageai-auth",
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({ user: s.user, accessToken: s.accessToken }),
            onRehydrateStorage: () => () => {
                useAuthStore.setState({ _hasHydrated: true });
            },
        }
    )
);
