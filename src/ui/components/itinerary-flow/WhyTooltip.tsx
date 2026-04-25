"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle } from "lucide-react";
import type { AgentConfig } from "./agentRegistry";

interface WhyTooltipProps {
    /** The AI reasoning for this card's decision. */
    reason: string;
    /** 0–1 confidence to display as a percentage. */
    confidence?: number;
    agentColor?: AgentConfig["color"];
}

const COLOR_CLASSES: Record<NonNullable<AgentConfig["color"]>, string> = {
    indigo: "border-indigo-500/40 text-indigo-400",
    teal: "border-teal-500/40 text-teal-400",
    amber: "border-amber-500/40 text-amber-400",
    green: "border-emerald-500/40 text-emerald-400",
    purple: "border-purple-500/40 text-purple-400",

};

export function WhyTooltip({ reason, confidence, agentColor = "indigo" }: WhyTooltipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const colorClass = COLOR_CLASSES[agentColor];

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handle);
        return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    return (
        <div ref={ref} className="relative inline-flex">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((o) => !o);
                }}
                aria-label="Why was this chosen?"
                aria-describedby={open ? "why-tooltip" : undefined}
                className={`flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 transition-colors ${colorClass} bg-white/[0.03] hover:bg-white/[0.06]`}
            >
                <HelpCircle className="w-3 h-3" />
                Why?
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        id="why-tooltip"
                        role="tooltip"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className={`absolute bottom-full left-0 mb-2 z-50 w-64 bg-[#0B0F19]/90 backdrop-blur-xl border ${colorClass} rounded-2xl p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-2`}
                    >
                        <p className="text-xs text-slate-300 leading-relaxed">{reason}</p>
                        {confidence !== undefined && (
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-emerald-500/70"
                                        style={{ width: `${Math.round(confidence * 100)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] text-slate-500 flex-shrink-0">
                                    {Math.round(confidence * 100)}% (heuristic)
                                </span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
