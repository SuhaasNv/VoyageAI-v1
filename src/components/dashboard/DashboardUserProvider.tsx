"use client";

import { useLayoutEffect } from "react";
import { useAuthStore, type AuthUser } from "@/stores/authStore";

/**
 * Hydrates the auth store with user data fetched server-side.
 * Runs before paint so name/email show immediately with no flash.
 */
export function DashboardUserProvider({ user }: { user: AuthUser }) {
    const setUserFromServer = useAuthStore((s) => s.setUserFromServer);

    useLayoutEffect(() => {
        setUserFromServer(user);
    }, [user, setUserFromServer]);

    return null;
}
