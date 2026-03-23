/**
 * /admin/explanations — AI Decision Explainability
 *
 * Shows a timestamped log of every AI decision made by the system
 * with full reasoning, input data summary, and confidence scores.
 *
 * Renders initial data server-side; client component handles filtering
 * and the inline "View Explanation" expansion panel.
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { getRecentDecisions } from "@/services/ai/explanation.service";
import type { DecisionEntry } from "@/services/ai/explanation.service";
import ExplanationsClient from "./_client";

async function ExplanationsContent() {
    await requireAdmin();
    const decisions = await getRecentDecisions(150);
    return <ExplanationsClient decisions={decisions} />;
}

export default async function ExplanationsPage() {
    return (
        <div className="w-full px-6 xl:px-10 2xl:px-16 py-7">
            <Suspense fallback={
                <div className="space-y-5 animate-pulse">
                    <div className="h-7 w-52 rounded-lg bg-white/[0.06]" />
                    <div className="h-10 w-full rounded-xl bg-white/[0.04] border border-white/[0.06]" />
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl bg-white/[0.03] border border-white/[0.06]" />
                    ))}
                </div>
            }>
                <ExplanationsContent />
            </Suspense>
        </div>
    );
}

export type { DecisionEntry };
