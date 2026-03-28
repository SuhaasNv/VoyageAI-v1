"use client";

/**
 * ItineraryCreationFlow — Master orchestrator for the 5-stage agent pipeline.
 *
 * Renders as a full-screen fixed overlay (z-50 inset-0 bg-[#0A0D12]).
 * Coordinates all stage components, state machine, explainability panel,
 * save celebration, and session resume.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, WifiOff } from "lucide-react";
import confetti from "canvas-confetti";

import { useFlowState } from "./useFlowState";
import { AgentPipelineHeader } from "./AgentPipelineHeader";
import { TripDNASummaryStrip } from "./TripDNASummaryStrip";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import { PlannerStage } from "./stages/PlannerStage";
import { ResearchStage } from "./stages/ResearchStage";
import { LogisticsStage } from "./stages/LogisticsStage";
import { BudgetStage } from "./stages/BudgetStage";
import { SafetyStage } from "./stages/SafetyStage";
import type { FlowInput, FlowStage, TripContext, EnrichedTripContext, OptimizedTripContext } from "./types";
import { ensureCsrfToken } from "@/lib/api";

interface ItineraryCreationFlowProps {
    tripId: string;
    input: FlowInput;
    onComplete: (tripId: string) => void;
    onClose: () => void;
}

// ─── Stage transition variants ────────────────────────────────────────────────

const stageVariants = {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -16 },
};

const stageTransition = { type: "spring" as const, stiffness: 300, damping: 30 };

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, variant = "success" }: { message: string; variant?: "success" | "error" | "info" }) {
    const bg =
        variant === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : variant === "error"
            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
            : "bg-white/[0.08] border-white/[0.15] text-slate-200";

    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] border rounded-2xl px-5 py-3 text-sm font-medium shadow-xl backdrop-blur-xl whitespace-nowrap ${bg}`}
        >
            {message}
        </motion.div>
    );
}

// ─── Session resume banner ────────────────────────────────────────────────────

function ResumeBanner({
    sessionDestination,
    onResume,
    onDiscard,
}: {
    sessionDestination: string;
    onResume: () => void;
    onDiscard: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-2 bg-white/[0.06] border border-white/[0.1] rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
        >
            <p className="text-sm text-slate-300">
                Resume planning <span className="text-white font-semibold">{sessionDestination}</span>?
            </p>
            <div className="flex gap-2 flex-shrink-0">
                <button
                    onClick={onResume}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full"
                >
                    Resume
                </button>
                <button
                    onClick={onDiscard}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors"
                >
                    Start fresh
                </button>
            </div>
        </motion.div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItineraryCreationFlow({ tripId, input, onComplete, onClose }: ItineraryCreationFlowProps) {
    const router = useRouter();
    const prefersReduced = useReducedMotion();
    const flowInput: FlowInput = { ...input, tripId };

    const { state, dispatch, resetAllAndRestart, savedSession, resumeSavedSession, discardSavedSession } =
        useFlowState(flowInput);

    const [isLoading, setIsLoading] = useState(false);
    const [explainOpen, setExplainOpen] = useState(false);
    const [explainStage, setExplainStage] = useState<Exclude<FlowStage, "saved">>("planner");
    const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "info" } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [mounted, setMounted] = useState(false);
    // Becomes true once the CSRF token is confirmed in the ref — gates the auto-start.
    const [csrfReady, setCsrfReady] = useState(false);

    const csrfTokenRef = useRef<string>("");

    useEffect(() => {
        setMounted(true);
        // Fetch (or read from cookie) the CSRF token BEFORE the planner auto-starts.
        ensureCsrfToken()
            .then((t) => {
                csrfTokenRef.current = t;
            })
            .catch(() => {
                // Even on failure, unblock the planner — callApi has its own retry.
            })
            .finally(() => {
                setCsrfReady(true);
            });
    }, []);

    // Offline detection
    useEffect(() => {
        setIsOffline(!navigator.onLine);
        const on = () => setIsOffline(false);
        const off = () => setIsOffline(true);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }, []);

    // Global keyboard shortcuts
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if (e.key === "?" && !e.shiftKey) {
                e.preventDefault();
                setExplainOpen((o) => !o);
            }
            if (e.key === "Escape" && !explainOpen) {
                // Esc closes only if not in a text field
                if (document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
                    onClose();
                }
            }
        }
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [explainOpen, onClose]);

    function showToast(message: string, variant?: "success" | "error" | "info") {
        setToast({ message, variant });
        setTimeout(() => setToast(null), 3500);
    }

    // ─── API calls ──────────────────────────────────────────────────────────────

    async function callApi<T>(endpoint: string, body: unknown): Promise<T> {
        // Use the pre-fetched cached token; fall back to a fresh fetch.
        let csrfToken = csrfTokenRef.current || (await ensureCsrfToken());

        const doRequest = async (token: string) =>
            fetch(`/api/ai/itinerary-flow/${endpoint}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": token,
                },
                body: JSON.stringify(body),
            });

        let res = await doRequest(csrfToken);

        // If CSRF was rejected (403), refresh the token once and retry.
        if (res.status === 403) {
            csrfToken = await ensureCsrfToken();
            csrfTokenRef.current = csrfToken;
            res = await doRequest(csrfToken);
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.error?.message || `${endpoint} failed`);
        }
        const json = await res.json();
        csrfTokenRef.current = csrfToken; // keep the working token cached
        return json.data as T;
    }

    // ─── Stage handlers ─────────────────────────────────────────────────────────

    const runPlanner = useCallback(async (userInput?: string) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "planner" });
        try {
            const prompt = [
                `${input.destination}, ${input.startDate} to ${input.endDate}`,
                input.style ? `Style: ${input.style}` : "",
                userInput || "",
            ].filter(Boolean).join(". ");

            const data = await callApi<TripContext & { _meta: Parameters<typeof dispatch>[0] extends { meta: infer M } ? M : never }>("planner", { input: prompt });
            const { _meta, ...result } = data as { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] } } & TripContext;
            dispatch({ type: "SET_PLANNER", result, meta: _meta });
        } catch (err) {
            dispatch({ type: "SET_ERROR", error: (err as Error).message });
            showToast("Planner agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [input, dispatch]);

    const runResearch = useCallback(async (plannerResult: TripContext, feedback?: string) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "research" });
        try {
            const context = feedback
                ? { ...plannerResult, _feedback: feedback }
                : plannerResult;
            const data = await callApi<EnrichedTripContext & { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] } }>("research", context);
            const { _meta, ...result } = data;
            dispatch({ type: "SET_RESEARCH", result, meta: _meta });
        } catch (err) {
            dispatch({ type: "SET_ERROR", error: (err as Error).message });
            showToast("Research agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [dispatch]);

    const runLogistics = useCallback(async (researchResult: EnrichedTripContext) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "logistics" });
        try {
            const data = await callApi<OptimizedTripContext & { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] } }>("logistics", researchResult);
            const { _meta, ...result } = data;
            dispatch({ type: "SET_LOGISTICS", result, meta: _meta });
        } catch (err) {
            dispatch({ type: "SET_ERROR", error: (err as Error).message });
            showToast("Logistics agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [dispatch]);

    const runBudget = useCallback(async (logisticsResult: OptimizedTripContext) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "budget" });
        try {
            const data = await callApi<import("./types").BudgetedTripContext & { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] } }>("budget", logisticsResult);
            const { _meta, ...result } = data;
            dispatch({ type: "SET_BUDGET", result, meta: _meta });
        } catch (err) {
            dispatch({ type: "SET_ERROR", error: (err as Error).message });
            showToast("Budget agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [dispatch]);

    const runSafety = useCallback(async (budgetResult: import("./types").BudgetedTripContext) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "safety" });
        try {
            const data = await callApi<import("./types").SafeTripContext & { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] } }>("safety", budgetResult);
            const { _meta, ...result } = data;
            dispatch({ type: "SET_SAFETY", result, meta: _meta });
        } catch (err) {
            dispatch({ type: "SET_ERROR", error: (err as Error).message });
            showToast("Safety agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [dispatch]);

    const handleSave = useCallback(async () => {
        if (!state.safetyResult) return;
        setIsSaving(true);
        try {
            await callApi("save", { tripId, safetyResult: state.safetyResult });
            // Confetti burst
            if (!prefersReduced) {
                confetti({ particleCount: 80, spread: 70, origin: { x: 0.2, y: 0.8 }, colors: ["#10B981", "#f59e0b", "#ffffff"] });
                confetti({ particleCount: 80, spread: 70, origin: { x: 0.8, y: 0.8 }, colors: ["#10B981", "#6366f1", "#ffffff"] });
            }
            showToast("Your trip is saved! Opening your itinerary...", "success");
            setTimeout(() => onComplete(tripId), 1800);
        } catch {
            showToast("Save failed. Check your connection and try again.", "error");
        } finally {
            setIsSaving(false);
        }
    }, [state.safetyResult, tripId, onComplete, prefersReduced]);

    // Auto-start planner only after CSRF token is confirmed ready
    useEffect(() => {
        if (!csrfReady) return;
        if (!state.plannerResult && !isLoading && state.stage === "planner" && state.error === null) {
            runPlanner();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [csrfReady]);

    function openExplain(stage: Exclude<FlowStage, "saved">) {
        setExplainStage(stage);
        setExplainOpen(true);
    }

    const activeExplainStage: Exclude<FlowStage, "saved"> =
        explainStage === "saved" ? "safety" : explainStage;

    // Don't render on server — portal needs document.body
    if (!mounted) return null;

    const overlay = (
        <div className="fixed inset-0 bg-[#0A0D12] flex flex-col overflow-hidden" style={{ zIndex: 9999 }}>
            {/* Fixed top zone */}
            <div className="flex-shrink-0 border-b border-white/[0.06] bg-[#0A0D12]/98 backdrop-blur-2xl">
                {/* Top bar */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-3">
                        {/* Logo dot */}
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.4)]">
                            <span className="text-[9px] font-black text-white">V</span>
                        </div>
                        <div>
                            <p className="text-[11px] font-bold text-white tracking-wide leading-none">Trip Builder</p>
                            <p className="text-[10px] text-slate-500 leading-none mt-0.5">
                                {flowInput.destination}
                                {flowInput.startDate && flowInput.endDate && (
                                    <> · {flowInput.startDate} – {flowInput.endDate}</>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white transition-all"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Pipeline header */}
                <AgentPipelineHeader
                    currentStage={state.stage}
                    meta={state.meta}
                    iteration={state.iteration}
                    onExplain={openExplain}
                />

                {/* DNA summary strip */}
                <TripDNASummaryStrip state={state} />

                {/* Session resume banner */}
                {savedSession && (
                    <ResumeBanner
                        sessionDestination={savedSession.input.destination}
                        onResume={resumeSavedSession}
                        onDiscard={discardSavedSession}
                    />
                )}
            </div>

            {/* Scrollable stage content */}
            <div className="flex-1 overflow-y-auto flow-scroll px-4 py-6 max-w-2xl mx-auto w-full">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={state.stage}
                        variants={stageVariants}
                        initial={prefersReduced ? {} : "initial"}
                        animate="animate"
                        exit={prefersReduced ? {} : "exit"}
                        transition={stageTransition}
                    >
                        {/* Planner */}
                        {(state.stage === "planner") && (
                            <PlannerStage
                                input={flowInput}
                                result={state.plannerResult}
                                meta={state.meta.planner ?? null}
                                isLoading={isLoading}
                                error={state.error}
                                onApprove={(result) => { dispatch({ type: "ADVANCE" }); runResearch(result); }}
                                onAdjust={() => {}}
                                onExplain={() => openExplain("planner")}
                                onRetry={() => runPlanner()}
                                onSubmitFeedback={(fb) => runPlanner(fb)}
                            />
                        )}

                        {/* Research */}
                        {state.stage === "research" && (
                            <ResearchStage
                                input={flowInput}
                                result={state.researchResult}
                                meta={state.meta.research ?? null}
                                isLoading={isLoading}
                                error={state.error}
                                onApprove={(result) => { dispatch({ type: "ADVANCE" }); runLogistics(result); }}
                                onAdjust={() => {}}
                                onExplain={() => openExplain("research")}
                                onRetry={() => state.plannerResult && runResearch(state.plannerResult)}
                                onSubmitFeedback={(fb) => state.plannerResult && runResearch(state.plannerResult, fb)}
                            />
                        )}

                        {/* Logistics */}
                        {state.stage === "logistics" && (
                            <LogisticsStage
                                input={flowInput}
                                result={state.logisticsResult}
                                meta={state.meta.logistics ?? null}
                                isLoading={isLoading}
                                error={state.error}
                                onApprove={(result) => { dispatch({ type: "ADVANCE" }); runBudget(result); }}
                                onAdjust={() => {}}
                                onExplain={() => openExplain("logistics")}
                                onRetry={() => state.researchResult && runLogistics(state.researchResult)}
                                onReoptimize={() => state.researchResult && runLogistics(state.researchResult)}
                            />
                        )}

                        {/* Budget */}
                        {state.stage === "budget" && (
                            <BudgetStage
                                input={flowInput}
                                result={state.budgetResult}
                                meta={state.meta.budget ?? null}
                                isLoading={isLoading}
                                error={state.error}
                                onApprove={(result) => { dispatch({ type: "ADVANCE" }); runSafety(result); }}
                                onAdjust={() => state.researchResult && runLogistics(state.researchResult)}
                                onExplain={() => openExplain("budget")}
                                onRetry={() => state.logisticsResult && runBudget(state.logisticsResult)}
                            />
                        )}

                        {/* Safety */}
                        {(state.stage === "safety" || state.stage === "saved") && (
                            <SafetyStage
                                input={flowInput}
                                result={state.safetyResult}
                                meta={state.meta.safety ?? null}
                                isLoading={isLoading}
                                error={state.error}
                                onApprove={() => handleSave()}
                                onAdjust={() => {}}
                                onExplain={() => openExplain("safety")}
                                onRetry={() => state.budgetResult && runSafety(state.budgetResult)}
                                onSave={handleSave}
                                onRedo={() => {
                                    resetAllAndRestart();
                                    showToast("Starting over — Run #" + (state.iteration + 1), "info");
                                    setTimeout(() => runPlanner(), 100);
                                }}
                                isSaving={isSaving}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Keyboard shortcuts bar */}
            <div className="fixed bottom-20 left-4 z-20 hidden md:flex items-center gap-2 opacity-30 hover:opacity-70 transition-opacity">
                {[
                    { key: "Enter", label: "approve" },
                    { key: "Esc", label: "close" },
                    { key: "?", label: "explain" },
                ].map(({ key, label }) => (
                    <span key={key} className="text-[10px] text-slate-500 flex items-center gap-1">
                        <kbd className="bg-white/[0.06] border border-white/[0.08] rounded px-1 py-0.5 font-mono">{key}</kbd>
                        {label}
                    </span>
                ))}
            </div>

            {/* Offline banner */}
            <AnimatePresence>
                {isOffline && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-2.5 text-sm text-rose-400"
                    >
                        <WifiOff className="w-4 h-4" />
                        Check your connection and try again
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>{toast && <Toast message={toast.message} variant={toast.variant} />}</AnimatePresence>

            {/* Explainability panel */}
            <ExplainabilityPanel
                isOpen={explainOpen}
                onClose={() => setExplainOpen(false)}
                stage={activeExplainStage}
                meta={state.meta[activeExplainStage] ?? null}
            />
        </div>
    );

    return createPortal(overlay, document.body);
}
