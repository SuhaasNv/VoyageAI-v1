import { PageHero } from "@/components/marketing/PageHero";
import { PageContent } from "@/components/marketing/PageContent";
import { Play, BookOpen, Settings } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Tutorials | VoyageAI",
    description: "Learn how to get the most out of VoyageAI with step-by-step guides and video tutorials.",
};

export default function TutorialsPage() {
    return (
        <>
            <PageHero
                title="Tutorials"
                subtitle="Learn how to plan the perfect trip with VoyageAI."
            />
            <PageContent>
                <p>
                    New to VoyageAI? These tutorials walk you through creating your first trip, customizing your Travel DNA, and using advanced features like AI chat and trip simulation.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Play,
                            title: "Getting Started",
                            desc: "Create an account, set up your Travel DNA, and create your first trip in under 5 minutes.",
                        },
                        {
                            icon: BookOpen,
                            title: "AI Itinerary Generation",
                            desc: "How to generate and refine itineraries. Tips for better prompts and re-optimization.",
                        },
                        {
                            icon: Settings,
                            title: "Budget & Simulation",
                            desc: "Track spending, set budgets, and run trip simulations to estimate costs and weather.",
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
                <p className="mt-10 text-slate-500 text-sm">
                    Video tutorials coming soon. In the meantime,{" "}
                    <Link href="/signup" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        sign up
                    </Link>
                    {" "}and explore—the interface is designed to be intuitive.
                </p>
            </PageContent>
        </>
    );
}
