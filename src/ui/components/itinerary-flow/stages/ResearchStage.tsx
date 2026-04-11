"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, Sparkles, Loader2, Star, GripVertical, ArrowLeftRight, LayoutGrid } from "lucide-react";
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AgentThinkingCard } from "../AgentThinkingCard";
import { ResearchSkeleton } from "../skeletons/StageSkeletons";
import { stageContentVariants, stageContentTransition } from "../transitions";
import { WhyTooltip } from "../WhyTooltip";
import type { StageProps, EnrichedTripContext, FlowMetadata } from "../types";
import type { Activity } from "@/agents/research/researchAgent";

// ─── Types ────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<Activity["type"], string> = {
    attraction: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    experience:  "text-teal-400  bg-teal-500/10  border-teal-500/20",
    restaurant:  "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const PRICE_STARS: Record<string, number> = { $: 1, "$$": 2, "$$$": 3, "$$$$": 4 };

type DaySlots = { selected: Activity[]; pool: Activity[] };

function initSlots(r: EnrichedTripContext): Map<number, DaySlots> {
    return new Map(
        r.days.map((d) => [
            d.day,
            { selected: d.activities.slice(0, 4), pool: d.activities.slice(4) },
        ])
    );
}

// ─── Drag ID helpers ──────────────────────────────────────────────────────────

function poolDragId(dayNum: number, actName: string) {
    return `pool::${dayNum}::${actName}`;
}
function slotDropId(dayNum: number, slotIdx: number) {
    return `slot::${dayNum}::${slotIdx}`;
}

// ─── Draggable alternative card ───────────────────────────────────────────────

function DraggablePoolCard({
    activity,
    dayNum,
    onAdd,
}: {
    activity: Activity;
    dayNum: number;
    onAdd: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: poolDragId(dayNum, activity.name),
    });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={{ transform: transform ? CSS.Transform.toString(transform) : undefined }}
            onClick={onAdd}
            className={`relative group flex-shrink-0 w-44 rounded-xl border p-3 select-none touch-none backdrop-blur-md transition-all duration-300 ${
                isDragging
                    ? "opacity-25 cursor-grabbing border-white/[0.06] bg-white/[0.02]"
                    : "cursor-grab bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.05] hover:border-teal-500/35 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
            }`}
        >
            {/* Drag affordance */}
            <div className="absolute top-2 right-2 text-slate-700 group-hover:text-slate-500 transition-colors pointer-events-none">
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            <p className="text-[12px] font-semibold text-slate-200 leading-snug pr-5 mb-2 line-clamp-2">
                {activity.name}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[activity.type]}`}>
                    {activity.type}
                </span>
                {activity.estimatedCost !== undefined && (
                    <span className="text-[10px] text-slate-500">~${activity.estimatedCost}</span>
                )}
            </div>
            <p className="mt-2 text-[9px] text-slate-600 flex items-center gap-1">
                <ArrowLeftRight className="w-2.5 h-2.5" />
                drag to swap · tap to add
            </p>
        </div>
    );
}

// ─── Droppable selected slot ──────────────────────────────────────────────────

function DroppableSlot({
    activity,
    dayNum,
    slotIdx,
    onRemove,
    meta,
    isDragActive,
}: {
    activity: Activity;
    dayNum: number;
    slotIdx: number;
    onRemove: () => void;
    meta: FlowMetadata | null;
    isDragActive: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: slotDropId(dayNum, slotIdx) });

    return (
        <div
            ref={setNodeRef}
            className={`relative flex flex-col gap-2 rounded-2xl p-3.5 min-h-[104px] backdrop-blur-md transition-all duration-300 ${
                isOver
                    ? "bg-teal-500/[0.08] border-2 border-teal-400/55 shadow-[0_0_28px_rgba(20,184,166,0.18)] scale-[1.02]"
                    : isDragActive
                    ? "bg-white/[0.02] border border-dashed border-white/[0.2]"
                    : "bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.05] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
            }`}
        >
            {/* Remove → sends back to pool */}
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                title="Return to alternatives"
                className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white/[0.05] hover:bg-rose-500/20 flex items-center justify-center text-slate-600 hover:text-rose-400 transition-all duration-200 z-10"
            >
                <X className="w-3 h-3" />
            </button>

            {/* Swap hint overlay shown when something is dragged over */}
            <AnimatePresence>
                {isOver && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="absolute inset-0 rounded-2xl z-20 flex items-center justify-center backdrop-blur-[2px]"
                    >
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-teal-200 bg-[#0B0F19]/90 border border-teal-500/30 rounded-full px-3 py-1.5 shadow-lg">
                            <ArrowLeftRight className="w-3 h-3" />
                            Swap
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            <p className="text-[13px] font-semibold text-white leading-snug pr-6 line-clamp-2">
                {activity.name}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[activity.type]}`}>
                    {activity.type}
                </span>
                {activity.estimatedCost !== undefined && (
                    <span className="text-[11px] text-slate-500">~${activity.estimatedCost}</span>
                )}
            </div>
            <WhyTooltip
                reason={activity.description || "Chosen based on your travel style and day theme."}
                confidence={meta?.confidence}
                agentColor="teal"
            />
        </div>
    );
}

// ─── Ghost card shown in DragOverlay ─────────────────────────────────────────

function DragGhostCard({ activity }: { activity: Activity }) {
    return (
        <div className="w-44 rounded-xl p-3 bg-[#0B0F19] border border-teal-400/50 shadow-[0_20px_60px_rgba(0,0,0,0.7)] rotate-[2.5deg] scale-[1.05] pointer-events-none">
            <p className="text-[12px] font-bold text-white leading-snug mb-2 line-clamp-2">{activity.name}</p>
            <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${TYPE_COLORS[activity.type]}`}>
                    {activity.type}
                </span>
                {activity.estimatedCost !== undefined && (
                    <span className="text-[10px] text-slate-400">~${activity.estimatedCost}</span>
                )}
            </div>
        </div>
    );
}

// ─── ResearchStage ────────────────────────────────────────────────────────────

interface ResearchStageProps extends StageProps<EnrichedTripContext> {
    onSubmitFeedback: (feedback: string) => void;
}

export function ResearchStage({
    input,
    result,
    meta,
    isLoading,
    error,
    onApprove,
    onExplain,
    onRetry,
    onSubmitFeedback,
}: ResearchStageProps) {
    const prefersReduced = useReducedMotion();

    const [localResult,      setLocalResult]      = useState<EnrichedTripContext | null>(result);
    const [activeDay,        setActiveDay]         = useState(1);
    const [slots,            setSlots]             = useState<Map<number, DaySlots>>(() => result ? initSlots(result) : new Map());
    const [selectedHotelIdx, setSelectedHotelIdx]  = useState(0);
    const [adjustOpen,       setAdjustOpen]        = useState(false);
    const [feedback,         setFeedback]          = useState("");
    const [activeDragId,     setActiveDragId]      = useState<string | null>(null);

    // Sync when parent sends a fresh result (e.g. after re-research).
    // useEffect avoids reading/writing refs during render.
    useEffect(() => {
        if (result) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLocalResult(result);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveDay(result.days[0]?.day ?? 1);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSlots(initSlots(result));
        }
    }, [result]);

    // ─── DnD sensors ─────────────────────────────────────────────────────────
    // Distance constraint: requires 6px movement before drag activates,
    // so a plain tap/click still fires the onClick handler.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
    );

    // ─── Drag handlers ────────────────────────────────────────────────────────

    function handleDragStart({ active }: DragStartEvent) {
        setActiveDragId(active.id as string);
    }

    function handleDragEnd({ active, over }: DragEndEvent) {
        setActiveDragId(null);
        if (!over) return;

        const activeStr = active.id as string;
        const overStr   = over.id as string;

        if (!activeStr.startsWith("pool::") || !overStr.startsWith("slot::")) return;

        const [, dayNumStr, actName] = activeStr.split("::");
        const [, ,          slotIdxStr] = overStr.split("::");

        const day     = parseInt(dayNumStr);
        const slotIdx = parseInt(slotIdxStr);

        setSlots((prev) => {
            const curr = prev.get(day);
            if (!curr) return prev;

            const dragged   = curr.pool.find((a) => a.name === actName);
            if (!dragged) return prev;

            const displaced = curr.selected[slotIdx];

            const newSelected = [...curr.selected];
            newSelected[slotIdx] = dragged;

            const newPool = curr.pool.filter((a) => a.name !== actName);
            if (displaced) newPool.push(displaced);

            return new Map(prev).set(day, { selected: newSelected, pool: newPool });
        });
    }

    // ─── Slot / pool mutations ────────────────────────────────────────────────

    function addToLineup(day: number, actName: string) {
        setSlots((prev) => {
            const curr = prev.get(day);
            if (!curr) return prev;
            const act = curr.pool.find((a) => a.name === actName);
            if (!act) return prev;
            return new Map(prev).set(day, {
                selected: [...curr.selected, act],
                pool:     curr.pool.filter((a) => a.name !== actName),
            });
        });
    }

    function returnToPool(day: number, slotIdx: number) {
        setSlots((prev) => {
            const curr = prev.get(day);
            if (!curr) return prev;
            const removed = curr.selected[slotIdx];
            return new Map(prev).set(day, {
                selected: curr.selected.filter((_, i) => i !== slotIdx),
                pool:     removed ? [...curr.pool, removed] : curr.pool,
            });
        });
    }

    function handleApprove() {
        if (!localResult) return;

        // Reconstruct days: selected activities first, then pool (for downstream agents)
        const updatedDays = localResult.days.map((day) => {
            const ds = slots.get(day.day);
            if (!ds) return day;
            return { ...day, activities: [...ds.selected, ...ds.pool] };
        });

        onApprove({
            ...localResult,
            days: updatedDays,
            hotels: [
                localResult.hotels[selectedHotelIdx],
                ...localResult.hotels.filter((_, i) => i !== selectedHotelIdx),
            ],
        });
    }

    // ─── Derived ──────────────────────────────────────────────────────────────

    const activeGhostActivity = (() => {
        if (!activeDragId) return null;
        const [, dayNumStr, actName] = activeDragId.split("::");
        return slots.get(parseInt(dayNumStr))?.pool.find((a) => a.name === actName) ?? null;
    })();

    // ─── Derived (only meaningful once localResult is present) ───────────────
    const currentDayData = localResult?.days.find((d) => d.day === activeDay);
    const currentSlots   = slots.get(activeDay) ?? { selected: [], pool: [] };
    const isDragActive   = activeDragId !== null;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <AnimatePresence mode="wait">
                {isLoading ? (
                    <motion.div
                        key="loading"
                        variants={stageContentVariants}
                        initial={prefersReduced ? false : "initial"}
                        animate="animate"
                        exit={prefersReduced ? undefined : "exit"}
                        transition={stageContentTransition}
                    >
                        <AgentThinkingCard
                            stage="research"
                            destination={input.destination}
                            onRetry={onRetry}
                            skeleton={<ResearchSkeleton />}
                        />
                    </motion.div>
                ) : error ? (
                    <motion.div
                        key="error"
                        variants={stageContentVariants}
                        initial={prefersReduced ? false : "initial"}
                        animate="animate"
                        exit={prefersReduced ? undefined : "exit"}
                        transition={stageContentTransition}
                    >
                        <AgentThinkingCard
                            stage="research"
                            isError
                            errorMessage={error ?? undefined}
                            onRetry={onRetry}
                            destination={input.destination}
                        />
                    </motion.div>
                ) : localResult ? (
            <motion.div
                key="loaded"
                variants={stageContentVariants}
                initial={prefersReduced ? false : "initial"}
                animate="animate"
                exit={prefersReduced ? undefined : "exit"}
                transition={stageContentTransition}
                className="space-y-6"
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white tracking-tight">Activity Curation</h3>
                    <button
                        onClick={onExplain}
                        className="text-xs text-teal-400 hover:text-teal-300 border border-teal-500/20 rounded-full px-2.5 py-0.5 transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                        ? Explain
                    </button>
                </div>

                {/* Day tab bar */}
                <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                    {localResult.days.map((day) => (
                        <button
                            key={day.day}
                            onClick={() => setActiveDay(day.day)}
                            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                                activeDay === day.day
                                    ? "bg-teal-500/15 border border-teal-500/30 text-teal-300"
                                    : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300"
                            }`}
                        >
                            Day {day.day}
                        </button>
                    ))}
                </div>

                {/* Per-day content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeDay}
                        initial={prefersReduced ? {} : { opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={prefersReduced ? {} : { opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-5"
                    >
                        {/* Day theme */}
                        <p className="text-sm text-slate-400">
                            <span className="text-white font-semibold">{currentDayData?.theme}</span>
                        </p>

                        {/* ── LINEUP ─────────────────────────────────────── */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <p className="section-heading">Your Lineup</p>
                                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                                        currentSlots.selected.length === 0
                                            ? "bg-white/[0.04] border-white/[0.08] text-slate-600"
                                            : "bg-teal-500/10 border-teal-500/20 text-teal-400"
                                    }`}>
                                        {currentSlots.selected.length} {currentSlots.selected.length === 1 ? "activity" : "activities"}
                                    </span>
                                </div>

                                {/* Contextual hint while dragging */}
                                <AnimatePresence>
                                    {isDragActive && (
                                        <motion.span
                                            initial={{ opacity: 0, x: 4 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 4 }}
                                            className="text-[10px] text-teal-400 font-medium"
                                        >
                                            Drop on a card to swap ↓
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </div>

                            {currentSlots.selected.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-white/[0.1] text-center gap-3">
                                    <LayoutGrid className="w-8 h-8 text-slate-700" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-500">No activities in your lineup</p>
                                        <p className="text-[11px] text-slate-600 mt-1">Tap an alternative below to add it</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2.5">
                                    <AnimatePresence initial={false}>
                                        {currentSlots.selected.map((act, slotIdx) => (
                                            <motion.div
                                                key={act.name}
                                                initial={{ opacity: 0, scale: 0.92 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.88 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <DroppableSlot
                                                    activity={act}
                                                    dayNum={activeDay}
                                                    slotIdx={slotIdx}
                                                    onRemove={() => returnToPool(activeDay, slotIdx)}
                                                    meta={meta}
                                                    isDragActive={isDragActive}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>

                        {/* ── ALTERNATIVES POOL ──────────────────────────── */}
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2">
                                <p className="section-heading">Alternatives</p>
                                {currentSlots.pool.length > 0 && (
                                    <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                        <GripVertical className="w-3 h-3" />
                                        drag to swap · tap to add
                                    </span>
                                )}
                            </div>

                            {currentSlots.pool.length === 0 ? (
                                <p className="text-[11px] text-slate-600 py-1">
                                    All activities are in your lineup. Click × on any card to move it back here.
                                </p>
                            ) : (
                                <div className="flex gap-2.5 overflow-x-auto pb-2 hide-scrollbar -mx-1 px-1">
                                    <AnimatePresence initial={false}>
                                        {currentSlots.pool.map((act) => (
                                            <motion.div
                                                key={act.name}
                                                initial={{ opacity: 0, x: 12 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -8, scale: 0.9 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <DraggablePoolCard
                                                    activity={act}
                                                    dayNum={activeDay}
                                                    onAdd={() => addToLineup(activeDay, act.name)}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* Hotel selection */}
                <div className="space-y-3">
                    <p className="section-heading">Choose your stay</p>
                    <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                        {localResult.hotels.map((hotel, idx) => {
                            const isSelected = idx === selectedHotelIdx;
                            const stars = PRICE_STARS[hotel.priceRange] ?? 2;
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedHotelIdx(idx)}
                                    className={`flex-shrink-0 w-52 text-left bg-white/[0.04] border rounded-2xl p-3.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                                        isSelected
                                            ? "border-emerald-500/40 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
                                            : "border-white/[0.07] hover:border-white/[0.12]"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <span className="text-sm font-semibold text-white line-clamp-2 leading-tight">
                                            {hotel.name}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400 flex-shrink-0">
                                            {hotel.priceRange}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-2">{hotel.area}</p>
                                    <div className="flex items-center gap-1 mb-2">
                                        {Array.from({ length: stars }).map((_, i) => (
                                            <Star key={i} className={`w-3 h-3 ${isSelected ? "text-emerald-400" : "text-slate-600"} fill-current`} />
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {hotel.tags.slice(0, 2).map((tag) => (
                                            <span key={tag} className="text-[10px] text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-full px-1.5 py-0.5">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Decision gate */}
                <div className="space-y-3 pt-2">
                    <button
                        onClick={handleApprove}
                        className="btn-approve w-full py-4 rounded-2xl text-white flex items-center justify-center gap-2 transition-all duration-200"
                    >
                        <Sparkles className="w-4 h-4" />
                        Love this plan!
                    </button>

                    <button
                        onClick={() => setAdjustOpen((o) => !o)}
                        className="w-full py-3 rounded-2xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 font-semibold text-sm transition-all duration-200"
                    >
                        Find different activities
                    </button>

                    <AnimatePresence>
                        {adjustOpen && (
                            <motion.div
                                initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-2 pt-1">
                                    <textarea
                                        value={feedback}
                                        onChange={(e) => setFeedback(e.target.value)}
                                        placeholder="e.g. 'More outdoor activities', 'Skip museums', 'Better hotel area'"
                                        rows={3}
                                        className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-500 outline-none resize-none"
                                    />
                                    <button
                                        onClick={() => { onSubmitFeedback(feedback); setFeedback(""); setAdjustOpen(false); }}
                                        disabled={!feedback.trim() || isLoading}
                                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-white/[0.04] disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-200"
                                    >
                                        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Re-research
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
                ) : null}
            </AnimatePresence>

            {/* Floating ghost card that follows the cursor during drag */}
            <DragOverlay dropAnimation={null}>
                {activeGhostActivity && <DragGhostCard activity={activeGhostActivity} />}
            </DragOverlay>
        </DndContext>
    );
}
