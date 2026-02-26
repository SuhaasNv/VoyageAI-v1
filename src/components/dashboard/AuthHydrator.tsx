"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * On dashboard mount, if we have cookies but no user in store (e.g. OAuth redirect,
 * new tab, or persist not yet rehydrated), fetch the current user to hydrate.
 * Uses GET /api/profile first (lightweight), falls back to refresh if 401.
 * Also ensures _hasHydrated becomes true within 150ms so we never get stuck on skeleton.
 */
export function AuthHydrator() {
    const { user, hydrateUser, _hasHydrated, _logoutPending } = useAuthStore();

    useEffect(() => {
        if (!user && !_logoutPending) hydrateUser();
    }, [!!user, _logoutPending]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (_hasHydrated) return;
        const t = setTimeout(() => useAuthStore.setState({ _hasHydrated: true }), 150);
        return () => clearTimeout(t);
    }, [_hasHydrated]);

    return null;
}
