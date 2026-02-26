"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight, MapPin, Mic, Send, Navigation, Heart, Maximize2 } from "lucide-react";
import Image from "next/image";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

export function Hero() {
    return (
        <section className="relative min-h-screen pt-24 pb-12 flex flex-col justify-end px-6 lg:px-12 overflow-hidden bg-[#10141a]">
            {/* Background Image / Gradient - Represents the landscape */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-[#10141a] via-[#10141a]/60 to-transparent z-10" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,80,104,0.4),_transparent_40%)] z-10" />
                <Image
                    src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2070&q=80"
                    alt="Cinematic cliff landscape"
                    fill
                    className="object-cover opacity-60 mix-blend-luminosity"
                    priority
                />
                {/* Person standing mock - simple silhouette layer or central focal point could go here */}
            </div>

            <div className="relative z-20 w-full h-full flex flex-col justify-between mt-20">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center h-full">
                    {/* Left Text */}
                    <MotionDiv
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="flex flex-col gap-6"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 w-fit backdrop-blur-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#f48c06]" />
                            <span className="text-xs font-medium text-slate-200">Cutting-edge AI trip designs</span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.1] text-white">
                            Smart & Simple <br />
                            Trip Planning
                        </h1>

                        <button className="flex items-center gap-2 group w-fit mt-4 px-6 py-3 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 transition-all backdrop-blur-md">
                            <span className="text-sm font-medium">Plan Your Trip</span>
                            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                        </button>
                    </MotionDiv>

                    {/* Right Cards */}
                    <div className="relative h-full hidden lg:flex items-center justify-end">
                        <MotionDiv
                            initial={{ opacity: 0, scale: 0.9, x: 50 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className="glass-card p-4 w-72 rounded-[2rem] overflow-hidden rotate-2 hover:rotate-0 transition-transform duration-500"
                        >
                            <div className="relative h-48 rounded-2xl overflow-hidden mb-4">
                                <Image
                                    src="https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=800&q=80"
                                    alt="Modern city at dusk"
                                    fill
                                    className="object-cover"
                                />
                                <div className="absolute top-3 right-3 p-1.5 bg-white/20 backdrop-blur-md rounded-full">
                                    <Maximize2 className="w-4 h-4 text-white" />
                                </div>
                            </div>

                            <h3 className="text-lg font-medium text-white mb-2">Bali Slow Travel</h3>

                            <div className="flex flex-wrap gap-2 mb-4">
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">7 days</span>
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">Nature escape</span>
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">Wellness</span>
                            </div>

                            <p className="text-xs text-slate-400 mb-4 line-clamp-2">A mindful itinerary blending rice terrace walks, yoga, and authentic Balinese healing.</p>

                            <div className="flex gap-2">
                                <button className="flex-1 py-2 rounded-full border border-white/20 text-xs font-medium hover:bg-white/10 transition-colors">View Details</button>
                                <button className="px-3 py-2 rounded-full bg-[#f48c06] text-white hover:bg-[#e85d04] transition-colors"><Heart className="w-4 h-4" /></button>
                            </div>
                        </MotionDiv>
                    </div>
                </div>

                {/* Bottom Elements: Flight card, Search Input, Profile Access */}
                <MotionDiv
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end mt-20 pb-8"
                >
                    {/* Flight Card */}
                    <div className="glass p-4 rounded-2xl w-fit">
                        <div className="text-xs text-slate-400 mb-2">Sun 09</div>
                        <div className="flex items-center gap-6">
                            <div>
                                <div className="text-lg font-semibold">DUB</div>
                                <div className="text-xs text-slate-400">6:10 AM</div>
                            </div>

                            <div className="flex flex-col items-center justify-center relative w-16">
                                <div className="text-[10px] text-slate-500 mb-1">1h 34 min</div>
                                <div className="w-full h-[1px] bg-white/20 relative">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 rotate-90"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.7l-1.2 3.3c-.2.5.1 1 .6 1.1l6.1 1.7L7 15l-3.2-.8c-.4-.1-.8.2-1 .6L1.5 17c-.2.4 0 .9.5 1.1L6 19l4 4c.2.5.7.7 1.1.5l2.2-1.3c.4-.2.7-.6.6-1L13 19l1.7-2.2 6.5.9c.5.1 1-.2 1.1-.6l1.2-3.3c.2-.5-.1-.9-.6-1.1L17.8 19.2Z" /></svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-lg font-semibold">LON</div>
                                <div className="text-xs text-slate-400">9:25 AM</div>
                            </div>
                        </div>
                        <div className="mt-3 text-xl font-bold">$220</div>
                    </div>

                    {/* Prompt Bar */}
                    <div className="col-span-1 lg:col-span-1 glass rounded-[2rem] p-2 max-w-xl mx-auto w-full">
                        <div className="flex items-center bg-white/5 rounded-full px-4 py-3">
                            <span className="text-slate-400 mr-2 text-xl leading-none">+</span>
                            <input
                                type="text"
                                placeholder="Ask Anything..."
                                className="bg-transparent border-none outline-none flex-1 text-sm text-white placeholder:text-slate-500"
                            />
                            <div className="flex items-center gap-2">
                                <button className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"><Mic className="w-4 h-4" /></button>
                                <button className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"><span className="text-xs font-bold leading-none select-none">···</span></button>
                                <button className="p-2 rounded-full bg-white text-[#10141a] hover:bg-slate-200 transition-colors"><ArrowUpRight className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2 mt-3 p-1">
                            <button className="text-[10px] px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-colors flex items-center gap-1.5 whitespace-nowrap"><span className="text-[#f48c06]">✦</span> Inspire me where to go</button>
                            <button className="text-[10px] px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-colors flex items-center gap-1.5 whitespace-nowrap"><span className="text-[#f48c06]">✦</span> Create new Trip</button>
                            <button className="text-[10px] px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-colors flex items-center gap-1.5 whitespace-nowrap"><span className="text-[#f48c06]">✦</span> Find family hotels in Dubai</button>
                        </div>
                    </div>

                    {/* Right Accents */}
                    <div className="flex flex-col items-end text-right">
                        <div className="flex -space-x-3 mb-3">
                            <Image src="https://i.pravatar.cc/100?img=33" alt="user" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-[#10141a] z-20" />
                            <Image src="https://i.pravatar.cc/100?img=47" alt="user" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-[#10141a] z-10" />
                            <div className="w-8 h-8 rounded-full border-2 border-[#10141a] bg-[#f48c06] z-0 flex items-center justify-center text-[10px] font-medium">+</div>
                        </div>
                        <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
                            With Worldwide Access, We Bring Our Top-Rated Travel Planning Solutions to Explorers Across the Globe.
                        </p>
                    </div>
                </MotionDiv>
            </div>
        </section>
    );
}
