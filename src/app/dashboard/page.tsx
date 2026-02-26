"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Bell } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { UpcomingTripsGrid } from "@/components/dashboard/UpcomingTripsGrid";
import { BudgetOverviewCard } from "@/components/dashboard/BudgetOverviewCard";
import { AISuggestionsCard } from "@/components/dashboard/AISuggestionsCard";
import { CreateTripModal } from "@/components/dashboard/CreateTripModal";
import { MapSimulationPanel } from "@/components/dashboard/MapSimulationPanel";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { getUpcomingTrips, type Trip } from "@/lib/api";

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" as const } };

function displayName(name: string | null, email: string): string {
    if (name?.trim()) return name.trim();
    const local = email.split("@")[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [trips, setTrips] = useState<Trip[]>([]);
    const greetingName = user ? displayName(user.name, user.email) : "there";

    useEffect(() => {
        getUpcomingTrips()
            .then(setTrips)
            .catch((error) => {
                console.error("Failed to load upcoming trips", error);
            });
    }, []);

    return (
        <div className="min-h-full p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-8 relative">
            {/* Top Bar matching Minimal Premium OS */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                        <span className="text-lg">🏕️</span> Experiences
                    </button>
                    <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
                        <span className="text-lg">✈️</span> Trips
                    </button>
                    <button className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all">
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

                    <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                        <Bell className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-10 h-10 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-center text-[#10B981] hover:bg-[#10B981]/20 transition-all shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Grid: Discover Places + Map (left), Calendar + Budget + Suggestions (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-7xl">
                <motion.div className="space-y-6" {...fadeIn}>
                    <UpcomingTripsGrid trips={trips} />
                    <MapSimulationPanel />
                </motion.div>

                <motion.div className="space-y-6" {...fadeIn} transition={{ duration: 0.3, ease: "easeOut" as const, delay: 0.08 }}>
                    <CalendarWidget />
                    <BudgetOverviewCard />
                    <AISuggestionsCard />
                </motion.div>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <CreateTripModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
            )}
        </div>
    );
}
