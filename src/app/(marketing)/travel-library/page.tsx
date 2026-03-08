import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { BookOpen, FileText, Map } from "lucide-react";

export const metadata = {
    title: "Travel Library | VoyageAI",
    description: "Guides, tips, and resources to help you plan better trips.",
};

export default function TravelLibraryPage() {
    return (
        <>
            <PageHero
                title="Travel Library"
                subtitle="Guides, tips, and resources to help you plan better trips."
            />
            <PageContent>
                <p>
                    The Travel Library is your hub for destination guides, packing tips, budget advice, and best practices. Everything you need to plan smarter and travel with confidence.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: BookOpen,
                            title: "Destination Guides",
                            desc: "In-depth guides for popular destinations. What to see, when to go, and how to get around—curated by AI and verified by travelers.",
                        },
                        {
                            icon: FileText,
                            title: "Packing Lists",
                            desc: "AI-generated packing lists based on your trip type, destination, and duration. Never forget essentials again.",
                        },
                        {
                            icon: Map,
                            title: "Budget Templates",
                            desc: "Sample budgets for different trip styles—from backpacking to luxury. Use them as starting points for your own plans.",
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
