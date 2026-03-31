"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

const MotionH2 = dynamic(
    () => import("framer-motion").then((m) => m.motion.h2),
    { ssr: false }
);

interface StarParticle {
    top: string;
    left: string;
    delay: string;
    duration: string;
    size: string;
}

const STAR_PARTICLES: StarParticle[] = [
    { top: "8%",  left: "12%", delay: "0s",    duration: "3.2s", size: "2px"   },
    { top: "22%", left: "78%", delay: "0.8s",  duration: "2.8s", size: "1.5px" },
    { top: "45%", left: "5%",  delay: "1.5s",  duration: "4s",   size: "2px"   },
    { top: "65%", left: "88%", delay: "0.3s",  duration: "3.5s", size: "1.5px" },
    { top: "78%", left: "35%", delay: "2s",    duration: "2.5s", size: "2px"   },
    { top: "15%", left: "55%", delay: "1.2s",  duration: "3.8s", size: "1.5px" },
    { top: "55%", left: "65%", delay: "0.6s",  duration: "4.2s", size: "2px"   },
    { top: "35%", left: "25%", delay: "1.8s",  duration: "3s",   size: "1.5px" },
    { top: "90%", left: "55%", delay: "0.4s",  duration: "3.6s", size: "2px"   },
    { top: "5%",  left: "92%", delay: "2.2s",  duration: "2.6s", size: "1.5px" },
];

export function CTA() {
    return (
        <section
            id="contact"
            className="relative scroll-mt-28 py-32 px-6 lg:px-12 bg-[#0A0D12] overflow-hidden"
        >
            {/* Aurora animated background */}
            <div className="absolute inset-0 z-0">
                <div
                    className="absolute w-[700px] h-[450px] rounded-full blur-[130px] bg-gradient-to-br from-violet-700 via-indigo-600 to-transparent"
                    style={{ top: '5%', left: '10%', animationName: 'aurora', animationDuration: '14s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationFillMode: 'both', opacity: 0.55 }}
                />
                <div
                    className="absolute w-[550px] h-[380px] rounded-full blur-[110px] bg-gradient-to-br from-fuchsia-700 via-violet-600 to-transparent"
                    style={{ bottom: '5%', right: '8%', animationName: 'aurora', animationDuration: '18s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationDirection: 'reverse', animationFillMode: 'both', opacity: 0.45 }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0A0D12] via-transparent to-[#05080b]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#0A0D12_78%)]" />
            </div>

            {/* Star particles */}
            {STAR_PARTICLES.map((star, i) => (
                <span
                    key={i}
                    aria-hidden
                    className="absolute rounded-full bg-white pointer-events-none z-[1]"
                    style={{
                        top: star.top,
                        left: star.left,
                        width: star.size,
                        height: star.size,
                        animationName: 'star-twinkle',
                        animationDuration: star.duration,
                        animationTimingFunction: 'ease-in-out',
                        animationIterationCount: 'infinite',
                        animationDelay: star.delay,
                        animationFillMode: 'both',
                    }}
                />
            ))}

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
                    <Link href="/signup" className="flex items-center gap-2 mx-auto group w-fit px-8 py-4 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold transition-all duration-200 shadow-[0_0_32px_rgba(124,58,237,0.45)] hover:shadow-[0_0_52px_rgba(124,58,237,0.68)]">
                        Join The Trip <ArrowUpRight className="w-5 h-5 group-hover:rotate-45 transition-transform duration-200" />
                    </Link>
                </MotionDiv>
            </div>
        </section>
    );
}
