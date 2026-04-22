"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, ExternalLink, CheckCircle2, Database } from "lucide-react";
import { AGENT_REGISTRY, agentColorClasses } from "./agentRegistry";
import { AuditTrail } from "./AuditTrail";
import type { FlowStage, FlowMetadata } from "./types";

interface ExplainabilityPanelProps {
    isOpen: boolean;
    onClose: () => void;
    stage: Exclude<FlowStage, "saved">;
    meta: FlowMetadata | null;
    explanationBullets?: string[];
}

export function ExplainabilityPanel({
    isOpen,
    onClose,
    stage,
    meta,
    explanationBullets,
}: ExplainabilityPanelProps) {
    const prefersReduced = useReducedMotion();
    const agent = AGENT_REGISTRY[stage];
    const colors = agentColorClasses(agent.color);
    const Icon = agent.icon;
    const panelRef = useRef<HTMLDivElement>(null);

    // Focus trap
    useEffect(() => {
        if (!isOpen) return;
        const panel = panelRef.current;
        if (!panel) return;
        const firstFocusable = panel.querySelector<HTMLElement>(
            'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();

        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    const confidence = meta?.confidence;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop (mobile only) */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/40 md:hidden"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        key="panel"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${agent.name} Explainability Panel`}
                        initial={prefersReduced ? {} : { x: "100%" }}
                        animate={{ x: 0 }}
                        exit={prefersReduced ? {} : { x: "100%" }}
                        transition={{ type: "spring", stiffness: 280, damping: 28 }}
                        className={[
                            "fixed z-[61] bg-[#0B0F19]/95 backdrop-blur-xl border-l border-white/[0.08] overflow-y-auto",
                            // Mobile: bottom sheet
                            "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-3xl",
                            // Desktop: right drawer
                            "md:top-0 md:right-0 md:bottom-0 md:left-auto md:w-[380px] md:max-h-none md:rounded-none",
                        ].join(" ")}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.bg} border ${colors.border}`}
                                    style={{ boxShadow: `0 0 16px ${agent.glow}` }}
                                >
                                    <Icon className={`w-5 h-5 ${colors.text}`} />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white tracking-tight">
                                        {agent.name}
                                    </h2>
                                    <p className="text-xs text-slate-500">AI Agent · Explainability</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            {/* Role description */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                                    Role
                                </p>
                                <p className="text-sm text-slate-300 leading-relaxed">{agent.role}</p>
                            </div>

                            {/* Confidence — only rendered when the agent provides a real value */}
                            {meta && confidence !== undefined && (
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                                        Confidence
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${
                                                    confidence >= 0.8
                                                        ? "bg-emerald-500"
                                                        : confidence >= 0.6
                                                        ? "bg-amber-500"
                                                        : "bg-rose-500"
                                                }`}
                                                style={{ width: `${Math.round(confidence * 100)}%` }}
                                            />
                                        </div>
                                        <span
                                            className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                                                confidence >= 0.8
                                                    ? "text-emerald-400 bg-emerald-500/10"
                                                    : confidence >= 0.6
                                                    ? "text-amber-400 bg-amber-500/10"
                                                    : "text-rose-400 bg-rose-500/10"
                                            }`}
                                        >
                                            {Math.round(confidence * 100)}%
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-1.5">
                                        Completed in {(meta.durationMs / 1000).toFixed(1)}s
                                    </p>
                                </div>
                            )}

                            {/* Data sources */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                                    Data Sources
                                </p>
                                <div className="space-y-1.5">
                                    {(meta?.dataSources ?? agent.dataSources).map((source, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
                                            <Database className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                                            {source}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* What this agent did NOT do */}
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                                    What this agent did NOT do
                                </p>
                                <div className="space-y-1.5">
                                    {agent.notDoing.map((item, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm text-slate-500">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-700 flex-shrink-0 mt-0.5" />
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Audit trail (Tier 3) */}
                            {meta && (
                                <div className="pt-4 border-t border-white/[0.04]">
                                    <AuditTrail
                                        meta={meta}
                                        explanationBullets={explanationBullets}
                                    />
                                </div>
                            )}

                            {/* Admin link */}
                            <a
                                href="/admin/agents"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors group"
                            >
                                <ExternalLink className="w-3.5 h-3.5 group-hover:text-indigo-400" />
                                Learn more in Agent Admin
                            </a>

                            {/* Keyboard hint */}
                            <p className="text-[10px] text-slate-700 text-center">
                                Press <kbd className="bg-white/[0.06] rounded px-1 py-0.5 text-slate-500">?</kbd> to toggle this panel
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
