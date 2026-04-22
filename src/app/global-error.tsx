"use client";

import { useEffect, useState } from "react";
import { tryRecoverFromHMRStaleError } from "@/lib/isHMRStaleError";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [isRecovering, setIsRecovering] = useState(false);

    useEffect(() => {
        console.error("[GlobalErrorBoundary]", error);
        if (tryRecoverFromHMRStaleError(error)) {
            setIsRecovering(true);
        }
    }, [error]);

    const isDev = process.env.NODE_ENV === "development";

    return (
        <html lang="en" className="dark">
            <body style={{ margin: 0, background: "#0A0D12", color: "#e5e7eb", fontFamily: "system-ui, sans-serif" }}>
                <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
                    {isRecovering ? (
                        <p style={{ fontSize: "0.875rem", fontFamily: "ui-monospace, monospace", color: "#94a3b8" }}>
                            Stale dev module detected. Reloading…
                        </p>
                    ) : (
                        <div style={{ maxWidth: "28rem", width: "100%", padding: "2rem", borderRadius: "1rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>Something went wrong</h1>
                            <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
                                We&apos;re sorry, but something unexpected happened. Please try again.
                            </p>
                            {isDev && (
                                <pre style={{ fontSize: "0.75rem", fontFamily: "ui-monospace, monospace", color: "#64748b", background: "rgba(255,255,255,0.02)", padding: "0.75rem", borderRadius: "0.5rem", overflow: "auto", maxHeight: "8rem", marginBottom: "1.5rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                    {error.message}
                                </pre>
                            )}
                            <button
                                onClick={reset}
                                style={{ width: "100%", padding: "0.75rem 1.25rem", borderRadius: "0.75rem", background: "#6366f1", color: "white", fontWeight: 600, fontSize: "0.875rem", border: "none", cursor: "pointer" }}
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </main>
            </body>
        </html>
    );
}
