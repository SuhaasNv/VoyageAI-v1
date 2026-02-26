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
        answer: "Our AI Travel Planner uses advanced machine learning to analyze your preferences, budget, and travel style to instantly generate comprehensive, personalized itineraries."
    },
    {
        question: "Can I edit the itinerary after it's created?",
        answer: "Yes! You can easily adjust destinations, activities, and timings. The AI will automatically reoptimize your trip plan to fit your new preferences."
    },
    {
        question: "How does it work?",
        answer: "Simply input your destination, travel dates, and interests. Our platform scans millions of data points to curate the perfect daily schedule for you."
    },
    {
        question: "Does it include hotel or flight bookings?",
        answer: "Currently, we provide recommendations and direct links to book your flights and accommodations through our trusted partners, ensuring you get the best rates."
    },
    {
        question: "Can I use it for group trips?",
        answer: "Absolutely. You can invite friends or family to collaborate on the itinerary in real-time, vote on activities, and synchronize on logistics."
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
