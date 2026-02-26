"use client";

import { useState, useRef, useEffect } from "react";
import { Battery, BatteryMedium, BatteryWarning, Wallet, ArrowLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateTrip, type Trip } from "@/lib/api";
import { EditTripModal } from "./EditTripModal";
import { DeleteTripConfirmModal } from "./DeleteTripConfirmModal";

interface TripTopBarProps {
    trip: Trip;
    onTripUpdate?: (trip: Trip) => void;
}

export function TripTopBar({ trip, onTripUpdate }: TripTopBarProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function handleDeleteClick() {
        setMenuOpen(false);
        setDeleteOpen(true);
    }

    function handleDeleteConfirmed() {
        setDeleteOpen(false);
        router.replace("/dashboard");
    }

    function handleEditSaved(updated: Trip) {
        onTripUpdate?.(updated);
    }
    const isHighFatigue = trip.fatigueLevel === "high";
    const isMedFatigue = trip.fatigueLevel === "medium";
    const safeTotal = trip.budget?.total ?? 0;
    const safeSpent = trip.budget?.spent ?? 0;
    const budgetPercent = safeTotal > 0 ? Math.min((safeSpent / safeTotal) * 100, 100) : 0;
    const symbol = (trip.budget?.currency ?? "USD") === "USD" ? "$" : (trip.budget?.currency ?? "USD") + " ";

    return (
        <div className="bg-[#0B0F14]/80 backdrop-blur-xl border-b border-white/5 p-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 hover:border-white/10 transition-all duration-200 ease-out">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight leading-tight">{trip.title}</h1>
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                        {trip.dates} <span className="w-1 h-1 rounded-full bg-slate-400/30" /> {trip.destination}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2.5 bg-white/[0.02] backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5">
                    {isHighFatigue ? <BatteryWarning className="w-4 h-4 text-rose-500" /> : isMedFatigue ? <BatteryMedium className="w-4 h-4 text-amber-500" /> : <Battery className="w-4 h-4 text-[#10B981]" />}
                    <div>
                        <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Fatigue Forecast</div>
                        <div className={`text-sm font-semibold capitalize ${isHighFatigue ? 'text-rose-400' : isMedFatigue ? 'text-amber-400' : 'text-[#10B981]'}`}>
                            {trip.fatigueLevel}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white/[0.02] backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5 w-64">
                    <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center flex-shrink-0 border border-[#10B981]/20">
                        <Wallet className="w-4 h-4 text-[#10B981]" />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-500 font-medium">Budget</span>
                            <span className="text-white font-bold">{symbol}{safeSpent.toLocaleString()} / {safeTotal > 0 ? `${symbol}${safeTotal.toLocaleString()}` : "—"}</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${budgetPercent > 85 ? 'bg-rose-500' : 'bg-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.2)]'}`}
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Trip actions menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen((o) => !o)}
                        className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
                        aria-label="Trip options"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-2 py-1.5 min-w-[160px] bg-[#0B0F14] border border-white/10 rounded-xl shadow-xl z-50">
                            <button
                                onClick={() => { setMenuOpen(false); setEditOpen(true); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                                Edit trip
                            </button>
                            <button
                                onClick={handleDeleteClick}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete trip
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <EditTripModal
                trip={trip}
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                onSaved={handleEditSaved}
            />

            <DeleteTripConfirmModal
                trip={trip}
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                onDeleted={handleDeleteConfirmed}
            />
        </div>
    );
}
