"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, ChevronRight, Star, MoreVertical, Pencil, Trash2, Plane, Plus, ImageIcon, ArrowRight, FileUp } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { updateTrip, type Trip } from "@/lib/api";
import { EditTripModal } from "@/ui/components/trip/EditTripModal";
import { DeleteTripConfirmModal } from "@/ui/components/trip/DeleteTripConfirmModal";

interface UpcomingTripsGridProps {
    trips: Trip[];
    isLoading?: boolean;
    onTripsChange?: (trips: Trip[]) => void;
    onNewTripClick?: () => void;
    onTicketUploadClick?: () => void;
    isSearching?: boolean;
}

interface TripCardProps {
    trip: Trip;
    image: string | null;
    menuTripId: string | null;
    refreshingImageId: string | null;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onMenuToggle: (id: string) => void;
    onEdit: (trip: Trip) => void;
    onRefreshImage: (trip: Trip, e: React.MouseEvent) => void;
    onDelete: (trip: Trip, e: React.MouseEvent) => void;
}

function TripCardImageFallback() {
    return (
        <div
            className="absolute inset-0 bg-gradient-to-br from-[#10B981]/20 via-indigo-500/10 to-[#0B0F14]"
            aria-hidden
        />
    );
}

function TripCard({
    trip,
    image,
    menuTripId,
    refreshingImageId,
    menuRef,
    onMenuToggle,
    onEdit,
    onRefreshImage,
    onDelete,
}: TripCardProps) {
    const [imageError, setImageError] = useState(false);
    const showImage = image && !imageError;

    return (
        <Link
            href={`/dashboard/trip/${trip.id}`}
            className="group relative flex flex-col gap-4 p-2 rounded-[1.5rem] bg-white/[0.02] border border-white/5 transition-all hover:bg-white/[0.04] hover:border-white/10 hover:shadow-xl"
        >
            <div className="relative h-44 rounded-2xl overflow-hidden border border-white/5 mb-1">
                {showImage ? (
                    <Image
                        key={`${trip.id}-${image}`}
                        src={image}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        alt={trip.title}
                        sizes="(max-width: 768px) 100vw, 50vw"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <TripCardImageFallback />
                )}
                <div className="absolute inset-0 bg-[#0B0F14]/40 mix-blend-multiply pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14]/90 via-[#0B0F14]/20 to-transparent pointer-events-none" />
                <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold tracking-wider text-white flex items-center gap-1 border border-white/10">
                    <Star className="w-3 h-3 text-[#10B981] fill-current" /> 4.9
                </div>
            </div>

            {/* Menu: items-end so panel right edge aligns with trigger; w-max + nowrap avoids wrap/jagged rows */}
            <div
                className="absolute top-5 right-5 z-20 flex flex-col items-end gap-0"
                ref={menuTripId === trip.id ? menuRef : undefined}
            >
                <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMenuToggle(trip.id); }}
                    className="shrink-0 w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 border border-white/10 transition-all"
                    aria-label="Trip options"
                    aria-expanded={menuTripId === trip.id}
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
                {menuTripId === trip.id && (
                    <div
                        role="menu"
                        className="mt-1.5 w-max min-w-[11.5rem] py-1.5 bg-[#0B0F14] border border-white/10 rounded-xl shadow-xl z-[60] origin-top-right"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(trip); }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white whitespace-nowrap"
                        >
                            <Pencil className="w-4 h-4 shrink-0 opacity-90" />
                            <span>Edit</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => onRefreshImage(trip, e)}
                            disabled={refreshingImageId === trip.id}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white disabled:opacity-50 whitespace-nowrap"
                        >
                            <ImageIcon className="w-4 h-4 shrink-0 opacity-90" />
                            <span>{refreshingImageId === trip.id ? "Refreshing…" : "Refresh image"}</span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => onDelete(trip, e)}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm text-rose-400 hover:bg-rose-500/10 whitespace-nowrap"
                        >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            <span>Delete</span>
                        </button>
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1.5 px-3 pb-3">
                <h3 className="text-white font-bold text-lg leading-tight group-hover:text-[#10B981] transition-colors">{trip.title}</h3>
                <div className="text-zinc-400 text-xs flex items-center gap-1.5 font-medium"><MapPin className="w-3.5 h-3.5" /> {trip.destination}</div>
                <div className="w-full h-px bg-white/5 my-2" />
                <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-500 font-medium">{trip.dates}</span>
                    <span className="text-zinc-400 font-medium text-[10px] tracking-wider uppercase">Est. Budget: <span className="text-[#10B981] font-bold text-sm tracking-normal ml-1">${trip.budget.total}</span></span>
                </div>
            </div>
        </Link>
    );
}

const SUGGESTIONS = [
    { label: "Tokyo", flag: "🇯🇵" },
    { label: "Paris", flag: "🇫🇷" },
    { label: "Bali", flag: "🇮🇩" },
];

function PlanNewTripPanel({ onNewTripClick, onTicketUploadClick }: { onNewTripClick?: () => void; onTicketUploadClick?: () => void }) {
    const [destination, setDestination] = useState("");

    function handleSubmit() {
        onNewTripClick?.();
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="group relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#0B0F14] to-[#111827] border border-white/[0.07] p-6 flex flex-col gap-5 hover:border-[#10B981]/25 hover:shadow-[0_8px_40px_rgba(16,185,129,0.09)] transition-[border-color,box-shadow] duration-300 cursor-default"
        >
            {/* Ambient glow — brightens on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#10B981]/[0.04] via-transparent to-indigo-500/[0.04] pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#10B981]/[0.06] via-transparent to-indigo-500/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            {/* Corner orb */}
            <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-[#10B981]/[0.07] blur-2xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-6 h-6 rounded-lg bg-[#10B981]/15 border border-[#10B981]/20 flex items-center justify-center">
                        <Plane className="w-3.5 h-3.5 text-[#10B981]" />
                    </div>
                    <span className="text-[10px] font-bold tracking-[0.15em] text-[#10B981] uppercase">AI-Powered</span>
                </div>
                <h3 className="text-white font-bold text-lg leading-tight">Plan your next adventure</h3>
                <p className="text-zinc-500 text-xs mt-1 leading-relaxed">Tell us where you want to go — we&apos;ll build everything for you</p>
            </div>

            {/* Input */}
            <div className="relative z-10 flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 focus-within:border-[#10B981]/40 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_1px_rgba(16,185,129,0.12)] transition-all duration-200">
                <MapPin className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                <input
                    type="text"
                    placeholder="Where do you want to go?"
                    className="bg-transparent text-sm text-white placeholder:text-zinc-600 outline-none flex-1 min-w-0"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                />
                <button
                    type="button"
                    onClick={handleSubmit}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        destination
                            ? "bg-[#10B981] text-white shadow-[0_0_16px_rgba(16,185,129,0.4)]"
                            : "bg-white/[0.06] text-zinc-500 hover:bg-white/[0.09] hover:text-white"
                    }`}
                >
                    {destination ? "Go" : "Start"}
                    <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            {/* Quick suggestions */}
            <div className="relative z-10 flex items-center gap-2 flex-wrap">
                <span className="text-zinc-600 text-[11px] font-medium">Popular:</span>
                {SUGGESTIONS.map(({ label, flag }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => { setDestination(label); onNewTripClick?.(); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.07] text-[11px] text-zinc-400 hover:text-white hover:border-[#10B981]/30 hover:bg-[#10B981]/[0.08] transition-all duration-200 font-medium"
                    >
                        <span>{flag}</span>
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* PDF upload shortcut */}
            {onTicketUploadClick && (
                <button
                    type="button"
                    onClick={onTicketUploadClick}
                    className="relative z-10 flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200 mt-1"
                >
                    <FileUp className="w-3 h-3" />
                    Import from flight ticket PDF
                </button>
            )}
        </motion.div>
    );
}

export function UpcomingTripsGrid({ trips, isLoading, onTripsChange, onNewTripClick, onTicketUploadClick, isSearching }: UpcomingTripsGridProps) {
    const [menuTripId, setMenuTripId] = useState<string | null>(null);
    const [editTrip, setEditTrip] = useState<Trip | null>(null);
    const [deleteTrip, setDeleteTrip] = useState<Trip | null>(null);
    const [refreshingImageId, setRefreshingImageId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuTripId(null);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function handleDeleteClick(trip: Trip, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setMenuTripId(null);
        setDeleteTrip(trip);
    }

    function handleDeleteConfirmed() {
        if (!deleteTrip) return;
        onTripsChange?.(trips.filter((t) => t.id !== deleteTrip.id));
        setDeleteTrip(null);
    }

    function handleEditSaved(updated: Trip) {
        setEditTrip(null);
        onTripsChange?.(trips.map((t) => (t.id === updated.id ? updated : t)));
    }

    async function handleRefreshImage(trip: Trip, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setMenuTripId(null);
        setRefreshingImageId(trip.id);
        try {
            const updated = await updateTrip(trip.id, { refreshImage: true });
            onTripsChange?.(trips.map((t) => (t.id === updated.id ? updated : t)));
        } catch {
            alert("Failed to refresh image. Please try again.");
        } finally {
            setRefreshingImageId(null);
        }
    }

    return (
        <div className="min-h-[320px] bg-white/[0.02] backdrop-blur-xl rounded-[2rem] p-6 border border-white/5 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Active Trips</h2>
                    <p className="text-xs text-zinc-500 font-medium">Your upcoming scheduled travels</p>
                </div>
                {!isSearching && (
                    <button className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/[0.02] border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/5">
                        View all <ChevronRight className="w-3 h-3" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isLoading ? (
                    <div className="md:col-span-2 flex flex-col items-center justify-center py-16 px-8 text-center relative overflow-hidden rounded-[1.5rem] bg-white/[0.02] border border-white/5 min-h-[280px]">
                        <p className="text-sm text-zinc-500 font-medium">Loading trips…</p>
                    </div>
                ) : trips.length === 0 ? (
                    <div className="md:col-span-2 flex flex-col items-center justify-center py-16 px-8 text-center relative overflow-hidden rounded-[1.5rem] bg-white/[0.02] border border-white/5">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#10B981]/5 via-transparent to-indigo-500/5 pointer-events-none" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-[#10B981]/5 blur-[60px] pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center gap-6">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#10B981]/20 to-indigo-500/20 border border-white/10 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.12)]">
                                {isSearching ? (
                                    <MapPin className="w-9 h-9 text-[#10B981]" />
                                ) : (
                                    <Plane className="w-9 h-9 text-[#10B981]" />
                                )}
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    {isSearching ? "No matching trips" : "No trips yet"}
                                </h3>
                                <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
                                    {isSearching
                                        ? "We couldn't find any trips matching your search. Try a different destination or trip title."
                                        : "Create your first — plan smarter with AI itineraries, budget tracking, and more."}
                                </p>
                            </div>
                            {!isSearching && (
                                <button
                                    onClick={onNewTripClick}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#10B981]/90 text-white text-sm font-semibold transition-all shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:shadow-[0_0_32px_rgba(16,185,129,0.4)]"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create your first trip
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {trips.map((trip) => (
                            <TripCard
                                key={trip.id}
                                trip={trip}
                                image={trip.imageUrl ?? null}
                                menuTripId={menuTripId}
                                refreshingImageId={refreshingImageId}
                                menuRef={menuRef}
                                onMenuToggle={(id) => setMenuTripId((prev) => (prev === id ? null : id))}
                                onEdit={(t) => { setMenuTripId(null); setEditTrip(t); }}
                                onRefreshImage={handleRefreshImage}
                                onDelete={handleDeleteClick}
                            />
                        ))}

                        <PlanNewTripPanel onNewTripClick={onNewTripClick} onTicketUploadClick={onTicketUploadClick} />
                    </>
                )}
            </div>

            {editTrip && (
                <EditTripModal
                    trip={editTrip}
                    isOpen={!!editTrip}
                    onClose={() => setEditTrip(null)}
                    onSaved={handleEditSaved}
                />
            )}

            {deleteTrip && (
                <DeleteTripConfirmModal
                    trip={deleteTrip}
                    isOpen={!!deleteTrip}
                    onClose={() => setDeleteTrip(null)}
                    onDeleted={handleDeleteConfirmed}
                />
            )}
        </div>
    );
}
