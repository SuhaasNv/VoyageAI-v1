import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Compass, Sparkles, Heart } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "About | VoyageAI",
    description: "VoyageAI is building the future of travel planning with AI-powered itineraries and personalized recommendations.",
};

export default function AboutPage() {
    return (
        <>
            <PageHero
                title="About VoyageAI"
                subtitle="We're making travel planning smarter, simpler, and more personal."
            />
            <PageContent>
                <p>
                    VoyageAI was born from a simple frustration: planning a trip shouldn&apos;t feel like a second job. We combine AI, real-time data, and thoughtful design to help you plan the perfect trip in minutes—not hours.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Compass,
                            title: "Our Mission",
                            desc: "To democratize great travel planning. Whether you're a first-time traveler or a seasoned explorer, VoyageAI adapts to your style and helps you discover the best experiences.",
                        },
                        {
                            icon: Sparkles,
                            title: "AI-First",
                            desc: "We use state-of-the-art language models (Groq LLaMA-3.3, Google Gemini) to generate personalized itineraries. Your Travel DNA—preferences, pace, budget—shapes every suggestion.",
                        },
                        {
                            icon: Heart,
                            title: "Built for Travelers",
                            desc: "Every feature is designed around real travel workflows: create a trip, generate an itinerary, chat with AI for suggestions, track your budget, and simulate your journey before you go.",
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className="flex gap-4 p-6 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <Icon className="w-8 h-8 text-indigo-400 shrink-0" />
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                                <p className="text-slate-400 text-sm">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-10">
                    Ready to plan your next adventure?{" "}
                    <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        Get started for free
                    </Link>
                    .
                </p>
            </PageContent>
        </>
    );
}
