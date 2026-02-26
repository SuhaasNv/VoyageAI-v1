import { MapPin, Calendar, CreditCard, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Trip } from "@/lib/api";

interface UpcomingTripsGridProps {
    trips: Trip[];
}

const IMAGES = [
    "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1534430260481-a5bed9db7335?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80"
];

export function UpcomingTripsGrid({ trips }: UpcomingTripsGridProps) {
    return (
        <div className="bg-white/[0.02] backdrop-blur-xl rounded-[2rem] p-6 border border-white/5 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Active Trips</h2>
                    <p className="text-xs text-zinc-500 font-medium">Your upcoming scheduled travels</p>
                </div>
                <button className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/[0.02] border border-white/10 px-3 py-1.5 rounded-full hover:bg-white/5">
                    View all <ChevronRight className="w-3 h-3" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {trips.map((trip, idx) => (
                    <Link
                        href={`/dashboard/trip/${trip.id}`}
                        key={trip.id}
                        className="group flex flex-col gap-4 p-2 rounded-[1.5rem] bg-white/[0.02] border border-white/5 transition-all hover:bg-white/[0.04] hover:border-white/10 hover:shadow-xl"
                    >
                        <div className="relative h-44 rounded-2xl overflow-hidden border border-white/5 mb-1">
                            <Image src={IMAGES[idx % IMAGES.length]} fill className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out" alt={trip.title} />
                            <div className="absolute inset-0 bg-[#0B0F14]/40 mix-blend-multiply pointer-events-none" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14]/90 via-[#0B0F14]/20 to-transparent pointer-events-none" />
                            <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-md text-[10px] font-bold tracking-wider text-white flex items-center gap-1 border border-white/10">
                                <Star className="w-3 h-3 text-[#10B981] fill-current" /> 4.9
                            </div>
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
                ))}

                <button className="flex flex-col items-center justify-center gap-3 bg-white/[0.01] border border-dashed border-white/10 rounded-[1.5rem] transition-all duration-200 ease-out text-zinc-500 hover:text-white hover:bg-white/[0.03] hover:border-[#10B981]/30 group">
                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-[#10B981]/10 group-hover:border-[#10B981]/30 transition-all duration-200">
                        <span className="text-xl font-light group-hover:text-[#10B981] transition-colors">+</span>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">Plan New Trip</span>
                </button>
            </div>
        </div>
    );
}
