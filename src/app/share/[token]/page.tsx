/**
 * /share/[token] — Public, auth-free trip share page.
 *
 * Looks up the trip by shareToken and renders a branded read-only view.
 * If the token is invalid or has been revoked → 404-style message.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseStoredItinerary } from "@/lib/services/trips";
import { ItinerarySchema, type Itinerary } from "@/lib/ai/schemas";
import { MapPin, Calendar, Wallet, Plane, Sparkles, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
    { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
    const { token } = await params;
    const trip = await prisma.trip.findUnique({ where: { shareToken: token } });
    if (!trip) return { title: "VoyageAI — Shared Trip" };
    return {
        title: `${trip.destination} — VoyageAI`,
        description: `AI-crafted itinerary for ${trip.destination}. Explore the day-by-day plan.`,
        openGraph: {
            title: `${trip.destination} Travel Plan`,
            description: `Explore this AI-crafted trip to ${trip.destination}`,
            images: trip.imageUrl ? [{ url: trip.imageUrl }] : [],
        },
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(d: Date): string {
    return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function nightsLabel(start: Date, end: Date): string {
    const n = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    return `${n} night${n !== 1 ? "s" : ""}`;
}

function budgetTier(total: number, currency: string): string {
    const usd = currency === "USD" ? total : total * 0.012; // rough conversion
    if (usd <= 1000) return "Budget-friendly";
    if (usd <= 3000) return "Mid-range";
    return "Premium";
}

const ACTIVITY_COLOURS: Record<string, string> = {
    sightseeing:    "bg-sky-500/15 text-sky-300 border-sky-500/20",
    dining:         "bg-orange-500/15 text-orange-300 border-orange-500/20",
    adventure:      "bg-rose-500/15 text-rose-300 border-rose-500/20",
    cultural:       "bg-violet-500/15 text-violet-300 border-violet-500/20",
    shopping:       "bg-pink-500/15 text-pink-300 border-pink-500/20",
    relaxation:     "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
    transport:      "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
    accommodation:  "bg-amber-500/15 text-amber-300 border-amber-500/20",
};

function actColour(type: string): string {
    return ACTIVITY_COLOURS[type] ?? "bg-white/5 text-white/50 border-white/10";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharePage(
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    const dbTrip = await prisma.trip.findUnique({ where: { shareToken: token } });
    if (!dbTrip) notFound();

    const itineraryRow = await prisma.itinerary.findFirst({
        where: { tripId: dbTrip.id },
        orderBy: { createdAt: "desc" },
    });

    const itinerary: Itinerary | null = (() => {
        if (!itineraryRow?.rawJson) return null;
        const p = ItinerarySchema.safeParse(itineraryRow.rawJson);
        return p.success ? p.data : null;
    })();

    const uiItinerary = itineraryRow ? parseStoredItinerary(itineraryRow) : [];

    const nights  = nightsLabel(dbTrip.startDate, dbTrip.endDate);
    const tier    = budgetTier(dbTrip.budgetTotal, dbTrip.budgetCurrency);
    const totalActivities = itinerary?.days.reduce((s, d) => s + d.activities.length, 0) ?? 0;

    return (
        <div className="min-h-screen bg-[#0B0F14] text-white">

            {/* ── Nav bar ─────────────────────────────────────────────── */}
            <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0B0F14]/80 backdrop-blur-lg px-6 py-3 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#10B981] flex items-center justify-center">
                        <Plane className="w-4 h-4 text-black" />
                    </div>
                    <span className="font-bold text-white tracking-tight">VoyageAI</span>
                </Link>
                <Link
                    href="/login"
                    className="text-xs font-semibold text-white/60 hover:text-white transition-colors flex items-center gap-1"
                >
                    Plan your own trip <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </nav>

            {/* ── Hero ────────────────────────────────────────────────── */}
            <div className="relative h-72 md:h-96 overflow-hidden">
                {dbTrip.imageUrl ? (
                    <Image
                        src={dbTrip.imageUrl}
                        alt={dbTrip.destination}
                        fill
                        className="object-cover"
                        priority
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-slate-900 to-violet-900/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14] via-[#0B0F14]/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-6 pb-8">
                    <div className="max-w-3xl mx-auto">
                        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 mb-2">
                            <Sparkles className="w-3 h-3" />
                            AI-Crafted Itinerary
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none">
                            {dbTrip.destination}
                        </h1>
                    </div>
                </div>
            </div>

            {/* ── Trip meta bar ───────────────────────────────────────── */}
            <div className="border-b border-white/[0.06] px-6 py-4">
                <div className="max-w-3xl mx-auto flex flex-wrap gap-4 text-sm text-white/60">
                    <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-white/30" />
                        {fmtDate(dbTrip.startDate)} – {fmtDate(dbTrip.endDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-white/30" />
                        {nights}
                    </span>
                    {dbTrip.budgetTotal > 0 && (
                        <span className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-white/30" />
                            {tier}
                        </span>
                    )}
                    {totalActivities > 0 && (
                        <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-white/30" />
                            {totalActivities} activities
                        </span>
                    )}
                </div>
            </div>

            {/* ── Itinerary days ──────────────────────────────────────── */}
            <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
                {itinerary ? (
                    itinerary.days.map((day) => (
                        <div key={day.day} className="space-y-3">
                            {/* Day header */}
                            <div className="flex items-baseline gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#10B981]/15 border border-[#10B981]/25 text-[#10B981] text-xs font-black shrink-0">
                                    {day.day}
                                </div>
                                <div>
                                    <p className="font-semibold text-white leading-tight">{day.theme}</p>
                                    <p className="text-xs text-white/30">{day.date}</p>
                                </div>
                            </div>

                            {/* Activities */}
                            <div className="ml-11 space-y-2">
                                {day.activities.slice(0, 4).map((act) => (
                                    <div
                                        key={act.id}
                                        className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors"
                                    >
                                        <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize shrink-0 ${actColour(act.type)}`}>
                                            {act.type}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white/85 leading-tight truncate">{act.name}</p>
                                            <p className="text-xs text-white/35 mt-0.5">{act.location.name}</p>
                                        </div>
                                        <span className="text-xs text-white/30 shrink-0 tabular-nums">{act.startTime}</span>
                                    </div>
                                ))}
                                {day.activities.length > 4 && (
                                    <p className="text-xs text-white/25 pl-2">
                                        +{day.activities.length - 4} more activities
                                    </p>
                                )}
                            </div>
                        </div>
                    ))
                ) : uiItinerary.length > 0 ? (
                    uiItinerary.map((day) => (
                        <div key={day.day} className="space-y-3">
                            <div className="flex items-baseline gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#10B981]/15 border border-[#10B981]/25 text-[#10B981] text-xs font-black shrink-0">
                                    {day.day}
                                </div>
                                <p className="font-semibold text-white">{day.title}</p>
                            </div>
                            <div className="ml-11 space-y-1.5">
                                {day.events.slice(0, 4).map((ev) => (
                                    <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                        <span className="text-xs text-white/30 tabular-nums w-10 shrink-0">{ev.time}</span>
                                        <p className="text-sm text-white/80 flex-1 truncate">{ev.title}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-white/30 text-sm">Itinerary details not available.</p>
                )}

                {/* ── AI Insights ─────────────────────────────────────── */}
                {itinerary?.aiInsights?.length ? (
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.04] p-5 space-y-2">
                        <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI Insights
                        </div>
                        {itinerary.aiInsights.slice(0, 3).map((insight, i) => (
                            <p key={i} className="text-sm text-white/55 leading-relaxed">• {insight}</p>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* ── CTA footer ─────────────────────────────────────────── */}
            <div className="border-t border-white/[0.06] px-6 py-16 text-center">
                <div className="max-w-md mx-auto space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/25 flex items-center justify-center mx-auto">
                        <Sparkles className="w-6 h-6 text-[#10B981]" />
                    </div>
                    <h2 className="text-2xl font-black text-white">
                        Build your own AI itinerary
                    </h2>
                    <p className="text-sm text-white/45 leading-relaxed">
                        VoyageAI turns your destination and budget into a complete,
                        day-by-day travel plan — in seconds.
                    </p>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#10B981] text-black font-bold text-sm hover:bg-[#0ea472] transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    >
                        Plan My Trip <ArrowRight className="w-4 h-4" />
                    </Link>
                    <p className="text-xs text-white/25">Free to try. No credit card required.</p>
                </div>
            </div>
        </div>
    );
}
