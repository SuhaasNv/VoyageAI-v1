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

export function AISimplifies() {
    return (
        <section className="relative py-24 px-6 lg:px-12 bg-[#0A0D12] overflow-hidden">
            <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#1a2c42] rounded-full blur-[120px] opacity-30" />
            <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#2a3038] rounded-full blur-[100px] opacity-20" />

            <div className="max-w-4xl mx-auto text-center relative z-10 mb-20 mt-10">
                <MotionH2
                    className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] mb-6 text-white"
                >
                    Our AI simplifies every step of<br />travel planning allowing you.
                </MotionH2>

                <MotionDiv
                    className="text-slate-400 max-w-2xl mx-auto text-sm md:text-base mb-10 leading-relaxed"
                >
                    Our AI-driven platform analyzes millions of data points to craft personalized itineraries that
                    fit your time budget and interests making travel planning effortless and accurate.
                </MotionDiv>

                <MotionDiv
                    className="flex items-center justify-center gap-4"
                >
                    <button className="flex items-center gap-2 group px-6 py-3 rounded-full bg-white text-[#10141a] font-medium hover:bg-slate-200 transition-colors">
                        View All <ArrowUpRight className="w-4 h-4" />
                    </button>
                    <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Learn More
                    </button>
                </MotionDiv>

                {/* Floating Avatars (absolute positioned around the text) */}
                <div className="hidden lg:block">
                    <MotionDiv animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute top-10 left-10 w-12 h-12 rounded-full border-2 border-[#10141a] overflow-hidden z-20"><Image src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80" alt="avatar" fill className="object-cover" /></MotionDiv>
                    <MotionDiv animate={{ y: [0, 15, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute top-32 left-32 w-10 h-10 rounded-full border-2 border-[#10141a] overflow-hidden z-20"><Image src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80" alt="avatar" fill className="object-cover" /></MotionDiv>
                    <MotionDiv animate={{ y: [0, -15, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-10 left-48 w-14 h-14 rounded-full border-2 border-[#10141a] overflow-hidden z-20"><Image src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" alt="avatar" fill className="object-cover" /></MotionDiv>
                    <MotionDiv animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} className="absolute top-20 right-20 w-12 h-12 rounded-full border-2 border-[#10141a] overflow-hidden z-20"><Image src="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80" alt="avatar" fill className="object-cover" /></MotionDiv>
                    <MotionDiv animate={{ y: [0, 10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} className="absolute bottom-20 right-32 w-10 h-10 rounded-full border-2 border-[#10141a] overflow-hidden z-20"><Image src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80" alt="avatar" fill className="object-cover" /></MotionDiv>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10 max-w-7xl mx-auto">
                <MotionDiv
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative h-[450px] rounded-[2rem] overflow-hidden group"
                >
                    <Image src="https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=2000&q=80" fill className="absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105" alt="Rainy European street" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute top-4 left-4 p-2 bg-white/10 backdrop-blur-md rounded-full">
                        <span className="text-white">✦</span>
                    </div>
                </MotionDiv>

                <MotionDiv
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="relative h-[450px] lg:-translate-y-8 rounded-[2rem] overflow-hidden group lg:col-span-2"
                >
                    <Image src="https://images.unsplash.com/photo-1470071131384-001b85755536?auto=format&fit=crop&w=2000&q=80" fill className="absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105" alt="Misty mountain temple" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-semibold text-white tracking-widest">LIVE</span>
                    </div>
                </MotionDiv>

                <MotionDiv
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="relative h-[450px] rounded-[2rem] overflow-hidden group"
                >
                    <Image src="https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=2000&q=80" fill className="absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105" alt="Dense urban skyline" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute top-4 left-4 p-2 bg-white/10 backdrop-blur-md rounded-full">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </div>
                </MotionDiv>
            </div>
        </section>
    );
}
