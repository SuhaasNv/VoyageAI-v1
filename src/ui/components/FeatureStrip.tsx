"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
    Map,
    MessageSquare,
    Luggage,
    FileText,
    GitCompare,
    Dna,
} from "lucide-react";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

const FEATURES = [
    {
        icon: Map,
        label: "Interactive Map",
        description: "Live Mapbox map with route optimization and 3-D terrain.",
        href: "/vision-maps",
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
    },
    {
        icon: MessageSquare,
        label: "AI Trip Chat",
        description: "Ask questions, reoptimize, and get suggestions in context.",
        href: "/#how-it-works",
        color: "text-sky-400",
        bg: "bg-sky-500/10",
        border: "border-sky-500/20",
    },
    {
        icon: Luggage,
        label: "Smart Packing",
        description: "AI-generated packing lists tailored to your destination and duration.",
        href: "/#how-it-works",
        color: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
    },
    {
        icon: FileText,
        label: "Ticket Import",
        description: "Upload a flight PDF and your trip is created automatically.",
        href: "/#how-it-works",
        color: "text-violet-400",
        bg: "bg-violet-500/10",
        border: "border-violet-500/20",
    },
    {
        icon: GitCompare,
        label: "Trip Compare",
        description: "Side-by-side AI analysis of two itineraries to pick the best fit.",
        href: "/smart-routes",
        color: "text-rose-400",
        bg: "bg-rose-500/10",
        border: "border-rose-500/20",
    },
    {
        icon: Dna,
        label: "Travel DNA",
        description: "One-time onboarding captures your pace, style, and budget preferences.",
        href: "/#about",
        color: "text-teal-400",
        bg: "bg-teal-500/10",
        border: "border-teal-500/20",
    },
] as const;

export function FeatureStrip() {
    return (
        <section className="relative py-20 px-6 lg:px-12 bg-[#0A0D12] overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-14">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f48c06]" />
                        <span className="text-xs font-medium text-slate-300">Everything in one place</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                        More than just an itinerary
                    </h2>
                    <p className="mt-4 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                        VoyageAI ships a full travel toolkit — from first idea to day-of navigation.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FEATURES.map((feature, i) => {
                        const { icon: Icon } = feature;
                        return (
                            <MotionDiv
                                key={feature.label}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.06 }}
                            >
                                <Link
                                    href={feature.href}
                                    className="group flex items-start gap-4 p-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.055] hover:border-white/[0.14] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                                >
                                    <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${feature.bg} ${feature.border}`}>
                                        <Icon className={`w-5 h-5 ${feature.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white group-hover:text-white/90 mb-1">
                                            {feature.label}
                                        </p>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </Link>
                            </MotionDiv>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
