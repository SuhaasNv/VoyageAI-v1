const HMR_STALE_SIGNATURES = [
    "module factory is not available",
    "Loading chunk",
    "ChunkLoadError",
    "Failed to fetch dynamically imported module",
    "Cannot find module",
    "Importing a module script failed",
] as const;

export function isHMRStaleError(error: unknown): boolean {
    if (!error) return false;

    if (typeof error === "object" && error !== null && "name" in error) {
        const name = (error as { name?: unknown }).name;
        if (typeof name === "string" && name === "ChunkLoadError") return true;
    }

    const message =
        typeof error === "string"
            ? error
            : typeof error === "object" && error !== null && "message" in error
                ? String((error as { message?: unknown }).message ?? "")
                : "";

    if (!message) return false;
    return HMR_STALE_SIGNATURES.some((sig) => message.includes(sig));
}

/**
 * Reload the page at most once per session to avoid crash loops when the
 * underlying error is not actually HMR-related. Returns true if a reload was
 * triggered.
 */
export function tryRecoverFromHMRStaleError(error: unknown): boolean {
    if (process.env.NODE_ENV !== "development") return false;
    if (typeof window === "undefined") return false;
    if (!isHMRStaleError(error)) return false;

    const KEY = "__hmrRecoveryReloaded";
    try {
        if (window.sessionStorage.getItem(KEY)) return false;
        window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
        // sessionStorage unavailable (private mode, etc.) — skip recovery
        return false;
    }

    window.location.reload();
    return true;
}
