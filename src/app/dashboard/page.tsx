"use client";

import { useState, useEffect } from "react";
import { Plus, Bell } from "lucide-react";
import { UpcomingTripsGrid } from "@/components/dashboard/UpcomingTripsGrid";
import { BudgetOverviewCard } from "@/components/dashboard/BudgetOverviewCard";
import { AISuggestionsCard } from "@/components/dashboard/AISuggestionsCard";
import { CreateTripModal } from "@/components/dashboard/CreateTripModal";
import { TripIntelligencePanel } from "@/components/dashboard/TripIntelligencePanel";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { DashboardAIAssistant } from "@/components/dashboard/DashboardAIAssistant";
import { TravelDNAOnboardingModal } from "@/components/dashboard/TravelDNAOnboardingModal";
import { useTrips } from "@/hooks/useTrips";
import type { Trip } from "@/lib/api";

export default function DashboardPage() {
    const { trips, isLoading, setTrips } = useTrips();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);

    useEffect(() => {
        fetch('/api/preferences')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data && data.data.preference === null) {
                    setShowOnboardingModal(true);
                }
            })
            .catch(console.error);
    }, []);

    const totalBudget = trips.reduce((sum, t) => sum + (t.budget?.total ?? 0), 0);
    const totalSpent = trips.reduce((sum, t) => sum + (t.budget?.spent ?? 0), 0);
    const budgetCurrency = trips[0]?.budget?.currency ?? "USD";

    const handleTripCreated = (newTrip: Trip) => {
        setTrips((prev) =>
            [...prev, newTrip].sort(
                (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
            )
        );
    };

    return (
        <div className="h-full overflow-y-auto scroll-smooth hide-scrollbar">
            <div className="min-h-full p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-8 relative mobile-container">
                {/* Top Bar matching Minimal Premium OS */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar scroll-smooth">
                        <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all whitespace-nowrap shrink-0">
                            <span className="text-lg">🏕️</span> Experiences
                        </button>
                        <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all whitespace-nowrap shrink-0">
                            <span className="text-lg">✈️</span> Trips
                        </button>
                        <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all whitespace-nowrap shrink-0">
                            <span className="text-lg">🛡️</span> Services
                        </button>
                    </div>

                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="relative max-w-xs w-full ml-8 hidden lg:block">
                            <input
                                type="text"
                                placeholder="Search destinations..."
                                className="w-full bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 rounded-full py-2.5 px-12 focus:outline-none focus:border-[#10B981]/40 focus:ring-1 focus:ring-[#10B981]/40 transition-all font-medium"
                            />
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        </div>

                        <div className="flex items-center gap-3">
                            <button className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                                <Bell className="w-5 h-5" />
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

                {/* Main Grid: Discover Places + Map (left), Calendar + Budget + Suggestions (right) */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                    <div className="space-y-8 order-1">
                        <UpcomingTripsGrid
                            trips={trips}
                            isLoading={isLoading}
                            onTripsChange={setTrips}
                            onNewTripClick={() => setIsModalOpen(true)}
                        />
                        <TripIntelligencePanel trips={trips} isLoading={isLoading} />
                    </div>

                    <div className="space-y-8 order-2">
                        <DashboardAIAssistant onTripCreated={handleTripCreated} />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-8">
                            <CalendarWidget trips={trips} />
                            <BudgetOverviewCard totalBudget={totalBudget} totalSpent={totalSpent} currency={budgetCurrency} />
                            <div className="md:col-span-2 lg:col-span-1">
                                <AISuggestionsCard />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Overlay */}
                {isModalOpen && (
                    <CreateTripModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
                )}

                <TravelDNAOnboardingModal
                    isOpen={showOnboardingModal}
                    onClose={() => setShowOnboardingModal(false)}
                />
            </div>
        </div>
    );
}
