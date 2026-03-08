import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Route, Zap, Clock } from "lucide-react";

export const metadata = {
    title: "Smart Routes | VoyageAI",
    description: "AI-powered route optimization that minimizes travel time and maximizes experiences.",
};

export default function SmartRoutesPage() {
    return (
        <>
            <PageHero
                title="Smart Routes"
                subtitle="AI-optimized itineraries that minimize travel time and maximize your experience."
            />
            <PageContent>
                <p>
                    Smart Routes uses AI to analyze your destinations, opening hours, traffic patterns, and your preferences to build the most efficient day-by-day plan.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Route,
                            title: "Optimized Sequencing",
                            desc: "Activities are ordered to reduce backtracking and travel time. Visit nearby spots together and avoid rush-hour bottlenecks.",
                        },
                        {
                            icon: Zap,
                            title: "Real-Time Adjustments",
                            desc: "When plans change, Smart Routes re-optimizes on the fly. Add or remove activities and get an updated sequence instantly.",
                        },
                        {
                            icon: Clock,
                            title: "Time-Aware Planning",
                            desc: "Respects opening hours, meal times, and your preferred pace. No more arriving at closed venues or rushing through meals.",
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
            </PageContent>
        </>
    );
}
