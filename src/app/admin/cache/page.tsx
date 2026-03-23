/**
 * /admin/cache — Destination Image Cache Control
 *
 * Calls POST /api/admin/clear-image-cache (Upstash Redis).
 * Provides live feedback: loading state, success count, error.
 *
 * Auth: this is a Client Component so requireAdmin() (server-only) cannot be
 * called here directly. Access is gated at two independent layers:
 *   1. AdminLayout runs requireAdmin() server-side before this page renders.
 *   2. The API endpoint called here enforces requireAdminApiAuth independently.
 */
"use client";

import React from "react";
import { HardDrive, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { ensureCsrfToken } from "@/lib/api";

type Status = "idle" | "loading" | "success" | "error";

export default function CachePage() {
    const [status, setStatus]   = React.useState<Status>("idle");
    const [cleared, setCleared] = React.useState<number | null>(null);
    const [errMsg, setErrMsg]   = React.useState<string | null>(null);

    const handleClear = async () => {
        setStatus("loading");
        setCleared(null);
        setErrMsg(null);

        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/admin/clear-image-cache", {
                method:      "POST",
                credentials: "include",
                headers:     { "X-CSRF-Token": csrf },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }
            const json = await res.json();
            setCleared(json.data?.cleared ?? json.cleared ?? 0);
            setStatus("success");
        } catch (err) {
            setErrMsg((err as Error).message);
            setStatus("error");
        }
    };

    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7 space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Cache Control</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Manage Redis-backed destination image cache keys
                </p>
            </div>

            {/* Info panel */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#10B981]/10 flex items-center justify-center shrink-0">
                        <HardDrive className="w-5 h-5 text-[#10B981]" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-white">Destination Image Cache</p>
                        <p className="text-xs text-slate-500">Keys matching <code className="font-mono text-slate-400">destination-image:*</code> in Upstash Redis</p>
                    </div>
                </div>

                <div className="border-t border-white/[0.06] pt-3 space-y-1.5 text-xs text-slate-500">
                    <p>• Images are cached on first fetch to reduce Pexels/Unsplash API calls.</p>
                    <p>• Clearing forces a fresh fetch on next page load for all destinations.</p>
                    <p>• This only affects the image cache — no user data is deleted.</p>
                    <p>• If Redis is not configured, the operation is a no-op (safe).</p>
                </div>
            </div>

            {/* Action card */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-sm font-semibold text-white mb-1">Clear Image Cache</p>
                        <p className="text-xs text-slate-500">
                            Deletes all <code className="font-mono text-slate-400">destination-image:*</code> keys from Redis.
                        </p>
                    </div>

                    <button
                        onClick={handleClear}
                        disabled={status === "loading"}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shrink-0 ${
                            status === "loading"
                                ? "bg-white/[0.05] text-slate-500 cursor-not-allowed"
                                : "bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:border-red-500/40"
                        }`}
                    >
                        {status === "loading" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        {status === "loading" ? "Clearing…" : "Clear Cache"}
                    </button>
                </div>

                {/* Toast feedback */}
                {status === "success" && (
                    <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/20">
                        <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                        <span className="text-sm text-[#10B981]">
                            Cache cleared — <strong>{cleared}</strong> key{cleared !== 1 ? "s" : ""} removed.
                        </span>
                    </div>
                )}
                {status === "error" && (
                    <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-sm text-red-400">{errMsg ?? "An error occurred."}</span>
                    </div>
                )}
                {status === "success" && cleared === 0 && (
                    <p className="mt-2 text-xs text-slate-600">Cache was already empty or Redis is not configured.</p>
                )}
            </div>
        </div>
    );
}
