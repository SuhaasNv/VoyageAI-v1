"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    motion,
    AnimatePresence,
    useReducedMotion,
} from "framer-motion";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    arrayMove,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Clock,
    MapPin,
    DollarSign,
    GripVertical,
    CheckCircle2,
    Sparkles,
    Loader2,
    AlertCircle,
    RefreshCw,
} from "lucide-react";
import { getCsrfToken } from "@/lib/api";
import type { TripDTO, ItineraryDay, ItineraryEvent } from "@/lib/services/trips";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineItineraryProps {
    trip: TripDTO;
    onRefresh?: () => void;
    onDayChange?: (day: number) => void;
    onActivityFocus?: (event: ItineraryEvent) => void;
    onEventsReorder?: (dayNumber: number, orderedIds: string[]) => void;
}

// ─── Motion Variants ─────────────────────────────────────────────────────────

const dayContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.15, when: "beforeChildren" },
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.18, ease: "easeIn" },
    },
};

const timelineLineVariants = {
    hidden: { scaleY: 0, opacity: 0 },
    visible: {
        scaleY: 1,
        opacity: 1,
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    },
};

const cardListVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            delayChildren: 0.2,
            staggerChildren: 0.18,
        },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventIconColor(type: string) {
    switch (type) {
        case "transit":
        case "transport": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
        case "accommodation": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
        case "dining":
        case "food": return "bg-amber-500/20 text-amber-500 border-amber-500/30";
        case "sightseeing":
        case "cultural": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
        case "adventure":
        case "entertainment": return "bg-pink-500/20 text-pink-400 border-pink-500/30";
        default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    }
}

// ─── Sortable Card ────────────────────────────────────────────────────────────

interface SortableCardProps {
    event: ItineraryEvent;
    index: number;
    isFirst: boolean;
    isMobile: boolean;
    onFocus?: (event: ItineraryEvent) => void;
}

function SortableCard({ event, index, isFirst, isMobile, onFocus }: SortableCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: event.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? "none" : transition ?? undefined,
        zIndex: isDragging ? 50 : undefined,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            variants={cardVariants}
            layout="position"
            layoutId={event.id}
            className="relative flex items-center gap-3 group"
            whileHover={isMobile ? undefined : { y: -2 }}
        >
            {/* Timeline node */}
            <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border shadow shrink-0 z-10 transition-transform duration-200 ${
                    isFirst
                        ? "bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-110"
                        : getEventIconColor(event.type)
                }`}
            >
                {isFirst ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>

            {/* Card */}
            <div
                onClick={() => !isDragging && onFocus?.(event)}
                className={`flex-1 p-4 rounded-2xl backdrop-blur-sm border transition-all duration-200 ease-out cursor-pointer ${
                    isFirst
                        ? "border-[#10B981]/20 bg-[#10B981]/5"
                        : "bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]"
                } ${isDragging ? "opacity-60 scale-[0.99] shadow-2xl border-white/20 bg-white/[0.06] cursor-grabbing" : ""}`}
            >
                <div className="flex items-center justify-between mb-2">
                    <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                            isFirst
                                ? "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20"
                                : "text-zinc-400 bg-white/5 border-white/5"
                        }`}
                    >
                        {event.time}
                    </span>
                    <div
                        {...attributes}
                        {...listeners}
                        className="touch-none p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <GripVertical className="w-4 h-4 text-zinc-500" />
                    </div>
                </div>

                <h4 className="text-base font-bold text-white mb-2 leading-tight">{event.title}</h4>

                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[140px]">{event.location}</span>
                    </div>
                    {event.cost > 0 && (
                        <div className="flex items-center gap-1 text-xs font-semibold text-slate-300 bg-white/[0.06] border border-white/[0.06] px-2 py-1 rounded-lg shrink-0 ml-2">
                            <DollarSign className="w-3 h-3 text-emerald-400" />
                            {event.cost}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Animated Day View ────────────────────────────────────────────────────────

interface DayViewProps {
    day: ItineraryDay;
    isMobile: boolean;
    onActivityFocus?: (event: ItineraryEvent) => void;
    onEventsReorder?: (dayNumber: number, orderedIds: string[]) => void;
}

function DayView({ day, isMobile, onActivityFocus, onEventsReorder }: DayViewProps) {
    const [events, setEvents] = useState<ItineraryEvent[]>(day.events);
    const eventsRef = useRef(events);
    eventsRef.current = events;

    useEffect(() => {
        setEvents(day.events);
    }, [day.events]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
    );

    const handleDragEnd = useCallback(
        (e: DragEndEvent) => {
            const { active, over } = e;
            if (!over || active.id === over.id) return;

            const prev = eventsRef.current;
            const oldIdx = prev.findIndex((ev) => ev.id === active.id);
            const newIdx = prev.findIndex((ev) => ev.id === over.id);
            const newOrder = arrayMove(prev, oldIdx, newIdx);

            setEvents(newOrder);
            onEventsReorder?.(day.day, newOrder.map((ev) => ev.id));
        },
        [day.day, onEventsReorder]
    );

    return (
        <motion.div
            key={day.day}
            variants={dayContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
        >
            {/* Day header */}
            <div className="mb-8 flex flex-col pt-2">
                <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white/80 to-white/40 tracking-tight leading-tight mb-3">
                    {day.title}
                </h2>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded-md border border-[#10B981]/20">
                        {events.length} activities
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
            </div>

            {/* Animated timeline column */}
            <div className="relative">
                {/* Vertical glow line */}
                <motion.div
                    className="absolute left-4 -translate-x-px top-0 w-px origin-top"
                    style={{
                        background: "linear-gradient(to bottom, rgba(16,185,129,0.35), rgba(255,255,255,0.04) 70%, transparent)",
                        height: "100%",
                    }}
                    variants={timelineLineVariants}
                    initial="hidden"
                    animate="visible"
                />

                {/* Subtle line glow overlay — GPU-safe, no filter */}
                {!isMobile && (
                    <motion.div
                        className="absolute left-4 -translate-x-[3px] top-0 w-[7px] origin-top pointer-events-none"
                        style={{
                            background: "linear-gradient(to bottom, rgba(16,185,129,0.12), transparent)",
                            height: "100%",
                        }}
                        variants={timelineLineVariants}
                        initial="hidden"
                        animate="visible"
                    />
                )}

                {/* Drag + staggered reveal */}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                        <motion.div
                            className="space-y-5 pl-11"
                            variants={cardListVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            {events.map((event, i) => (
                                <SortableCard
                                    key={event.id}
                                    event={event}
                                    index={i}
                                    isFirst={i === 0}
                                    isMobile={isMobile}
                                    onFocus={onActivityFocus}
                                />
                            ))}
                        </motion.div>
                    </SortableContext>
                </DndContext>
            </div>
        </motion.div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TimelineItinerary({ trip, onRefresh, onDayChange, onActivityFocus, onEventsReorder }: TimelineItineraryProps) {
    const [activeDay, setActiveDay] = useState(1);
    const [itinerary, setItinerary] = useState<ItineraryDay[]>(trip.itinerary);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genError, setGenError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const prefersReduced = useReducedMotion();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener("resize", check, { passive: true });
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        const next = trip.itinerary;
        setItinerary((prev) => {
            if (prev.length !== next.length) return next;
            if (prev[0]?.day !== next[0]?.day || prev[0]?.events?.length !== next[0]?.events?.length) return next;
            return prev;
        });
    }, [trip.id, trip.itinerary]);

    const handleDaySwitch = useCallback(
        (day: number) => {
            if (day === activeDay) return;
            setActiveDay(day);
            onDayChange?.(day);
            // Scroll content area back to top on day switch
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            });
        },
        [activeDay, onDayChange]
    );

    // ── Itinerary generation ──────────────────────────────────────────────────
    async function handleGenerate() {
        setIsGenerating(true);
        setGenError(null);
        try {
            const res = await fetch("/api/ai/itinerary", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": getCsrfToken(),
                },
                body: JSON.stringify({
                    tripId: trip.id,
                    destination: trip.destination,
                    startDate: trip.startDate,
                    endDate: trip.endDate,
                    budget: {
                        total: trip.budget.total > 0 ? trip.budget.total : 3000,
                        currency: trip.budget.currency || "USD",
                        flexibility: "flexible",
                    },
                }),
            });
            const json = await res.json();
            if (!json?.success) throw new Error(json?.error?.message ?? "Generation failed");

            if (onRefresh) {
                onRefresh();
            } else {
                const tripRes = await fetch(`/api/trips/${trip.id}`, { credentials: "include" });
                const tripJson = await tripRes.json();
                if (tripJson?.success && tripJson.data?.itinerary) {
                    setItinerary(tripJson.data.itinerary);
                }
            }
        } catch {
            setGenError("AI is busy, try again");
        } finally {
            setIsGenerating(false);
        }
    }

    // ── Empty state ───────────────────────────────────────────────────────────
    if (itinerary.length === 0) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-8 p-10 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-[#10B981]/5 pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none" />
                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-[#10B981]/20 border border-white/10 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.15)]">
                        {isGenerating
                            ? <Loader2 className="w-9 h-9 text-indigo-400 animate-spin" />
                            : <Sparkles className="w-9 h-9 text-indigo-400" />
                        }
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-xl font-bold text-white tracking-tight">No itinerary yet</h3>
                        <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
                            {isGenerating
                                ? "Generating your personalised itinerary…"
                                : "Generate one — AI will craft a day-by-day plan tailored to your trip."}
                        </p>
                    </div>

                    {genError && (
                        <div className="flex flex-col gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-3 max-w-xs">
                            <div className="flex items-center gap-2 text-amber-300">
                                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{genError}</span>
                            </div>
                            <button
                                onClick={() => { setGenError(null); handleGenerate(); }}
                                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 font-semibold hover:bg-amber-500/30 transition-colors"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Retry
                            </button>
                        </div>
                    )}

                    <div className="relative flex items-center justify-center">
                        <div
                            className="absolute w-56 h-14 rounded-full bg-indigo-500/[0.13] blur-2xl pointer-events-none"
                            style={{ animation: "voyage-glow-pulse 3.6s ease-in-out infinite" }}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="relative flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:bg-white/[0.06] disabled:text-zinc-500 text-white text-sm font-semibold transition-all duration-200 shadow-[0_0_24px_rgba(99,102,241,0.35)] hover:shadow-[0_0_32px_rgba(99,102,241,0.4)] disabled:shadow-none"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isGenerating ? "Generating…" : "Generate itinerary"}
                        </button>
                    </div>
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes voyage-glow-pulse {
                            0%, 100% { opacity: 0.6; transform: scale(1); }
                            50%       { opacity: 1;   transform: scale(1.08); }
                        }
                    ` }} />
                </div>
            </div>
        );
    }

    // ── Loaded state ──────────────────────────────────────────────────────────
    const currentActiveDay = itinerary.some((d) => d.day === activeDay)
        ? activeDay
        : itinerary[0].day;

    const activeDayData = itinerary.find((d) => d.day === currentActiveDay)!;

    return (
        <div className="flex flex-col h-full z-10">
            {/* Day selector */}
            <div className="flex-none p-4 overflow-x-auto border-b border-white/5 bg-[#0B0F14]/95 backdrop-blur-xl z-30 hide-scrollbar flex gap-2 items-center shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                {itinerary.map((day) => (
                    <button
                        key={day.day}
                        onClick={() => handleDaySwitch(day.day)}
                        className={`flex flex-col items-center min-w-[70px] px-3 py-2 rounded-xl transition-all duration-200 ease-out border ${
                            currentActiveDay === day.day
                                ? "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                                : "bg-white/[0.02] text-zinc-500 border-white/5 hover:text-white hover:bg-white/[0.04]"
                        }`}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-0.5 opacity-80">Day {day.day}</span>
                        <span className="text-sm font-semibold">{day.date.split("-")[2] ?? day.date}</span>
                    </button>
                ))}

                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    title="Regenerate itinerary"
                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] transition-all disabled:opacity-50 flex-shrink-0"
                >
                    {isGenerating
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                    {isGenerating ? "…" : "Regenerate"}
                </button>
            </div>

            {/* Generation error */}
            {genError && (
                <div className="mx-4 mt-3 flex flex-col gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-3">
                    <div className="flex items-center gap-2 text-amber-300">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{genError}</span>
                    </div>
                    <button
                        onClick={() => { setGenError(null); handleGenerate(); }}
                        className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-200 font-semibold hover:bg-amber-500/30 transition-colors"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {/* Events */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 scroll-smooth z-10 hide-scrollbar">
                <AnimatePresence mode="wait" initial={false}>
                    {prefersReduced ? (
                        <div key={currentActiveDay}>
                            <DayView
                                day={activeDayData}
                                isMobile={isMobile}
                                onActivityFocus={onActivityFocus}
                                onEventsReorder={onEventsReorder}
                            />
                        </div>
                    ) : (
                        <DayView
                            key={currentActiveDay}
                            day={activeDayData}
                            isMobile={isMobile}
                            onActivityFocus={onActivityFocus}
                            onEventsReorder={onEventsReorder}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
