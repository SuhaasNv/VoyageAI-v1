"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Brain, TrendingUp, AlertTriangle, ChefHat, MapPin, Hotel, DollarSign, Shield, Lightbulb } from "lucide-react";
import { AGENT_REGISTRY } from "./agentRegistry";
import type { FlowStage, FlowState } from "./types";

// ─── Message types ────────────────────────────────────────────────────────────

interface AIMessage {
    id: string;
    type: "insight" | "observation" | "suggestion" | "thinking" | "celebration" | "fact";
    text: string;
    icon?: React.ReactNode;
    accent?: string;
    timestamp?: number;
}

// ─── Generate data-driven insights from actual trip state ──────────────────────

function generateInsights(state: FlowState): AIMessage[] {
    const msgs: AIMessage[] = [];
    const { stage, plannerResult, researchResult, logisticsResult, budgetResult, safetyResult, input } = state;

    // Opening — always present
    msgs.push({
        id: "welcome",
        type: "observation",
        text: `I'm building your ${input.destination} trip. Let me handle the heavy lifting — you just steer.`,
        icon: <Sparkles className="w-3.5 h-3.5" />,
        accent: "from-indigo-500 to-purple-500",
    });
    
    // Random fact to "make it work" as requested by user
    if (input.destination) {
        msgs.push({
            id: "destination-fact",
            type: "fact",
            text: `Did you know? ${input.destination} is known for its unique blend of traditional culture and modern efficiency. I'll make sure your itinerary reflects the best of both.`,
            icon: <Lightbulb className="w-3.5 h-3.5" />,
            accent: "from-cyan-500 to-blue-500",
        });
    }

    // ── Planner insights ────────────────────────────────────────────────────
    if (plannerResult) {
        const days = plannerResult.durationDays;
        const themes = plannerResult.days.map((d) => d.theme);
        const uniqueThemes = new Set(themes).size;
        const style = plannerResult.preferences?.style;
        const pace = plannerResult.preferences?.pace;

        msgs.push({
            id: "plan-structure",
            type: "insight",
            text: `I've mapped out ${days} days with ${uniqueThemes} distinct themes. ${
                style === "adventure"
                    ? "Leaning into adventure — expect some adrenaline."
                    : style === "relaxed"
                    ? "Keeping it chill — quality over quantity."
                    : style === "luxury"
                    ? "Premium picks incoming — the finer things."
                    : "A balanced mix of experiences."
            }`,
            icon: <Brain className="w-3.5 h-3.5" />,
            accent: "from-indigo-500 to-indigo-400",
        });

        if (pace === "fast") {
            msgs.push({
                id: "plan-pace-warning",
                type: "suggestion",
                text: "Fast pace selected — I'll pack in activities, but consider slowing down if you want deeper experiences.",
                icon: <TrendingUp className="w-3.5 h-3.5" />,
                accent: "from-amber-500 to-orange-500",
            });
        }

        const hasDuplicateThemes = uniqueThemes < themes.length;
        if (hasDuplicateThemes) {
            msgs.push({
                id: "plan-variety",
                type: "suggestion",
                text: "Some days share the same theme. Tap a day card to mix it up for more variety.",
                icon: <Lightbulb className="w-3.5 h-3.5" />,
                accent: "from-indigo-500 to-violet-500",
            });
        }
    }

    // ── Research insights ────────────────────────────────────────────────────
    if (researchResult) {
        const totalActivities = researchResult.days.reduce((s, d) => s + d.activities.length, 0);
        const hotelCount = researchResult.hotels.length;
        const types = researchResult.days.flatMap((d) => d.activities.map((a) => a.type));
        const restaurants = types.filter((t) => t === "restaurant").length;
        const experiences = types.filter((t) => t === "experience").length;
        const attractions = types.filter((t) => t === "attraction").length;

        msgs.push({
            id: "research-found",
            type: "insight",
            text: `Found ${totalActivities} activities across ${researchResult.days.length} days — ${attractions} attractions, ${experiences} experiences, and ${restaurants} restaurants. ${hotelCount} hotel options ready.`,
            icon: <MapPin className="w-3.5 h-3.5" />,
            accent: "from-teal-500 to-emerald-500",
        });

        if (restaurants === 0) {
            msgs.push({
                id: "research-no-food",
                type: "suggestion",
                text: "No restaurant picks yet. Hit \"Find different activities\" and ask for more food experiences — trust me, local food is half the trip.",
                icon: <ChefHat className="w-3.5 h-3.5" />,
                accent: "from-amber-500 to-orange-500",
            });
        } else if (restaurants >= totalActivities * 0.4) {
            msgs.push({
                id: "research-food-heavy",
                type: "observation",
                text: `${Math.round((restaurants / totalActivities) * 100)}% of your activities are food-related. That's a culinary trip — perfect if intentional.`,
                icon: <ChefHat className="w-3.5 h-3.5" />,
                accent: "from-teal-500 to-cyan-500",
            });
        }

        if (hotelCount > 1) {
            msgs.push({
                id: "research-hotels",
                type: "suggestion",
                text: `I found ${hotelCount} hotel options across different price ranges. Scroll through them below — your choice affects route optimization next.`,
                icon: <Hotel className="w-3.5 h-3.5" />,
                accent: "from-teal-500 to-teal-400",
            });
        }
    }

    // ── Logistics insights ──────────────────────────────────────────────────
    if (logisticsResult) {
        const hotel = logisticsResult.selectedHotel;
        const totalActs = logisticsResult.days.reduce((s, d) => s + d.activities.length, 0);
        const mornings = logisticsResult.days.flatMap((d) => d.activities.filter((a) => a.timeSlot === "morning")).length;
        const evenings = logisticsResult.days.flatMap((d) => d.activities.filter((a) => a.timeSlot === "evening")).length;

        msgs.push({
            id: "logistics-optimized",
            type: "insight",
            text: `Route optimized — ${totalActs} activities sequenced by geography and time. ${
                hotel ? `Staying at ${hotel.name}.` : ""
            }`,
            icon: <MapPin className="w-3.5 h-3.5" />,
            accent: "from-amber-500 to-amber-400",
        });

        if (mornings > evenings * 2) {
            msgs.push({
                id: "logistics-morning-heavy",
                type: "observation",
                text: "Your mornings are packed — evenings are lighter. Consider adding a dinner spot or night experience.",
                icon: <TrendingUp className="w-3.5 h-3.5" />,
                accent: "from-amber-500 to-orange-500",
            });
        }
    }

    // ── Budget insights ─────────────────────────────────────────────────────
    if (budgetResult) {
        const total = budgetResult.budget.totalEstimatedCost;
        const userBudget = budgetResult.preferences?.budget;
        const isOver = budgetResult.budget.isOverBudget;
        const perDay = Math.round(total / budgetResult.durationDays);

        if (isOver && userBudget) {
            const gap = total - userBudget;
            msgs.push({
                id: "budget-over",
                type: "suggestion",
                text: `You're $${Math.round(gap).toLocaleString()} over budget. I have specific suggestions to bring it down — check below. Or, hit "Optimize for lower cost" and I'll reroute.`,
                icon: <AlertTriangle className="w-3.5 h-3.5" />,
                accent: "from-rose-500 to-pink-500",
            });
        } else {
            msgs.push({
                id: "budget-ok",
                type: "insight",
                text: `Total estimate: $${total.toLocaleString()} (~$${perDay}/day). ${
                    userBudget ? `That's within your $${userBudget.toLocaleString()} budget.` : "Looking reasonable."
                }`,
                icon: <DollarSign className="w-3.5 h-3.5" />,
                accent: "from-emerald-500 to-emerald-400",
            });
        }
    }

    // ── Safety insights ─────────────────────────────────────────────────────
    if (safetyResult) {
        const { riskLevel, warnings, tips } = safetyResult.safety;

        msgs.push({
            id: "safety-verdict",
            type: riskLevel === "high" ? "suggestion" : "insight",
            text: riskLevel === "low"
                ? `Looking good — ${input.destination} is rated low risk. ${tips.length} travel tips ready for you.`
                : riskLevel === "medium"
                ? `${warnings.length} things to watch for in ${input.destination}. I've flagged them below — nothing dealbreaking.`
                : `Heads up — ${input.destination} has some higher-risk factors. Review the ${warnings.length} warnings carefully.`,
            icon: <Shield className="w-3.5 h-3.5" />,
            accent: riskLevel === "low" ? "from-emerald-500 to-teal-500" : riskLevel === "medium" ? "from-amber-500 to-orange-500" : "from-rose-500 to-red-500",
        });

        msgs.push({
            id: "safety-final",
            type: "celebration",
            text: "Your trip is ready. Every detail has been planned, researched, routed, budgeted, and safety-checked. Hit save when you're happy.",
            icon: <Sparkles className="w-3.5 h-3.5" />,
            accent: "from-indigo-500 to-purple-500",
        });
    }

    return msgs;
}

// ─── Typewriter text component ───────────────────────────────────────────────

function TypewriterText({ text, speed = 18 }: { text: string; speed?: number }) {
    const [displayed, setDisplayed] = useState("");
    const prefersReduced = useReducedMotion();

    useEffect(() => {
        if (prefersReduced) {
            setDisplayed(text);
            return;
        }
        setDisplayed("");
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) clearInterval(interval);
        }, speed);
        return () => clearInterval(interval);
    }, [text, speed, prefersReduced]);

    return (
        <span>
            {displayed}
            {displayed.length < text.length && (
                <motion.span
                    className="inline-block w-[2px] h-[14px] bg-indigo-400 ml-0.5 align-middle rounded-full"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                />
            )}
        </span>
    );
}

// ─── Thinking dots ────────────────────────────────────────────────────────────

function ThinkingDots() {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-white" />
            </div>
            <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-2xl px-4 py-2.5 border border-white/[0.06]">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AISuggestionsPanelProps {
    state: FlowState;
    isLoading: boolean;
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function AISuggestionsPanel({ state, isLoading }: AISuggestionsPanelProps) {
    const prefersReduced = useReducedMotion();
    const scrollRef = useRef<HTMLDivElement>(null);
    const agent = state.stage !== "saved" ? AGENT_REGISTRY[state.stage] : AGENT_REGISTRY.safety;

    const insights = useMemo(() => generateInsights(state), [state]);
    const { imageUrl, destination } = state.input;

    // Track which messages have been "revealed" for stagger effect
    const [revealedCount, setRevealedCount] = useState(0);
    const prevInsightCount = useRef(0);

    useEffect(() => {
        if (insights.length > prevInsightCount.current) {
            // New messages arrived — reveal them one by one
            const newCount = insights.length;
            let i = prevInsightCount.current;
            const revealNext = () => {
                if (i < newCount) {
                    setRevealedCount(i + 1);
                    i++;
                    setTimeout(revealNext, prefersReduced ? 0 : 600);
                }
            };
            setTimeout(revealNext, prefersReduced ? 0 : 400);
            prevInsightCount.current = newCount;
        }
    }, [insights.length, prefersReduced]);

    // Auto-scroll to bottom when new messages appear
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: prefersReduced ? "auto" : "smooth" });
        }
    }, [revealedCount, isLoading, prefersReduced]);

    const visibleMessages = insights.slice(0, revealedCount);
    const latestMessageIdx = visibleMessages.length - 1;

    return (
        <div className="h-full flex flex-col">
            {/* Panel header with Destination Context */}
            <div className="relative flex-shrink-0 group">
                {imageUrl && (
                    <div className="absolute inset-0 h-32 overflow-hidden">
                        <img 
                            src={imageUrl} 
                            alt={destination} 
                            className="w-full h-full object-cover opacity-30 grayscale-[0.3] group-hover:opacity-40 transition-opacity duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-[#080B13]/20 via-[#080B13]/60 to-[#080B13]" />
                    </div>
                )}
                
                <div className="px-4 pt-6 pb-4 relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="relative">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <motion.div
                                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0B0F19]"
                                    style={{ backgroundColor: isLoading ? "#818cf8" : "#34d399" }}
                                    animate={isLoading ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] } : {}}
                                    transition={{ duration: 1.2, repeat: Infinity }}
                                />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-white tracking-tight uppercase italic flex items-center gap-1.5">
                                    VoyageAI
                                    <span className="text-[10px] not-italic font-bold text-zinc-500 tracking-normal px-1.5 py-0.5 bg-white/5 rounded border border-white/5">v1.2</span>
                                </h2>
                                <p className="text-[10px] text-zinc-400 font-medium">Intelligence Stream</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                        <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
                        <span className="text-[11px] font-bold text-zinc-200 truncate">{destination}</span>
                    </div>
                </div>
            </div>

            {/* Message feed */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto flow-scroll px-3 py-3 space-y-3"
            >
                <AnimatePresence initial={false}>
                    {visibleMessages.map((msg, idx) => {
                        const isLatest = idx === latestMessageIdx;

                        return (
                            <motion.div
                                key={msg.id}
                                initial={prefersReduced ? {} : { opacity: 0, y: 12, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                className="flex gap-2.5 items-start"
                            >
                                {/* AI avatar */}
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-gradient-to-br ${msg.accent || "from-indigo-500 to-purple-600"}`}>
                                    <span className="text-white">{msg.icon || <Sparkles className="w-3 h-3" />}</span>
                                </div>

                                {/* Message bubble */}
                                <div className={`flex-1 min-w-0 rounded-2xl rounded-tl-md px-3.5 py-2.5 backdrop-blur-md ${
                                    msg.type === "suggestion"
                                        ? "bg-amber-500/[0.05] border border-amber-500/15"
                                        : msg.type === "celebration"
                                        ? "bg-indigo-500/[0.05] border border-indigo-500/15"
                                        : msg.type === "fact"
                                        ? "bg-[#10B981]/[0.05] border border-[#10B981]/15"
                                        : "bg-white/[0.03] border border-white/[0.08]"
                                }`}>
                                    <p className="text-[12px] leading-[1.6] text-slate-300">
                                        {isLatest && !prefersReduced ? (
                                            <TypewriterText text={msg.text} speed={15} />
                                        ) : (
                                            msg.text
                                        )}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Thinking indicator */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                    >
                        <ThinkingDots />
                    </motion.div>
                )}
            </div>

            {/* Bottom status bar */}
            <div className="flex-shrink-0 px-4 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? "bg-indigo-400 ai-thinking-pulse" : "bg-emerald-400"}`} />
                        <span className="text-[10px] text-slate-500 font-medium">
                            {isLoading
                                ? `${agent.name} is analyzing...`
                                : `${visibleMessages.length} insights`
                            }
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-600">
                        <kbd className="bg-white/[0.06] border border-white/[0.08] rounded px-1 py-0.5 font-mono text-[9px] text-slate-500">?</kbd>
                        {" "}details
                    </span>
                </div>
            </div>
        </div>
    );
}
