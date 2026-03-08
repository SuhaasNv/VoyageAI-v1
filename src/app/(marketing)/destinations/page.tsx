import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Globe, Search, Star } from "lucide-react";

export const metadata = {
    title: "100M Destinations | VoyageAI",
    description: "Explore millions of destinations worldwide with AI-powered discovery and recommendations.",
};

export default function DestinationsPage() {
    return (
        <>
            <PageHero
                title="100M Destinations"
                subtitle="Explore the world with AI-powered discovery across cities, regions, and hidden gems."
            />
            <PageContent>
                <p>
                    VoyageAI connects to rich destination data from Google Places, OpenStreetMap, and curated travel sources. Whether you&apos;re planning a weekend in Paris or a month in Southeast Asia, the AI has the context to suggest the right spots.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Globe,
                            title: "Global Coverage",
                            desc: "From major cities to remote villages, our data covers accommodations, restaurants, attractions, and transit options worldwide.",
                        },
                        {
                            icon: Search,
                            title: "Semantic Search",
                            desc: "Ask in natural language: \"best tacos in CDMX\" or \"quiet beaches in Bali.\" The AI understands intent and returns relevant results.",
                        },
                        {
                            icon: Star,
                            title: "Curated & Fresh",
                            desc: "Combines user reviews, opening hours, and real-time data. The AI filters out closed or low-quality venues so you get the best options.",
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
