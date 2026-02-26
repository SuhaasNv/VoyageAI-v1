"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[ErrorBoundary]", error);
    }, [error]);

    const isDev = process.env.NODE_ENV === "development";

    return (
        <main className="min-h-screen bg-[#0A0D12] flex items-center justify-center px-6 selection:bg-white/20">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(56,80,104,0.15),transparent_50%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />

            <div className="relative w-full max-w-md p-8 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
                    <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>

                <h1 className="text-2xl font-bold text-white text-center mb-3">
                    Something went wrong
                </h1>
                <p className="text-slate-400 text-center text-sm leading-relaxed mb-6">
                    We&apos;re sorry, but something unexpected happened. Please try again.
                </p>

                {isDev && (
                    <div className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 overflow-auto max-h-32">
                        <p className="text-xs font-mono text-slate-500 break-all">
                            {error.message}
                        </p>
                        {error.digest && (
                            <p className="text-xs font-mono text-slate-600 mt-2">
                                Digest: {error.digest}
                            </p>
                        )}
                    </div>
                )}

                <button
                    onClick={reset}
                    className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_28px_rgba(99,102,241,0.4)]"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                </button>
            </div>
        </main>
    );
}
