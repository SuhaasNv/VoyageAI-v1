"use client";

import { useEffect } from "react";
import { tryRecoverFromHMRStaleError } from "@/lib/isHMRStaleError";

/**
 * Dev-only listener for async chunk/module failures that bypass React error
 * boundaries (next/dynamic, route prefetch, etc.). Silent no-op in production.
 */
export function HMRRecoveryGuard() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return;

        const onError = (event: ErrorEvent) => {
            tryRecoverFromHMRStaleError(event.error ?? event.message);
        };
        const onRejection = (event: PromiseRejectionEvent) => {
            tryRecoverFromHMRStaleError(event.reason);
        };

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);

    return null;
}
