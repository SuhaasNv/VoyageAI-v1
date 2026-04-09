"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    MapPin,
    Calendar,
    DollarSign,
    Plane,
    Clock,
    Search,
    Globe,
    Compass,
    MoreVertical,
    Trash2,
    ExternalLink,
    Zap,
} from "lucide-react";
import { useTrips } from "@/hooks/useTrips";
import { DeleteTripConfirmModal } from "@/ui/components/trip/DeleteTripConfirmModal";
import type { Trip } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "upcoming" | "planning" | "past";

// ─── Constants ────────────────────────────────────────────────────────────────

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const TABS: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
    { id: "all",      label: "All Trips", icon: <Globe className="w-3.5 h-3.5" /> },
    { id: "upcoming", label: "Upcoming",  icon: <Plane className="w-3.5 h-3.5" /> },
    { id: "planning", label: "Planning",  icon: <Compass className="w-3.5 h-3.5" /> },
    { id: "past",     label: "Past",      icon: <Clock className="w-3.5 h-3.5" /> },
];

const STATUS_STYLES: Record<Trip["status"], { ring: string; dot: string; text: string; label: string }> = {
    upcoming: { ring: "border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400", text: "text-emerald-400", label: "Upcoming" },
    planning: { ring: "border-indigo-500/30 bg-indigo-500/10",  dot: "bg-indigo-400",  text: "text-indigo-400",  label: "Planning" },
    past:     { ring: "border-zinc-600/30 bg-zinc-700/20",       dot: "bg-zinc-500",    text: "text-zinc-400",    label: "Past"     },
};

const FATIGUE_LABEL: Record<Trip["fatigueLevel"], string> = {
    low: "Relaxed pace",
    medium: "Moderate pace",
    high: "Fast pace",
};

const FATIGUE_COLOUR: Record<Trip["fatigueLevel"], string> = {
    low: "text-emerald-400",
    medium: "text-amber-400",
    high: "text-rose-400",
};

// ─── Animations ───────────────────────────────────────────────────────────────

const gridVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.055 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

// ─── TripCard ─────────────────────────────────────────────────────────────────

interface TripCardProps {
    trip: Trip;
    onDelete: (trip: Trip) => void;
}

function TripCard({ trip, onDelete }: TripCardProps) {
    const router = useRouter();
    const [imageError, setImageError] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const status = STATUS_STYLES[trip.status];

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [menuOpen]);

    function handleMenuToggle(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen((v) => !v);
    }

    function handleDelete(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
        onDelete(trip);
    }

    function handleViewTrip(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
        router.push(`/dashboard/trip/${trip.id}`);
    }

    return (
        <motion.div variants={cardVariants} layout className="group relative">
            <Link
                href={`/dashboard/trip/${trip.id}`}
                className="flex flex-col overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.13] transition-all duration-300 hover:shadow-[0_4px_32px_rgba(16,185,129,0.08)] h-full"
            >
                {/* Image */}
                <div className="relative h-44 overflow-hidden flex-shrink-0">
                    {trip.imageUrl && !imageError ? (
                        <Image
                            src={trip.imageUrl}
                            alt={trip.destination}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#10B981]/20 via-indigo-500/10 to-[#0B0F14]" />
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14]/80 via-transparent to-transparent" />

                    {/* Status badge */}
                    <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border backdrop-blur-sm ${status.ring} ${status.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                    </div>

                    {/* Destination pin overlay */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-white/70 text-[11px]">
                        <MapPin className="w-3 h-3 flex-shrink-0 text-[#10B981]" />
                        <span className="truncate max-w-[160px]">{trip.destination}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3 p-4 flex-1">
                    <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-[#10B981] transition-colors duration-200 pr-6">
                        {trip.title}
                    </h3>

                    <div className="flex flex-col gap-1.5 mt-auto">
                        <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                            <Calendar className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{trip.dates}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                                <DollarSign className="w-3 h-3 flex-shrink-0" />
                                <span>
                                    {trip.budget.currency} {trip.budget.total.toLocaleString()}
                                </span>
                            </div>
                            <span className={`text-[10px] font-medium flex items-center gap-1 ${FATIGUE_COLOUR[trip.fatigueLevel]}`}>
                                <Zap className="w-2.5 h-2.5" />
                                {FATIGUE_LABEL[trip.fatigueLevel]}
                            </span>
                        </div>
                    </div>
                </div>
            </Link>

            {/* ─── Context menu ─────────────────────────────────────────────── */}
            <div
                ref={menuRef}
                className="absolute top-3 right-3 z-20 flex flex-col items-end"
            >
                <button
                    type="button"
                    onClick={handleMenuToggle}
                    aria-label="Trip options"
                    aria-expanded={menuOpen}
                    className="w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                    <MoreVertical className="w-3.5 h-3.5" />
                </button>

                <AnimatePresence>
                    {menuOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: -4 }}
                            transition={{ duration: 0.15 }}
                            role="menu"
                            className="mt-1.5 w-44 py-1 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl origin-top-right"
                        >
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleViewTrip}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5 opacity-80 flex-shrink-0" />
                                View trip
                            </button>
                            <div className="mx-3 my-1 h-px bg-white/[0.06]" />
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleDelete}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                                Delete trip
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] overflow-hidden animate-pulse">
            <div className="h-44 bg-white/[0.05]" />
            <div className="p-4 flex flex-col gap-3">
                <div className="h-4 bg-white/[0.05] rounded-md w-3/4" />
                <div className="h-3 bg-white/[0.04] rounded-md w-1/2" />
                <div className="h-3 bg-white/[0.04] rounded-md w-2/3" />
            </div>
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterTab }) {
    const MESSAGES: Record<FilterTab, { title: string; body: string }> = {
        all:      { title: "No trips yet",          body: "Head back to the dashboard to start building your first itinerary." },
        upcoming: { title: "No upcoming trips",      body: "Nothing on the horizon — time to plan something new." },
        planning: { title: "Nothing in progress",    body: "Head to the dashboard to start building an itinerary." },
        past:     { title: "No past trips recorded", body: "Completed trips will appear here." },
    };
    const { title, body } = MESSAGES[filter];

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="col-span-full flex flex-col items-center justify-center py-24 text-center"
        >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10B981]/20 to-indigo-500/20 border border-white/10 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(16,185,129,0.10)]">
                <Plane className="w-7 h-7 text-[#10B981]" />
            </div>
            <p className="text-white font-semibold text-sm mb-1.5">{title}</p>
            <p className="text-zinc-500 text-xs max-w-[260px] leading-relaxed">{body}</p>
            <Link
                href="/dashboard"
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/20 transition-colors"
            >
                <ArrowLeft className="w-3 h-3" />
                Back to dashboard
            </Link>
        </motion.div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TripsAtlasPage() {
    const { trips, isLoading, setTrips } = useTrips();
    const [activeTab, setActiveTab] = useState<FilterTab>("all");
    const [search, setSearch] = useState("");
    const [deletingTrip, setDeletingTrip] = useState<Trip | null>(null);

    const filtered = useMemo(() => {
        let result = trips;
        if (activeTab !== "all") {
            result = result.filter((t) => t.status === activeTab);
        }
        const q = search.trim().toLowerCase();
        if (q) {
            result = result.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.destination.toLowerCase().includes(q)
            );
        }
        return result;
    }, [trips, activeTab, search]);

    const counts = useMemo(
        () => ({
            all:      trips.length,
            upcoming: trips.filter((t) => t.status === "upcoming").length,
            planning: trips.filter((t) => t.status === "planning").length,
            past:     trips.filter((t) => t.status === "past").length,
        }),
        [trips]
    );

    const handleDeleted = useCallback(() => {
        if (!deletingTrip) return;
        setTrips((prev) => prev.filter((t) => t.id !== deletingTrip.id));
        setDeletingTrip(null);
    }, [deletingTrip, setTrips]);

    return (
        <>
            <div className="flex-1 overflow-y-auto h-full bg-[#0B0F14] scrollbar-none">
                {/* Ambient background */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
                    <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#10B981]/[0.04] blur-[120px]" />
                    <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-indigo-500/[0.04] blur-[120px]" />
                    <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full bg-purple-500/[0.03] blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
                    {/* Back nav */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT }}
                    >
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors mb-8"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            Dashboard
                        </Link>
                    </motion.div>

                    {/* Header row */}
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.55, ease: EASE_OUT }}
                        className="mb-8"
                    >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2.5 mb-2">
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#10B981]/25 to-indigo-500/15 border border-white/10 flex items-center justify-center">
                                        <Compass className="w-3.5 h-3.5 text-[#10B981]" />
                                    </div>
                                    <span className="text-[10px] font-bold text-[#10B981] tracking-[0.18em] uppercase">
                                        Your Atlas
                                    </span>
                                </div>
                                <h1 className="text-3xl sm:text-[2.5rem] font-bold text-white tracking-tight leading-none">
                                    All Trips
                                </h1>
                                <p className="text-zinc-500 text-sm mt-1.5">
                                    {isLoading
                                        ? "Loading your journeys…"
                                        : counts.all === 0
                                        ? "No journeys yet — start exploring"
                                        : `${counts.all} ${counts.all === 1 ? "journey" : "journeys"} in your collection`}
                                </p>
                            </div>

                            {/* Search */}
                            <div className="relative mt-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search destinations…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9 pr-4 py-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-full text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#10B981]/40 focus:bg-white/[0.06] transition-all w-52"
                                />
                            </div>
                        </div>

                        {/* Filter tabs */}
                        <div className="flex items-center gap-1.5 mt-6 flex-wrap">
                            {TABS.map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                                            isActive
                                                ? "text-white"
                                                : "text-zinc-500 hover:text-zinc-300"
                                        }`}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="atlas-tab-pill"
                                                className="absolute inset-0 rounded-full bg-[#10B981]/10 border border-[#10B981]/25"
                                                transition={{ duration: 0.22, ease: EASE_OUT }}
                                            />
                                        )}
                                        <span className="relative flex items-center gap-1.5">
                                            {tab.icon}
                                            {tab.label}
                                            <span className={`text-[10px] ${isActive ? "text-[#10B981]" : "text-zinc-600"}`}>
                                                {counts[tab.id]}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))}
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`${activeTab}-${search}`}
                                variants={gridVariants}
                                initial="hidden"
                                animate="show"
                                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                            >
                                {filtered.length === 0 ? (
                                    <EmptyState filter={activeTab} />
                                ) : (
                                    filtered.map((trip) => (
                                        <TripCard
                                            key={trip.id}
                                            trip={trip}
                                            onDelete={setDeletingTrip}
                                        />
                                    ))
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* Modals — rendered outside the scrollable area */}
            {deletingTrip && (
                <DeleteTripConfirmModal
                    trip={deletingTrip}
                    isOpen
                    onClose={() => setDeletingTrip(null)}
                    onDeleted={handleDeleted}
                />
            )}
        </>
    );
}
