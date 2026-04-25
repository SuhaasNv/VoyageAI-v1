"use client";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRIMARY PRODUCTION UI — ItineraryCreationFlow                          ║
 * ║                                                                          ║
 * ║  This component is the single canonical entry point for itinerary       ║
 * ║  generation. It drives the staged pipeline in order:                    ║
 * ║    1. POST /api/ai/itinerary-flow/planner                               ║
 * ║    2. POST /api/ai/itinerary-flow/research                              ║
 * ║    3. POST /api/ai/itinerary-flow/logistics                             ║
 * ║    4. POST /api/ai/itinerary-flow/budget                                ║
 * ║    5. POST /api/ai/itinerary-flow/safety                                ║
 * ║    6. POST /api/ai/itinerary-flow/save                                  ║
 * ║                                                                          ║
 * ║  All UI surfaces that need to trigger itinerary generation MUST open    ║
 * ║  this component. The legacy /api/ai/itinerary route must NOT be called  ║
 * ║  from any production UI path.                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
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
import { WifiOff, ArrowLeft } from "lucide-react";
import confetti from "canvas-confetti";

import { useFlowState } from "./useFlowState";
import { FlowErrorBoundary } from "./FlowErrorBoundary";
import { AgentPipelineHeader } from "./AgentPipelineHeader";
import { TripDNASummaryStrip } from "./TripDNASummaryStrip";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import { AISuggestionsPanel } from "./AISuggestionsPanel";
import { SystemHeader } from "./SystemHeader";
import { ReasoningPanel } from "./ReasoningPanel";
import { PlannerStage } from "./stages/PlannerStage";
import { ResearchStage } from "./stages/ResearchStage";
import { LogisticsStage } from "./stages/LogisticsStage";
import { BudgetStage } from "./stages/BudgetStage";
import { SafetyStage } from "./stages/SafetyStage";
import type { FlowInput, FlowStage, TripContext, EnrichedTripContext, OptimizedTripContext, BudgetedTripContext, ApplyChange } from "./types";
import type { CostBreakdown, CostLineItem } from "@/agents/budget/budgetAgent";
import { ensureCsrfToken } from "@/lib/api";

// ─── Error humanizer ─────────────────────────────────────────────────────────
//
// Translates raw API / network error strings into friendly, actionable messages
// so technical jargon never surfaces to the user during a demo or live session.

function humanizeError(raw: string | undefined | null): string {
    const msg = (raw ?? "").toLowerCase();
    if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("signal"))
        return "The agent took too long to respond. Complex trips occasionally need more time — try again.";
    if (msg.includes("rate limit") || msg.includes("429"))
        return "Too many requests at once. Wait a few seconds and try again.";
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network") || msg.includes("econnreset"))
        return "Network issue detected. Check your connection, then try again.";
    if (msg.includes("401") || msg.includes("unauthorized"))
        return "Session expired. Refresh the page and sign in again.";
    if (msg.includes("403"))
        return "Access denied. If this persists, try refreshing the page.";
    if (msg.includes("500") || msg.includes("server error"))
        return "The server hit an issue. This usually resolves on a second attempt.";
    if (msg.includes("invalid json") || msg.includes("schema") || msg.includes("validation") || msg.includes("parse"))
        return "The AI returned an unexpected response. Retrying normally fixes this.";
    if (msg.includes("destination is too vague"))
        return "The destination is too vague. Try a more specific city or region (e.g. 'Bali, Indonesia').";
    // Generic fallback — always actionable
    return "Something went wrong. Try again — it usually works on the second attempt.";
}

// ─── Component props ──────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function ItineraryCreationFlow({ tripId, input, onComplete, onClose }: ItineraryCreationFlowProps) {
    const router = useRouter();
    const prefersReduced = useReducedMotion();
    const flowInput: FlowInput = { ...input, tripId };

    const { state, dispatch, resetAllAndRestart } = useFlowState(flowInput);

    const [isLoading, setIsLoading] = useState(false);
    const [showExitModal, setShowExitModal] = useState(false);
    const [explainOpen, setExplainOpen] = useState(false);
    const [explainStage, setExplainStage] = useState<Exclude<FlowStage, "saved">>("planner");
    const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" | "info" } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isApplyingPlan, setIsApplyingPlan] = useState(false);
    const [applyPlanWarnings, setApplyPlanWarnings] = useState<string[]>([]);
    const [appliedSavings, setAppliedSavings] = useState(0);
    const [applyChanges, setApplyChanges] = useState<ApplyChange[]>([]);
    // Becomes true once the CSRF token is confirmed in the ref — gates the auto-start.
    const [csrfReady, setCsrfReady] = useState(false);
    // Which completed stage the user is currently viewing (null = viewing the live stage).
    const [viewingStage, setViewingStage] = useState<Exclude<FlowStage, "saved"> | null>(null);

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

    // Close handler — shows confirmation modal when the pipeline is not yet saved.
    // The trip record stays in the DB as a draft; users can find it on the dashboard.
    const handleClose = useCallback(() => {
        if (state.stage === "saved") {
            onClose();
            return;
        }
        setShowExitModal(true);
    }, [state.stage, onClose]);

    // Global keyboard shortcuts
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if (e.key === "?" && !e.shiftKey) {
                e.preventDefault();
                setExplainOpen((o) => !o);
            }
            if (e.key === "Escape") {
                if (showExitModal) {
                    setShowExitModal(false);
                    return;
                }
                if (!explainOpen && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "INPUT") {
                    handleClose();
                }
            }
        }
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [explainOpen, handleClose, showExitModal]);

    function showToast(message: string, variant?: "success" | "error" | "info") {
        setToast({ message, variant });
        setTimeout(() => setToast(null), 3500);
    }

    // ─── API calls ──────────────────────────────────────────────────────────────

    async function callApi<T>(endpoint: string, body: unknown): Promise<T> {
        // Use the pre-fetched cached token; fall back to a fresh fetch.
        let csrfToken = csrfTokenRef.current || (await ensureCsrfToken());
        // Stage-aware timeout:
        //   research — Bright Data + LLM + dense-city dual-query geocoding can
        //              take 60–120 s for long multi-day luxury trips → 150 s.
        //   all other stages — 90 s covers worst-case LLM + routing latency.
        const timeoutMs = endpoint === "research" ? 150_000 : 90_000;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);

        const doRequest = async (token: string) =>
            fetch(`/api/ai/itinerary-flow/${endpoint}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": token,
                    // Thread the stable session ID through all pipeline calls for
                    // request correlation in server logs and agent replay entries.
                    "X-Flow-Session-Id": state.sessionId,
                },
                body: JSON.stringify(body),
                signal: timeoutSignal,
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
            const friendly = humanizeError((err as Error).message);
            dispatch({ type: "SET_ERROR", error: friendly });
            showToast("Planner agent failed. Try again.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [input, dispatch]);

    const runResearch = useCallback(async (plannerResult: TripContext, feedback?: string) => {
        setIsLoading(true);
        dispatch({ type: "SET_LOADING", stage: "research" });
        try {
            // Merge the user's original multi-vibe style (e.g. "relaxed, adventure") back into the
            // planner result before forwarding to research. The planner LLM only emits single-token
            // styles (its VALID_STYLES guard drops anything else), so without this merge the
            // downstream agents would only see whatever single style the LLM happened to infer.
            const mergedResult: TripContext = input.style
                ? { ...plannerResult, preferences: { ...plannerResult.preferences, style: input.style } }
                : plannerResult;
            const context = feedback
                ? { ...mergedResult, _feedback: feedback }
                : mergedResult;
            const data = await callApi<EnrichedTripContext & { _meta: { durationMs: number; confidence: number; dataSources: string[]; decisionsLog: string[] }; _dataSource?: string }>("research", context);
            const { _meta, _dataSource: _ds, ...result } = data;
            dispatch({ type: "SET_RESEARCH", result, meta: _meta });
        } catch (err) {
            const friendly = humanizeError((err as Error).message);
            dispatch({ type: "SET_ERROR", error: friendly });
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
            const friendly = humanizeError((err as Error).message);
            dispatch({ type: "SET_ERROR", error: friendly });
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
            const friendly = humanizeError((err as Error).message);
            dispatch({ type: "SET_ERROR", error: friendly });
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
            const friendly = humanizeError((err as Error).message);
            dispatch({ type: "SET_ERROR", error: friendly });
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
            // Mark the session as completed — this synchronously clears localStorage
            // via the useFlowState effect, so the resume banner never appears after save.
            dispatch({ type: "SAVED" });
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
    }, [state.safetyResult, tripId, onComplete, prefersReduced, dispatch]);

    const handleApplyPlan = useCallback(async () => {
        const currentBudget = state.budgetResult;
        const plan = currentBudget?.budget?.budgetAnalysis?.optimalPlan;
        if (!currentBudget || !plan) return;

        setIsApplyingPlan(true);
        try {
            const data = await callApi<{
                updatedContext: OptimizedTripContext;
                updatedBudget:  { total: number; breakdown: CostBreakdown; ledger: CostLineItem[] };
                warnings:       string[];
            }>("apply-plan", { context: currentBudget, plan });

            const originalTotal = currentBudget.budget.totalEstimatedCost;
            const newTotal      = data.updatedBudget.total;
            const preferences   = currentBudget.preferences;

            const updatedBudgetResult: BudgetedTripContext = {
                ...data.updatedContext,
                budget: {
                    ...currentBudget.budget,
                    totalEstimatedCost: newTotal,
                    costPerDay:         data.updatedBudget.breakdown.perDay,
                    isOverBudget:       preferences?.budget ? newTotal > preferences.budget : false,
                    budgetGap:          preferences?.budget && newTotal > preferences.budget
                                            ? newTotal - preferences.budget
                                            : undefined,
                    ledger:             data.updatedBudget.ledger,
                    costBreakdown:      data.updatedBudget.breakdown,
                    // Clear the plan so the Apply button disappears.
                    budgetAnalysis:     currentBudget.budget.budgetAnalysis
                                            ? { ...currentBudget.budget.budgetAnalysis, optimalPlan: undefined }
                                            : undefined,
                },
            };

            // Build the human-readable change list from the plan adjustments — no
            // context diffing needed since the plan already describes what changed.
            const changes: ApplyChange[] = plan.appliedAdjustments.map((adj) => {
                if (adj.action.type === "change_hotel") {
                    return {
                        type: "hotel_downgraded" as const,
                        description: `${adj.action.payload.hotelFrom ?? "?"} → ${adj.action.payload.hotelTo ?? "?"}`,
                    };
                }
                const name = adj.action.payload.activityName ?? "Activity";
                const day  = adj.action.payload.day;
                return {
                    type: "activity_removed" as const,
                    description: day ? `${name} · Day ${day}` : name,
                };
            });

            dispatch({ type: "PATCH_BUDGET", result: updatedBudgetResult });
            // Keep safetyResult.budget in sync so handleSave sends the post-adjustment cost.
            if (state.safetyResult) {
                dispatch({
                    type: "PATCH_SAFETY",
                    result: { ...state.safetyResult, budget: updatedBudgetResult.budget },
                });
            }
            setAppliedSavings(Math.max(0, originalTotal - newTotal));
            setApplyChanges(changes);
            setApplyPlanWarnings(data.warnings);
            showToast(
                data.warnings.length === 0
                    ? "Plan applied — itinerary updated ✓"
                    : "Plan applied with some notes",
                data.warnings.length === 0 ? "success" : "info",
            );
        } catch (err) {
            showToast("Failed to apply plan. Check your connection and try again.", "error");
        } finally {
            setIsApplyingPlan(false);
        }
    }, [state.budgetResult, dispatch]);

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

    function handleNavigate(stage: Exclude<FlowStage, "saved">) {
        // Only allow navigating to stages that have a result already.
        const hasResult =
            (stage === "planner"   && !!state.plannerResult)  ||
            (stage === "research"  && !!state.researchResult) ||
            (stage === "logistics" && !!state.logisticsResult)||
            (stage === "budget"    && !!state.budgetResult)   ||
            (stage === "safety"    && !!state.safetyResult);
        if (!hasResult) return;
        // Toggle off if already viewing this stage.
        setViewingStage((prev) => (prev === stage ? null : stage));
    }

    const activeExplainStage: Exclude<FlowStage, "saved"> = explainStage;

    // displayStage drives what's rendered in the center column.
    const displayStage: FlowStage = viewingStage ?? state.stage;
    // isViewMode = user is looking at a past completed stage, not the live one.
    const isViewMode = viewingStage !== null && viewingStage !== state.stage;

    const STAGE_LABELS_MAP: Record<Exclude<FlowStage, "saved">, string> = {
        planner: "Plan", research: "Research", logistics: "Route", budget: "Budget", safety: "Safety",
    };

    // Don't render on server — portal needs document.body
    if (!mounted) return null;

    const overlay = (
        <div
            className="fixed inset-0 flex flex-col overflow-hidden"
            style={{
                zIndex: 9999,
                background:
                    "radial-gradient(ellipse 80% 55% at 15% 0%, rgba(99,102,241,0.10) 0%, transparent 60%)," +
                    "radial-gradient(ellipse 60% 45% at 85% 100%, rgba(168,85,247,0.07) 0%, transparent 50%)," +
                    "linear-gradient(180deg, #090C14 0%, #060810 100%)",
            }}
        >
            {/* Noise texture */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
                }}
            />

            {/* ── System header (replaces old top bar) ──────────────────── */}
            <SystemHeader state={state} isLoading={isLoading} onClose={handleClose}>
                {/* Mobile-only pipeline header + DNA strip */}
                <div className="lg:hidden">
                    <AgentPipelineHeader
                        currentStage={state.stage}
                        meta={state.meta}
                        iteration={state.iteration}
                        onExplain={openExplain}
                        onNavigate={handleNavigate}
                        viewingStage={viewingStage}
                        layout="horizontal"
                        imageUrl={state.input.imageUrl}
                        destination={state.input.destination}
                    />
                    <TripDNASummaryStrip state={state} />
                </div>
            </SystemHeader>

            {/* ── 3-Column Layout ────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden flow-layout relative z-10">
                {/* ── LEFT SIDEBAR ── Trip meta + vertical stepper ────────── */}
                <aside className="hidden lg:flex flex-col border-r border-white/[0.06] bg-[#0B0F19]/60 backdrop-blur-md overflow-y-auto flow-scroll">
                    {/* Trip DNA */}
                    <div className="px-4 pt-5 pb-3 border-b border-white/[0.06]">
                        <TripDNASummaryStrip state={state} layout="vertical" />
                    </div>

                    {/* Vertical pipeline stepper */}
                    <div className="flex-1 px-2 py-4">
                        <AgentPipelineHeader
                            currentStage={state.stage}
                            meta={state.meta}
                            iteration={state.iteration}
                            onExplain={openExplain}
                            onNavigate={handleNavigate}
                            viewingStage={viewingStage}
                            layout="vertical"
                            imageUrl={state.input.imageUrl}
                            destination={state.input.destination}
                        />
                    </div>
                </aside>

                {/* ── CENTER — Main stage content ─────────────────────────── */}
                <main className="flex-1 overflow-y-auto flow-scroll relative">
                    {/* Soft radial gradient behind center content */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-[100px] pointer-events-none opacity-50" />
                    
                    <div className="px-6 py-6 max-w-3xl mx-auto w-full relative z-10">
                        {/* View mode banner */}
                        {isViewMode && (
                            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-white/[0.04] border border-white/[0.1] rounded-xl text-xs text-slate-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
                                Viewing <span className="text-white font-semibold mx-1">{STAGE_LABELS_MAP[viewingStage!]}</span> results — read only
                                <button
                                    onClick={() => setViewingStage(null)}
                                    className="ml-auto text-slate-500 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={displayStage}
                                variants={stageVariants}
                                initial={prefersReduced ? {} : "initial"}
                                animate="animate"
                                exit={prefersReduced ? {} : "exit"}
                                transition={stageTransition}
                            >
                                {/* Planner */}
                                {displayStage === "planner" && (
                                    <FlowErrorBoundary stage="Planner" onReset={() => runPlanner()}>
                                        <PlannerStage
                                            input={flowInput}
                                            result={state.plannerResult}
                                            meta={state.meta.planner ?? null}
                                            isLoading={isViewMode ? false : isLoading}
                                            error={isViewMode ? null : state.error}
                                            onApprove={isViewMode
                                                ? () => setViewingStage(null)
                                                : (result) => { dispatch({ type: "ADVANCE" }); runResearch(result); }}
                                            onAdjust={() => {}}
                                            onExplain={() => openExplain("planner")}
                                            onRetry={() => runPlanner()}
                                            onSubmitFeedback={(fb) => runPlanner(fb)}
                                        />
                                    </FlowErrorBoundary>
                                )}

                                {/* Research */}
                                {displayStage === "research" && (
                                    <FlowErrorBoundary stage="Research" onReset={() => state.plannerResult && runResearch(state.plannerResult)}>
                                        <ResearchStage
                                            input={flowInput}
                                            result={state.researchResult}
                                            meta={state.meta.research ?? null}
                                            isLoading={isViewMode ? false : isLoading}
                                            error={isViewMode ? null : state.error}
                                            onApprove={isViewMode
                                                ? () => setViewingStage(null)
                                                : (result) => { dispatch({ type: "ADVANCE" }); runLogistics(result); }}
                                            onAdjust={() => {}}
                                            onExplain={() => openExplain("research")}
                                            onRetry={() => state.plannerResult && runResearch(state.plannerResult)}
                                            onSubmitFeedback={(fb) => state.plannerResult && runResearch(state.plannerResult, fb)}
                                        />
                                    </FlowErrorBoundary>
                                )}

                                {/* Logistics */}
                                {displayStage === "logistics" && (
                                    <FlowErrorBoundary stage="Logistics" onReset={() => state.researchResult && runLogistics(state.researchResult)}>
                                        <LogisticsStage
                                            input={flowInput}
                                            result={state.logisticsResult}
                                            meta={state.meta.logistics ?? null}
                                            isLoading={isViewMode ? false : isLoading}
                                            error={isViewMode ? null : state.error}
                                            onApprove={isViewMode
                                                ? () => setViewingStage(null)
                                                : (result) => { dispatch({ type: "ADVANCE" }); runBudget(result); }}
                                            onAdjust={() => {}}
                                            onExplain={() => openExplain("logistics")}
                                            onRetry={() => state.researchResult && runLogistics(state.researchResult)}
                                            onReoptimize={() => state.researchResult && runLogistics(state.researchResult)}
                                        />
                                    </FlowErrorBoundary>
                                )}

                                {/* Budget */}
                                {displayStage === "budget" && (
                                    <FlowErrorBoundary stage="Budget" onReset={() => state.logisticsResult && runBudget(state.logisticsResult)}>
                                        <BudgetStage
                                            input={flowInput}
                                            result={state.budgetResult}
                                            meta={state.meta.budget ?? null}
                                            isLoading={isViewMode ? false : isLoading}
                                            error={isViewMode ? null : state.error}
                                            onApprove={isViewMode
                                                ? () => setViewingStage(null)
                                                : (result) => { dispatch({ type: "ADVANCE" }); runSafety(result); }}
                                            onAdjust={() => state.researchResult && runLogistics(state.researchResult)}
                                            onExplain={() => openExplain("budget")}
                                            onRetry={() => state.logisticsResult && runBudget(state.logisticsResult)}
                                            onApplyPlan={handleApplyPlan}
                                            isApplyingPlan={isApplyingPlan}
                                            applyPlanWarnings={applyPlanWarnings}
                                            appliedSavings={appliedSavings}
                                            applyChanges={applyChanges}
                                        />
                                    </FlowErrorBoundary>
                                )}

                                {/* Safety */}
                                {(displayStage === "safety" || displayStage === "saved") && (
                                    <FlowErrorBoundary stage="Safety" onReset={() => state.budgetResult && runSafety(state.budgetResult)}>
                                        <SafetyStage
                                            input={flowInput}
                                            result={state.safetyResult}
                                            meta={state.meta.safety ?? null}
                                            isLoading={isViewMode ? false : isLoading}
                                            error={isViewMode ? null : state.error}
                                            onApprove={isViewMode ? () => setViewingStage(null) : () => handleSave()}
                                            onAdjust={() => {}}
                                            onExplain={() => openExplain("safety")}
                                            onRetry={() => state.budgetResult && runSafety(state.budgetResult)}
                                            onSave={isViewMode ? () => setViewingStage(null) : handleSave}
                                            onRedo={() => {
                                                resetAllAndRestart();
                                                showToast("Starting over — Run #" + (state.iteration + 1), "info");
                                                setTimeout(() => runPlanner(), 100);
                                            }}
                                            isSaving={isViewMode ? false : isSaving}
                                        />
                                    </FlowErrorBoundary>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Return-to-live-stage overlay — sits above each stage's fixed bottom bar (z-30) */}
                    {isViewMode && (
                        <div className="fixed bottom-0 inset-x-0 z-[35] bg-[#090C14]/90 backdrop-blur-xl border-t border-white/[0.08] px-4 py-4">
                            <div className="max-w-2xl mx-auto">
                                <button
                                    onClick={() => setViewingStage(null)}
                                    className="w-full py-3.5 rounded-2xl border border-white/[0.12] bg-white/[0.04] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white/[0.08] transition-all duration-200"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to {STAGE_LABELS_MAP[state.stage as Exclude<FlowStage, "saved">] ?? "current stage"}
                                </button>
                                <p className="text-center text-[10px] text-slate-600 mt-1.5">
                                    Pipeline is still active — your progress is saved
                                </p>
                            </div>
                        </div>
                    )}
                </main>

                {/* ── RIGHT SIDEBAR ── Reasoning logs + AI suggestions ─────── */}
                <aside className="hidden lg:flex flex-col border-l border-white/[0.06] bg-[#080B13]/50 backdrop-blur-md overflow-hidden relative">
                    {/* Subtle purple glow behind reasoning panel */}
                    <div className="absolute top-1/4 right-0 w-[260px] h-[360px] bg-purple-500/[0.07] rounded-full blur-[70px] pointer-events-none" />
                    {/* Reasoning panel — cinematic agent log */}
                    <div className="flex-shrink-0 border-b border-white/[0.06] overflow-y-auto max-h-[310px] relative z-10">
                        <ReasoningPanel state={state} isLoading={isLoading} imageUrl={state.input.imageUrl} destination={state.input.destination} />
                    </div>
                    {/* AI suggestions panel below reasoning */}
                    <div className="flex-1 overflow-hidden relative z-10">
                        <AISuggestionsPanel state={state} isLoading={isLoading} />
                    </div>
                </aside>
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

            {/* Exit confirmation modal */}
            {showExitModal && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowExitModal(false)}
                    />
                    <div className="relative bg-[#0E1118] border border-white/[0.1] rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4 shadow-2xl">
                        <h3 className="text-base font-bold text-white">Exit setup?</h3>
                        <p className="text-sm text-slate-400">Your itinerary is not finished yet.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowExitModal(false)}
                                className="flex-1 py-2.5 rounded-xl border border-white/[0.1] text-sm text-slate-300 hover:bg-white/[0.04] transition-colors"
                            >
                                Continue editing
                            </button>
                            <button
                                onClick={() => { setShowExitModal(false); onClose(); }}
                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white font-semibold hover:bg-white/[0.1] transition-colors"
                            >
                                Save as draft &amp; exit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(overlay, document.body);
}
