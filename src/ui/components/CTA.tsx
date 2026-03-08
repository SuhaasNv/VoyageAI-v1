"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

const MotionH2 = dynamic(
    () => import("framer-motion").then((m) => m.motion.h2),
    { ssr: false }
);

export function CTA() {
    return (
        <section className="relative py-32 px-6 lg:px-12 bg-[#0A0D12] overflow-hidden">
            {/* Background Image Setup */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-b from-[#0A0D12] via-transparent to-[#05080b] z-10" />
                <Image
                    src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=2070&q=80"
                    alt="Dark minimalist map graphic"
                    fill
                    className="object-cover opacity-60 mix-blend-luminosity"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0A0D12_80%)] z-10" />
            </div>

            <div className="relative z-20 max-w-2xl mx-auto text-center">
                <MotionH2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] text-white mb-6"
                >
                    Plan Your Dream Trip<br />with AI in Seconds
                </MotionH2>

                <MotionDiv
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="text-slate-400 text-sm md:text-base leading-relaxed mb-10 max-w-xl mx-auto"
                >
                    Get personalized itineraries, smart recommendations, and
                    seamless travel planning all powered by AI.
                </MotionDiv>

                <MotionDiv
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                >
                    <button className="flex items-center gap-2 mx-auto group px-8 py-4 rounded-full bg-white text-[#10141a] font-medium hover:bg-slate-200 transition-colors">
                        Join The Trip <ArrowUpRight className="w-5 h-5 group-hover:rotate-45 transition-transform" />
                    </button>
                </MotionDiv>
            </div>
        </section>
    );
}
