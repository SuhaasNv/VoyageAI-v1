"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Minus } from "lucide-react";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

const AnimatePresence = dynamic(
    () => import("framer-motion").then((m) => m.AnimatePresence),
    { ssr: false }
);

const faqs = [
    {
        question: "What is an AI Travel Planner?",
        answer: "VoyageAI uses AI to turn a plain-language prompt — like \"5 days in Kyoto, mid-budget, cultural focus\" — into a detailed day-by-day itinerary with activities, timings, and a live map. You can then chat with the AI, reoptimize, and track your budget, all in one place."
    },
    {
        question: "Can I edit the itinerary after it's created?",
        answer: "Yes. You can adjust activities, swap destinations, and reorder days directly in the trip view. Hitting \"Reoptimize\" asks the AI to rework your plan around the changes while keeping the rest of your trip intact."
    },
    {
        question: "How does it work?",
        answer: "Describe your trip in plain language or use the quick-start chips on the home page. VoyageAI's AI pipeline researches activities, groups them by location and time, and builds a structured itinerary. You can also upload a flight PDF ticket and the app will auto-create a trip from your booking details."
    },
    {
        question: "Can I share my trip with others?",
        answer: "Yes — every trip has a shareable public link you can send to friends or family. They can view the full itinerary without needing an account. You can revoke the link at any time from the trip settings."
    },
    {
        question: "What other features are included?",
        answer: "Beyond itinerary creation, VoyageAI includes an AI packing list, a trip simulation (preview weather, costs, and alternatives), a side-by-side trip comparison tool, an interactive Mapbox map with route optimization, and a Travel DNA onboarding flow so the AI learns your pace, style, and budget preferences."
    }
];

export function FAQ() {
    const [openIndex, setOpenIndex] = useState<number>(1); // Open the second one by default as in the design

    return (
        <section className="py-24 px-6 lg:px-12 bg-[#0A0D12]">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-6">
                        Common Questions from<br />Smart Travelers
                    </h2>
                    <p className="text-slate-400 text-sm md:text-base">
                        Discover how our AI Travel Planner helps you create personalized trips,<br className="hidden md:block" />
                        adjust plans instantly, and explore with confidence.
                    </p>
                </div>

                <div className="space-y-4">
                    {faqs.map((faq, index) => {
                        const isOpen = index === openIndex;

                        return (
                            <div
                                key={index}
                                className={`rounded-2xl border transition-colors duration-300 ${isOpen ? "bg-[#1A202A] border-white/10" : "bg-transparent border-white/5 hover:border-white/10"
                                    }`}
                            >
                                <button
                                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                                    className="w-full flex items-center justify-between p-6 text-left"
                                >
                                    <span className={`font-medium ${isOpen ? "text-white" : "text-slate-300"}`}>
                                        {faq.question}
                                    </span>
                                    <span className="text-slate-400 ml-4 flex-shrink-0">
                                        {isOpen ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                    </span>
                                </button>

                                <AnimatePresence>
                                    {isOpen && (
                                        <MotionDiv
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-6 pt-0 text-sm text-slate-400 leading-relaxed">
                                                {faq.answer}
                                            </div>
                                        </MotionDiv>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
