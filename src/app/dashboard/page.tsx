"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Plane } from "lucide-react";
import { UpcomingTripsGrid } from "@/ui/dashboard/UpcomingTripsGrid";
import { BudgetOverviewCard } from "@/ui/dashboard/BudgetOverviewCard";
import { AISuggestionsCard } from "@/ui/dashboard/AISuggestionsCard";
import { CreateTripModal } from "@/ui/dashboard/CreateTripModal";
import { TripIntelligencePanel } from "@/ui/dashboard/TripIntelligencePanel";
import { CalendarWidget } from "@/ui/dashboard/CalendarWidget";
import { TravelDNAOnboardingModal } from "@/ui/dashboard/TravelDNAOnboardingModal";
import { AICommandPalette } from "@/ui/dashboard/AICommandPalette";
import { FlightTicketWizard } from "@/ui/dashboard/FlightTicketWizard";
import { ItineraryCreationFlow } from "@/ui/components/itinerary-flow/ItineraryCreationFlow";
import { useTrips } from "@/hooks/useTrips";
import { CurrencyService, type CurrencyCode } from "@/lib/services/currency.service";
import type { Trip } from "@/lib/api";
import type { FlowInput } from "@/ui/components/itinerary-flow/types";

export default function DashboardPage() {
    const router = useRouter();
    const { trips, isLoading, setTrips } = useTrips();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialDestination, setInitialDestination] = useState("");
    const [showTicketWizard, setShowTicketWizard] = useState(false);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    /** Active flow session — when set, the full-screen pipeline overlay renders. */
    const [flowSession, setFlowSession] = useState<{ tripId: string; input: FlowInput } | null>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredTrips = useMemo(() => {
        if (!debouncedQuery.trim()) return trips;
        const q = debouncedQuery.toLowerCase();
        return trips.filter(
            t => t.title.toLowerCase().includes(q) ||
                t.destination.toLowerCase().includes(q)
        );
    }, [trips, debouncedQuery]);

    useEffect(() => {
        fetch("/api/preferences")
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data?.preference === null) {
                    setShowOnboardingModal(true);
                }
            })
            .catch(console.error);
    }, []);

    const { totalBudget, totalSpent, budgetCurrency } = useMemo(() => {
        const baseCurrency: CurrencyCode = "USD";
        let totalB = 0;
        let totalS = 0;
        
        trips.forEach(t => {
            const tripCurrency = (t.budget?.currency || "USD") as CurrencyCode;
            totalB += CurrencyService.convert(t.budget?.total || 0, tripCurrency, baseCurrency);
            totalS += CurrencyService.convert(t.budget?.spent || 0, tripCurrency, baseCurrency);
        });

        return {
            totalBudget: totalB,
            totalSpent: totalS,
            budgetCurrency: baseCurrency as string
        };
    }, [trips]);

    const aiStatusMessage = useMemo(() => {
        if (trips.length === 0) return null;
        const today = new Date();
        const now   = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const next  = [...trips]
            .filter(t => {
                const [ey, em, ed] = t.endDate.split("-").map(Number);
                return Date.UTC(ey!, em! - 1, ed!) >= now;
            })
            .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        if (!next) return null;
        const [sy, sm, sd] = next.startDate.split("-").map(Number);
        const start = Date.UTC(sy!, sm! - 1, sd!);
        const daysUntil = Math.round((start - now) / 86_400_000);
        const pct = next.budget.total > 0 ? Math.round((next.budget.spent / next.budget.total) * 100) : 0;
        if (daysUntil < 0)  return `✦ ${next.destination} trip is underway`;
        if (daysUntil === 0) return `✦ ${next.destination} starts today`;
        if (daysUntil === 1) return `✦ ${next.destination} departs tomorrow — confirm your bookings`;
        if (daysUntil <= 7)  return pct > 0 ? `✦ ${next.destination} in ${daysUntil} days — ${pct}% of budget used` : `✦ ${next.destination} departs in ${daysUntil} days`;
        if (pct > 75)        return `✦ ${next.destination} budget ${pct}% used — review spending`;
        return `✦ ${next.destination} in ${daysUntil} days`;
    }, [trips]);

    const handleTripCreated = (newTrip: Trip) =>
        setTrips(prev =>
            [...prev, newTrip].sort(
                (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            )
        );

    return (
        <div className="h-full overflow-y-auto scroll-smooth hide-scrollbar">
            <div className="min-h-full p-6 md:p-8 lg:p-10 space-y-8 relative">
                {/* ── Top bar ───────────────────────────────────────────────── */}
                <header className="flex items-center justify-between gap-4 pb-2">
                    {/* AI Status Strip — left, shown when trips are loaded */}
                    {mounted && !isLoading && aiStatusMessage && (
                        <div className="hidden md:flex items-center gap-2.5 bg-[#10B981]/[0.06] border border-[#10B981]/[0.12] rounded-full px-4 py-2 min-w-0 max-w-sm lg:max-w-lg xl:max-w-2xl">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                            <span className="text-xs text-zinc-300 font-medium truncate">{aiStatusMessage}</span>
                        </div>
                    )}
                    {/* Right: search + action buttons */}
                    <div className="flex items-center gap-4 ml-auto">
                        <div className="relative max-w-xs w-full hidden lg:block">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search destinations..."
                                className="w-full bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 rounded-full py-2.5 px-12 focus:outline-none focus:border-[#10B981]/40 focus:ring-1 focus:ring-[#10B981]/40 transition-all font-medium"
                            />
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                            </svg>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowTicketWizard(true)}
                                title="Import from flight ticket"
                                className="w-11 h-11 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 hover:bg-indigo-500/20 transition-all shadow-[0_0_12px_rgba(99,102,241,0.12)] group"
                            >
                                <Plane className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
                            </button>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="w-11 h-11 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center text-[#10B981] hover:bg-[#10B981]/20 transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)] group"
                            >
                                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                        </div>
                    </div>
                </header>

                {/* ── Row 1: Active trips — full width ─────────────────────── */}
                <UpcomingTripsGrid
                    trips={filteredTrips}
                    isLoading={isLoading}
                    onTripsChange={setTrips}
                    onNewTripClick={(dest) => {
                        setInitialDestination(dest || "");
                        setIsModalOpen(true);
                    }}
                    onTicketUploadClick={() => setShowTicketWizard(true)}
                    isSearching={debouncedQuery.trim().length > 0}
                />

                {/* ── Rows 2–3: 4 info cards ───────────────────────────────
                     md: 2×2 grid  |  2xl: single row of 4 columns        */}
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-6 items-start">
                    <TripIntelligencePanel trips={trips} isLoading={isLoading} />
                    <BudgetOverviewCard
                        totalBudget={totalBudget}
                        totalSpent={totalSpent}
                        currency={budgetCurrency}
                    />
                    <CalendarWidget trips={trips} />
                    <AISuggestionsCard onPlanTrip={(dest) => { setInitialDestination(dest); setIsModalOpen(true); }} />
                </div>
            </div>

            {/* ── Modals ────────────────────────────────────────────────────── */}
            {isModalOpen && (
                <CreateTripModal
                    isOpen={isModalOpen}
                    initialDestination={initialDestination}
                    onClose={() => {
                        setIsModalOpen(false);
                        setInitialDestination("");
                    }}
                    onFlowStart={(tripId, input) => {
                        setIsModalOpen(false);
                        setInitialDestination("");
                        setFlowSession({ tripId, input });
                    }}
                />
            )}

            <FlightTicketWizard
                isOpen={showTicketWizard}
                onClose={() => setShowTicketWizard(false)}
                onFlowStart={(tripId, input) => {
                    setShowTicketWizard(false);
                    setFlowSession({ tripId, input });
                }}
            />

            <TravelDNAOnboardingModal
                isOpen={showOnboardingModal}
                onClose={() => setShowOnboardingModal(false)}
            />

            {/* ── Floating AI command button ─────────────────────────────── */}
            <AICommandPalette 
                onTripCreated={handleTripCreated}
                onFlowStart={(tripId, input) => setFlowSession({ tripId, input })} 
            />

            {/* ── Itinerary Creation Flow (full-screen pipeline overlay) ───── */}
            {flowSession && (
                <ItineraryCreationFlow
                    tripId={flowSession.tripId}
                    input={flowSession.input}
                    onComplete={(id) => {
                        setFlowSession(null);
                        router.push(`/dashboard/trip/${id}`);
                    }}
                    onClose={() => setFlowSession(null)}
                />
            )}
        </div>
    );
}
