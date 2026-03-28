"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FlowMetadata } from "./types";

interface AuditTrailProps {
    meta: FlowMetadata;
    /** Pre-generated explanation bullets from generateTripExplanation() */
    explanationBullets?: string[];
}

export function AuditTrail({ meta, explanationBullets }: AuditTrailProps) {
    const [expanded, setExpanded] = useState(false);
    const PREVIEW_COUNT = 4;

    const logs = meta.decisionsLog;
    const preview = logs.slice(0, PREVIEW_COUNT);
    const rest = logs.slice(PREVIEW_COUNT);

    return (
        <div className="mt-4 space-y-3">
            {/* Section header */}
            <button
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center justify-between text-left"
            >
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Full decision log
                </span>
                {expanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                )}
            </button>

            {/* Decision log lines */}
            <div className="font-mono text-[11px] text-slate-500 space-y-1">
                {preview.map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                        <span className="text-slate-700 flex-shrink-0">›</span>
                        <span>{line}</span>
                    </div>
                ))}

                {expanded &&
                    rest.map((line, i) => (
                        <div key={`r${i}`} className="flex items-start gap-2">
                            <span className="text-slate-700 flex-shrink-0">›</span>
                            <span>{line}</span>
                        </div>
                    ))}
            </div>

            {/* Explanation bullets (from generateTripExplanation) */}
            {explanationBullets && explanationBullets.length > 0 && expanded && (
                <div className="pt-3 border-t border-white/[0.04] space-y-2">
                    <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                        AI Rationale
                    </p>
                    {explanationBullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-slate-500">
                            <span className="text-emerald-600 flex-shrink-0 mt-0.5">•</span>
                            <span>{b}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
