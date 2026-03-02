"use client";

import { useState } from "react";
import {
    ArrowLeftRight,
    Loader2,
    Trophy,
    Minus,
    MapPin,
    DollarSign,
    Calendar,
    Sparkles,
    RotateCcw,
} from "lucide-react";
import { getCsrfToken } from "@/lib/api";
import type { ComparisonResult, TripComparisonSide } from "@/lib/ai/compareTrips";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function plusDaysStr(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function fmt(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

// Score bar — renders a thin progress bar with a colour based on value.
function ScoreBar({ value }: { value: number }) {
    const colour =
        value >= 80 ? "bg-emerald-400" :
        value >= 60 ? "bg-amber-400"   :
                      "bg-rose-400";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${colour}`}
                    style={{ width: `${value}%` }}
                />
            </div>
            <span className="text-xs font-semibold tabular-nums w-7 text-right">{value}</span>
        </div>
    );
}

// Highlights the winning cell; returns the appropriate CSS class.
function cellClass(aVal: number, bVal: number, side: "a" | "b") {
    const winner = aVal > bVal ? "a" : bVal > aVal ? "b" : "tie";
    if (winner === "tie") return "text-white/60";
    return winner === side
        ? "text-emerald-400 font-semibold"
        : "text-white/40";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreCard({ side, label }: { side: TripComparisonSide; label: string }) {
    const { score, breakdown } = side.score;
    const colour =
        score >= 80 ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"  :
        score >= 60 ? "border-amber-500/25  bg-amber-500/5  text-amber-300"   :
                      "border-rose-500/25   bg-rose-500/5   text-rose-300";

    return (
        <div className={`flex-1 rounded-2xl border p-4 ${colour}`}>
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">{label}</span>
                <span className="text-3xl font-black tabular-nums">{score}</span>
            </div>
            <p className="text-sm font-semibold truncate mb-3">{side.destination}</p>
            <div className="space-y-1.5">
                {(
                    [
                        ["Density",   breakdown.density],
                        ["Distance",  breakdown.distance],
                        ["Budget",    breakdown.budget],
                        ["Diversity", breakdown.diversity],
                    ] as [string, number][]
                ).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                        <span className="text-[10px] w-14 opacity-50">{k}</span>
                        <ScoreBar value={v} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Comparison table row ─────────────────────────────────────────────────────

interface RowProps {
    label:    string;
    a:        React.ReactNode;
    b:        React.ReactNode;
    border?:  boolean;
}

function Row({ label, a, b, border = true }: RowProps) {
    return (
        <div className={`grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2.5 ${border ? "border-b border-white/[0.04]" : ""}`}>
            <span className="text-xs text-white/35 self-center">{label}</span>
            <div className="text-sm self-center">{a}</div>
            <div className="text-sm self-center">{b}</div>
        </div>
    );
}

function SectionHeader({ label }: { label: string }) {
    return (
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-1.5 bg-white/[0.025] border-b border-white/[0.06]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/25 col-span-3">{label}</span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComparePage() {
    // Form state
    const [destA,     setDestA]     = useState("");
    const [destB,     setDestB]     = useState("");
    const [startDate, setStartDate] = useState(todayStr());
    const [endDate,   setEndDate]   = useState(plusDaysStr(6));
    const [budget,    setBudget]    = useState("2500");
    const [currency,  setCurrency]  = useState("USD");

    // Async state
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState<string | null>(null);
    const [result,    setResult]    = useState<ComparisonResult | null>(null);

    async function handleCompare(e: React.FormEvent) {
        e.preventDefault();
        if (!destA.trim() || !destB.trim() || loading) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const csrf = await getCsrfToken();
            const res  = await fetch("/api/ai/compare", {
                method:      "POST",
                credentials: "include",
                headers: {
                    "Content-Type":  "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                body: JSON.stringify({
                    destinationA: destA.trim(),
                    destinationB: destB.trim(),
                    startDate,
                    endDate,
                    budget:   Number(budget),
                    currency: currency.toUpperCase(),
                }),
            });

            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? "Comparison failed.");
            setResult(json.data as ComparisonResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    const r = result;

    // Derived
    const totalActivitiesA = r ? r.a.itinerary.days.reduce((s, d) => s + d.activities.length, 0) : 0;
    const totalActivitiesB = r ? r.b.itinerary.days.reduce((s, d) => s + d.activities.length, 0) : 0;
    const avgPerDayA = r ? (totalActivitiesA / r.a.itinerary.totalDays) : 0;
    const avgPerDayB = r ? (totalActivitiesB / r.b.itinerary.totalDays) : 0;
    const day1A = r ? (r.a.itinerary.days[0]?.activities ?? []).slice(0, 3) : [];
    const day1B = r ? (r.b.itinerary.days[0]?.activities ?? []).slice(0, 3) : [];

    return (
        <div className="h-full overflow-y-auto hide-scrollbar bg-[#0B0F14] text-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

                {/* Header */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
                        <h1 className="text-2xl font-black tracking-tight">Trip Comparison</h1>
                    </div>
                    <p className="text-sm text-white/35">
                        Generate and score two itineraries side by side — no account data written.
                    </p>
                </div>

                {/* Form */}
                <form
                    onSubmit={handleCompare}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-4"
                >
                    {/* Destinations */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Destination A</span>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400/70 pointer-events-none" />
                                <input
                                    type="text"
                                    value={destA}
                                    onChange={e => setDestA(e.target.value)}
                                    placeholder="e.g. Tokyo, Japan"
                                    required
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500/50 transition-colors"
                                />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Destination B</span>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-400/70 pointer-events-none" />
                                <input
                                    type="text"
                                    value={destB}
                                    onChange={e => setDestB(e.target.value)}
                                    placeholder="e.g. Paris, France"
                                    required
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50 transition-colors"
                                />
                            </div>
                        </label>
                    </div>

                    {/* Shared params */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Start</span>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    required
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
                                />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">End</span>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    required
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors [color-scheme:dark]"
                                />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Budget</span>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400/70 pointer-events-none" />
                                <input
                                    type="number"
                                    value={budget}
                                    onChange={e => setBudget(e.target.value)}
                                    min={100}
                                    required
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-2 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                                />
                            </div>
                        </label>

                        <label className="space-y-1.5">
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Currency</span>
                            <select
                                value={currency}
                                onChange={e => setCurrency(e.target.value)}
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none"
                            >
                                {["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "INR", "SGD"].map(c => (
                                    <option key={c} value={c} className="bg-[#0E1318]">{c}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {error && (
                        <p className="text-xs text-rose-400 px-1">{error}</p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={loading || !destA.trim() || !destB.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                        >
                            {loading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <ArrowLeftRight className="w-4 h-4" />}
                            {loading ? "Generating…" : "Compare"}
                        </button>

                        {result && !loading && (
                            <button
                                type="button"
                                onClick={() => { setResult(null); setError(null); }}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 text-sm font-medium transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reset
                            </button>
                        )}
                    </div>
                </form>

                {/* Loading skeleton */}
                {loading && (
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 flex flex-col items-center gap-4 text-center">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                            </div>
                            <Loader2 className="absolute -top-1 -right-1 w-5 h-5 text-indigo-400 animate-spin" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Generating both itineraries…</p>
                            <p className="text-xs text-white/35">
                                Running <span className="text-indigo-300">{destA}</span> and{" "}
                                <span className="text-purple-300">{destB}</span> in parallel. This takes ~20–30 s.
                            </p>
                        </div>
                        {/* Skeleton rows */}
                        <div className="w-full max-w-md space-y-2 mt-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-2.5 rounded-full bg-white/[0.06] animate-pulse" style={{ width: `${70 + (i % 3) * 10}%`, animationDelay: `${i * 0.12}s` }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Results */}
                {r && !loading && (
                    <div className="space-y-5">

                        {/* Winner banner */}
                        {r.winner === "tie" ? (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/60 text-sm">
                                <Minus className="w-4 h-4 shrink-0" />
                                <span>Both destinations scored within 2 points — it&apos;s a tie.</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-sm">
                                <Trophy className="w-4 h-4 shrink-0" />
                                <span>
                                    <strong>{r.winner === "a" ? r.a.destination : r.b.destination}</strong> wins with a higher Travel Intelligence Score.
                                </span>
                                <span className="ml-auto font-bold tabular-nums text-base">
                                    {r.winner === "a" ? r.a.score.score : r.b.score.score} / 100
                                </span>
                            </div>
                        )}

                        {/* Score cards */}
                        <div className="flex gap-4">
                            <ScoreCard side={r.a} label="Option A" />
                            <ScoreCard side={r.b} label="Option B" />
                        </div>

                        {/* Comparison table */}
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">

                            {/* Table header */}
                            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-white/[0.08] bg-white/[0.03]">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">Metric</span>
                                <span className="text-xs font-bold text-indigo-400 truncate">{r.a.destination}</span>
                                <span className="text-xs font-bold text-purple-400 truncate">{r.b.destination}</span>
                            </div>

                            {/* Overview */}
                            <SectionHeader label="Overview" />

                            <Row
                                label="Estimated Cost"
                                a={<span className={cellClass(
                                        r.b.itinerary.totalEstimatedCost.amount,  // lower cost wins
                                        r.a.itinerary.totalEstimatedCost.amount,
                                        "a"
                                    )}>
                                    {fmt(r.a.itinerary.totalEstimatedCost.amount, r.a.itinerary.totalEstimatedCost.currency)}
                                </span>}
                                b={<span className={cellClass(
                                        r.a.itinerary.totalEstimatedCost.amount,
                                        r.b.itinerary.totalEstimatedCost.amount,
                                        "b"
                                    )}>
                                    {fmt(r.b.itinerary.totalEstimatedCost.amount, r.b.itinerary.totalEstimatedCost.currency)}
                                </span>}
                            />

                            <Row
                                label="Total Days"
                                a={<span className="text-white/60">{r.a.itinerary.totalDays}</span>}
                                b={<span className="text-white/60">{r.b.itinerary.totalDays}</span>}
                            />

                            <Row
                                label="Total Activities"
                                a={<span className={cellClass(totalActivitiesA, totalActivitiesB, "a")}>{totalActivitiesA}</span>}
                                b={<span className={cellClass(totalActivitiesA, totalActivitiesB, "b")}>{totalActivitiesB}</span>}
                            />

                            <Row
                                label="Avg / Day"
                                a={<span className={cellClass(avgPerDayA, avgPerDayB, "a")}>{avgPerDayA.toFixed(1)}</span>}
                                b={<span className={cellClass(avgPerDayA, avgPerDayB, "b")}>{avgPerDayB.toFixed(1)}</span>}
                            />

                            <Row
                                label="Pacing Score"
                                a={<span className={cellClass(
                                        r.a.itinerary.pacingAnalysis.overallScore,
                                        r.b.itinerary.pacingAnalysis.overallScore,
                                        "a"
                                    )}>
                                    {r.a.itinerary.pacingAnalysis.overallScore.toFixed(1)} / 10
                                </span>}
                                b={<span className={cellClass(
                                        r.a.itinerary.pacingAnalysis.overallScore,
                                        r.b.itinerary.pacingAnalysis.overallScore,
                                        "b"
                                    )}>
                                    {r.b.itinerary.pacingAnalysis.overallScore.toFixed(1)} / 10
                                </span>}
                            />

                            {/* Score breakdown */}
                            <SectionHeader label="Intelligence Score Breakdown" />

                            {(
                                [
                                    ["Density",   "density"],
                                    ["Distance",  "distance"],
                                    ["Budget",    "budget"],
                                    ["Diversity", "diversity"],
                                ] as [string, keyof typeof r.a.score.breakdown][]
                            ).map(([label, key], idx, arr) => (
                                <Row
                                    key={key}
                                    label={label}
                                    border={idx < arr.length - 1}
                                    a={<ScoreBar value={r.a.score.breakdown[key]} />}
                                    b={<ScoreBar value={r.b.score.breakdown[key]} />}
                                />
                            ))}

                            {/* Day 1 highlights */}
                            <SectionHeader label="Day 1 Highlights" />

                            <Row
                                label="Top activities"
                                border={false}
                                a={
                                    <ul className="space-y-0.5">
                                        {day1A.map(act => (
                                            <li key={act.id} className="text-xs text-white/50 truncate">· {act.name}</li>
                                        ))}
                                        {day1A.length === 0 && <li className="text-xs text-white/20">—</li>}
                                    </ul>
                                }
                                b={
                                    <ul className="space-y-0.5">
                                        {day1B.map(act => (
                                            <li key={act.id} className="text-xs text-white/50 truncate">· {act.name}</li>
                                        ))}
                                        {day1B.length === 0 && <li className="text-xs text-white/20">—</li>}
                                    </ul>
                                }
                            />
                        </div>

                        {/* AI Insights */}
                        {(r.a.itinerary.aiInsights.length > 0 || r.b.itinerary.aiInsights.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {([["a", r.a, "indigo"] as const, ["b", r.b, "purple"] as const]).map(([key, side, colour]) => (
                                    <div
                                        key={key}
                                        className={`rounded-2xl border p-4 space-y-2 ${
                                            colour === "indigo"
                                                ? "border-indigo-500/15 bg-indigo-500/4"
                                                : "border-purple-500/15 bg-purple-500/4"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Sparkles className={`w-3.5 h-3.5 ${colour === "indigo" ? "text-indigo-400" : "text-purple-400"}`} />
                                            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                                                {side.destination} — AI Insights
                                            </span>
                                        </div>
                                        <ul className="space-y-1">
                                            {side.itinerary.aiInsights.slice(0, 3).map((insight, i) => (
                                                <li key={i} className="text-xs text-white/45 leading-relaxed">· {insight}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer */}
                        <p className="text-[11px] text-white/20 text-right">
                            Generated {new Date(r.generatedAt).toLocaleString()} · scores are AI-estimated
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
