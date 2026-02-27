"use client";

import { useState, useEffect } from "react";
import { Brain, Lightbulb, CalendarDays, Wallet, PlusCircle, Dna } from "lucide-react";
import type { Trip } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DNAPreference {
    budget?: string;
    style?: string;
    pace?: string;
    interests?: string[];
    regions?: string[];
}

interface TripIntelligencePanelProps {
    trips: Trip[];
    isLoading?: boolean;
}

// ─── Pure helpers (no AI, no external calls) ─────────────────────────────────

function getDaysUntil(startDate: string): number {
    const [y, m, d] = startDate.split("-").map(Number);
    const start = Date.UTC(y, m - 1, d);
    const today = new Date();
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.round((start - now) / 86_400_000));
}

function getTripDuration(startDate: string, endDate: string): number {
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const start = Date.UTC(sy, sm - 1, sd);
    const end = Date.UTC(ey, em - 1, ed);
    return Math.round((end - start) / 86_400_000);
}

function formatShortDate(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[m - 1]} ${d}, ${y}`;
}

function computeRecommendation(trip: Trip, dna: DNAPreference | null): string {
    const days = getDaysUntil(trip.startDate);
    const util = trip.budget.total > 0
        ? (trip.budget.spent / trip.budget.total) * 100
        : 0;

    // Time-based (highest priority)
    if (days === 0) return "Your trip starts today — bon voyage!";
    if (days === 1) return "Departing tomorrow — double-check passport and documents.";
    if (days <= 3)  return "Almost there! Confirm all bookings and charge your devices.";
    if (days <= 7)  return "One week out — finalize packing and review your itinerary.";
    if (days <= 14) return "Two weeks away — look into local transport and SIM options.";

    // Budget-based
    if (util > 90) return `Budget ${Math.round(util)}% used — review remaining spend.`;
    if (util > 75) return "Track daily spend closely to stay within budget.";

    // DNA-based fallback
    if (!dna) return "Review your itinerary and confirm any pre-bookings.";

    const style     = String(dna.style    ?? "").toLowerCase();
    const pace      = String(dna.pace     ?? "").toLowerCase();
    const interests = (dna.interests ?? []).map(i => i.toLowerCase());

    if (style.includes("adventure") || style.includes("outdoor"))
        return "Secure travel insurance covering adventure activities before departure.";
    if (style.includes("relax") || style.includes("wellness"))
        return "Pre-book wellness treatments — popular spots fill up fast.";
    if (style.includes("food") || style.includes("drink"))
        return "Research top local dining spots and make reservations in advance.";
    if (style.includes("culture") || style.includes("history"))
        return "Check opening hours for key sites — some require advance tickets.";
    if (style.includes("nightlife"))
        return "Scout rooftop bars and live music venues before you arrive.";
    if (pace.includes("slow") || pace.includes("relax"))
        return "Keep afternoons unplanned — the best moments often aren't on itineraries.";
    if (pace.includes("fast") || pace.includes("packed"))
        return "Build in one rest half-day per 4 days to avoid travel fatigue.";
    if (interests.includes("beaches"))
        return "Check seasonal weather and pack reef-safe sunscreen for beach days.";
    if (interests.includes("mountains"))
        return "Book treks or mountain transport in advance during peak season.";

    return "Review your itinerary and confirm any pre-bookings before departure.";
}

function getDaysBadgeStyle(days: number): string {
    if (days === 0) return "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30";
    if (days <= 3)  return "bg-amber-500/15 text-amber-400 border border-amber-500/25";
    if (days <= 14) return "bg-indigo-500/15 text-indigo-400 border border-indigo-500/25";
    return "bg-white/5 text-zinc-400 border border-white/10";
}

function getDaysBadgeLabel(days: number): string {
    if (days === 0) return "Active now";
    if (days === 1) return "Tomorrow";
    return `${days} days`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }: {
    label: string;
    value: string;
    sub?: string;
    accent?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors">
            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{label}</span>
            <span className={`text-base font-black tracking-tight ${accent ? "text-[#10B981]" : "text-white"}`}>
                {value}
            </span>
            {sub && <span className="text-[11px] text-zinc-600 font-medium">{sub}</span>}
        </div>
    );
}

function BudgetBar({ util }: { util: number }) {
    const pct = Math.min(100, Math.round(util));
    const danger = pct > 85;
    return (
        <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors">
            <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Budget used</span>
                <span className={`text-xs font-bold ${danger ? "text-rose-400" : "text-[#10B981]"}`}>{pct}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${danger
                        ? "bg-gradient-to-r from-rose-500 to-rose-400"
                        : "bg-gradient-to-r from-[#34D399] to-[#10B981]"
                    }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-[11px] text-zinc-600 font-medium">
                {pct === 0 ? "No spend recorded" : `${pct}% of budget allocated`}
            </span>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TripIntelligencePanel({ trips, isLoading = false }: TripIntelligencePanelProps) {
    const [dna, setDna] = useState<DNAPreference | null>(null);
    const [dnaLoaded, setDnaLoaded] = useState(false);

    useEffect(() => {
        fetch("/api/preferences")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data?.preference?.data) {
                    setDna(data.data.preference.data as DNAPreference);
                }
            })
            .catch(() => {})
            .finally(() => setDnaLoaded(true));
    }, []);

    // Next upcoming or active trip
    const nextTrip = [...trips]
        .filter(t => t.status !== "past")
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

    const hasTrips = !!nextTrip;

    // Derived values (safe to compute even before dnaLoaded)
    const daysUntil   = nextTrip ? getDaysUntil(nextTrip.startDate) : 0;
    const duration    = nextTrip ? getTripDuration(nextTrip.startDate, nextTrip.endDate) : 0;
    const budgetUtil  = nextTrip && nextTrip.budget.total > 0
        ? (nextTrip.budget.spent / nextTrip.budget.total) * 100
        : 0;
    const recommendation = nextTrip && dnaLoaded
        ? computeRecommendation(nextTrip, dna)
        : null;

    return (
        <div className="w-full bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 shadow-2xl transition-all hover:border-white/10 relative overflow-hidden">
            {/* Subtle ambient glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#10B981] rounded-full blur-[120px] opacity-[0.04] pointer-events-none" />

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-[#10B981]" />
                    Trip Intelligence
                </h2>
                {!isLoading && hasTrips && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${getDaysBadgeStyle(daysUntil)}`}>
                        {getDaysBadgeLabel(daysUntil)}
                    </span>
                )}
                {!isLoading && !hasTrips && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/5 text-zinc-500 border border-white/10">
                        No trips yet
                    </span>
                )}
            </div>

            {/* ── Loading state (trips still fetching) ───────────────────────── */}
            {isLoading && (
                <div className="flex flex-col gap-4 py-4">
                    <div className="h-8 w-2/3 rounded-xl bg-white/[0.04]" />
                    <div className="grid grid-cols-2 gap-3">
                        <div className="h-16 rounded-2xl bg-white/[0.03]" />
                        <div className="h-16 rounded-2xl bg-white/[0.03]" />
                    </div>
                    <div className="h-10 rounded-xl bg-white/[0.02]" />
                </div>
            )}

            {/* ── Active / upcoming trip view ─────────────────────────────────── */}
            {!isLoading && hasTrips && (
                <div className="flex flex-col gap-4">
                    {/* Destination */}
                    <div>
                        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1">
                            Next destination
                        </p>
                        <h3 className="text-2xl font-black text-white tracking-tight leading-tight">
                            {nextTrip!.destination}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium mt-0.5">
                            {formatShortDate(nextTrip!.startDate)} &mdash; {formatShortDate(nextTrip!.endDate)}
                        </p>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-3">
                        <BudgetBar util={budgetUtil} />
                        <StatTile
                            label="Duration"
                            value={`${duration} nights`}
                            sub={nextTrip!.budget.total > 0
                                ? `$${nextTrip!.budget.total.toLocaleString()} budget`
                                : "Budget not set"}
                            accent
                        />
                    </div>

                    {/* Recommendation */}
                    {recommendation && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-[#10B981]/[0.06] border border-[#10B981]/[0.12]">
                            <Lightbulb className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />
                            <p className="text-xs text-zinc-300 font-medium leading-relaxed">
                                {recommendation}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* ── No trips view ───────────────────────────────────────────────── */}
            {!isLoading && !hasTrips && (
                <div className="flex flex-col gap-5">
                    {dna ? (
                        <>
                            {/* DNA summary */}
                            <div className="flex items-center gap-2 mb-1">
                                <Dna className="w-4 h-4 text-[#10B981]" />
                                <span className="text-sm font-semibold text-zinc-300">Your Travel DNA</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {dna.budget && (
                                    <StatTile label="Budget" value={dna.budget} />
                                )}
                                {dna.style && (
                                    <StatTile label="Style" value={dna.style} />
                                )}
                                {dna.pace && (
                                    <StatTile label="Pace" value={dna.pace} />
                                )}
                                {(dna.interests?.length ?? 0) > 0 && (
                                    <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Interests</span>
                                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                                            {(dna.interests ?? []).slice(0, 4).map(interest => (
                                                <span
                                                    key={interest}
                                                    className="text-[10px] font-semibold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 rounded-full"
                                                >
                                                    {interest}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-[#10B981]/20 transition-colors cursor-pointer group">
                                <PlusCircle className="w-4 h-4 text-[#10B981] shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-white group-hover:text-[#10B981] transition-colors">
                                        Create your first trip
                                    </p>
                                    <p className="text-[11px] text-zinc-600 font-medium">
                                        Personalised recommendations are ready.
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* No DNA + No trips */}
                            <div className="flex flex-col gap-3 py-2">
                                <p className="text-sm text-zinc-400 font-medium">
                                    Set up your Travel DNA for personalised trip recommendations and insights.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#10B981]/[0.06] border border-[#10B981]/[0.12] hover:border-[#10B981]/25 transition-colors cursor-pointer group">
                                        <Dna className="w-4 h-4 text-[#10B981] shrink-0" />
                                        <span className="text-xs font-bold text-[#10B981]">Set up DNA</span>
                                    </div>
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors cursor-pointer group">
                                        <PlusCircle className="w-4 h-4 text-zinc-400 shrink-0" />
                                        <span className="text-xs font-bold text-zinc-300">New trip</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Departure countdown strip — only when close */}
            {!isLoading && hasTrips && daysUntil <= 7 && daysUntil > 0 && (
                <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                        Departure countdown
                    </span>
                    <span className="text-[#10B981] font-black text-lg tracking-tight leading-none">
                        {daysUntil} <span className="text-xs font-semibold text-zinc-400">day{daysUntil !== 1 ? "s" : ""} remaining</span>
                    </span>
                </div>
            )}
        </div>
    );
}
