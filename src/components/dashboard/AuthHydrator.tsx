"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * On dashboard mount, if we have cookies (from OAuth redirect) but no user in store,
 * call refresh to hydrate the auth state.
 */
export function AuthHydrator() {
    const { user, refreshAccessToken } = useAuthStore();

    useEffect(() => {
        if (!user) {
            refreshAccessToken();
        }
    }, [user, refreshAccessToken]);

    return null;
}
