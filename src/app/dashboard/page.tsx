"use client";

import { useState, useEffect } from "react";
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
import { useTrips } from "@/hooks/useTrips";
import { NotificationBell } from "@/ui/dashboard/NotificationBell";
import type { Trip } from "@/lib/api";
import { useMemo } from "react";

export default function DashboardPage() {
    const { trips, isLoading, setTrips } = useTrips();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showTicketWizard, setShowTicketWizard] = useState(false);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

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

    const totalBudget = trips.reduce((s, t) => s + (t.budget?.total ?? 0), 0);
    const totalSpent = trips.reduce((s, t) => s + (t.budget?.spent ?? 0), 0);
    const budgetCurrency = trips[0]?.budget?.currency ?? "USD";

    const handleTripCreated = (newTrip: Trip) =>
        setTrips(prev =>
            [...prev, newTrip].sort(
                (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            )
        );

    return (
        <div className="h-full overflow-y-auto scroll-smooth hide-scrollbar">
            <div className="min-h-full p-6 md:p-8 lg:p-10 max-w-[1440px] mx-auto space-y-8 relative mobile-container">

                {/* ── Top bar ───────────────────────────────────────────────── */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="relative max-w-xs w-full ml-8 hidden lg:block">
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
                            <NotificationBell />
                            {/* Flight ticket import — magic feature */}
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
                    onNewTripClick={() => setIsModalOpen(true)}
                    isSearching={debouncedQuery.trim().length > 0}
                />

                {/* ── Row 2: Trip Intelligence + Budget ────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TripIntelligencePanel trips={trips} isLoading={isLoading} />
                    <BudgetOverviewCard
                        totalBudget={totalBudget}
                        totalSpent={totalSpent}
                        currency={budgetCurrency}
                    />
                </div>

                {/* ── Row 3: Calendar + Suggestions ────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <CalendarWidget trips={trips} />
                    <AISuggestionsCard />
                </div>
            </div>

            {/* ── Modals ────────────────────────────────────────────────────── */}
            {isModalOpen && (
                <CreateTripModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
            )}

            <FlightTicketWizard
                isOpen={showTicketWizard}
                onClose={() => setShowTicketWizard(false)}
                onTripCreated={() => {
                    setShowTicketWizard(false);
                    // Refresh trip list after a short delay so the DB write settles.
                    setTimeout(() => window.location.reload(), 400);
                }}
            />

            <TravelDNAOnboardingModal
                isOpen={showOnboardingModal}
                onClose={() => setShowOnboardingModal(false)}
            />

            {/* ── Floating AI command button ─────────────────────────────── */}
            <AICommandPalette onTripCreated={handleTripCreated} />
        </div>
    );
}
