"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

export function Testimonials() {
    return (
        <section className="relative py-24 px-6 lg:px-12 bg-[#0A0D12]">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
                    <div>
                        <div className="inline-block px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 font-medium mb-6">
                            Testimonials
                        </div>
                        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white leading-tight">
                            Loved by Explorers<br />Worldwide
                        </h2>
                    </div>
                    <p className="text-sm text-slate-400 max-w-sm">
                        Discover how our AI powered planner has transformed the way travelers explore the world
                        — from seamless itineraries to stress-free adventures.
                    </p>
                </div>

                {/* Masonry or Grid Layout for Testimonials */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Col 1 */}
                    <div className="flex flex-col gap-6">
                        <MotionDiv
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="glass-card p-6 flex flex-col gap-6 bg-gradient-to-br from-white/[0.08] to-transparent"
                        >
                            <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/5 w-fit">
                                <div className="flex -space-x-2">
                                    <Image src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" alt="avatar" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-[#10141a] object-cover" />
                                    <Image src="https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=100&q=80" alt="avatar" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-[#10141a] object-cover" />
                                    <Image src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80" alt="avatar" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-[#10141a] object-cover" />
                                </div>
                                <span className="text-xs font-semibold text-white">12M+ travelers</span>
                            </div>

                            <div className="flex items-center gap-3">
                                <Image src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" alt="author" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                                <div>
                                    <h4 className="text-sm font-medium text-white">Sophia & Liam</h4>
                                    <p className="text-[10px] text-slate-500">Honeymoon Travelers</p>
                                </div>
                            </div>

                            <div className="h-24 rounded-xl overflow-hidden relative">
                                <Image src="https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=2000&q=80" alt="Traveler with backpack" fill className="object-cover" />
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed">
                                "Our AI Travel Planner made my honeymoon trip flawless! It even adjusted our schedule when it started raining."
                            </p>
                        </MotionDiv>
                    </div>

                    {/* Col 2 */}
                    <div className="flex flex-col gap-6">
                        <MotionDiv
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="glass-card p-6 flex flex-col gap-6 bg-gradient-to-br from-white/[0.08] to-transparent h-full"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Image src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80" alt="author" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                                <div>
                                    <h4 className="text-sm font-medium text-white">Dianne Russell</h4>
                                    <p className="text-[10px] text-slate-500">Family Traveler</p>
                                </div>
                            </div>

                            <div className="h-32 rounded-xl overflow-hidden relative">
                                <Image src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2000&q=80" alt="Family traveler" fill className="object-cover" />
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed">
                                "Planning a family trip can be stressful, but the AI made it effortless. It created a balanced plan with kid-friendly activities and enough downtime."
                            </p>

                            <div className="mt-auto">
                                <button className="w-full py-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white transition-colors flex items-center justify-center gap-2">
                                    ✦ View All <ArrowUpRight className="w-3 h-3" />
                                </button>
                            </div>
                        </MotionDiv>
                    </div>

                    {/* Col 3 */}
                    <div className="flex flex-col gap-6">
                        <MotionDiv
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="glass-card p-6 flex flex-col gap-6 bg-gradient-to-br from-white/[0.08] to-transparent"
                        >
                            <div className="flex items-center gap-3">
                                <Image src="https://images.unsplash.com/photo-1598550874175-4d0ef436c909?auto=format&fit=crop&w=100&q=80" alt="author" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                                <div>
                                    <h4 className="text-sm font-medium text-white">Annette Black</h4>
                                    <p className="text-[10px] text-slate-500">Backpacker</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 h-48">
                                <div className="relative w-full h-full"><Image src="https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1000&q=80" alt="Backpacker collage" fill className="object-cover rounded-xl" /></div>
                                <div className="relative w-full h-full"><Image src="https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&w=1000&q=80" alt="Backpacker collage" fill className="object-cover rounded-xl" /></div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed">
                                "As a solo traveler, I was truly amazed by how the AI uncovered hidden coffee shops, charming local spots, and unique experiences I would have never found on my own."
                            </p>

                            <div className="flex gap-2 justify-center mt-2">
                                <span className="w-2 h-2 rounded-full bg-white"></span>
                                <span className="w-2 h-2 rounded-full bg-white/20"></span>
                                <span className="w-2 h-2 rounded-full bg-white/20"></span>
                                <span className="w-2 h-2 rounded-full bg-white/20"></span>
                            </div>
                        </MotionDiv>
                    </div>

                </div>
            </div>
        </section>
    );
}
