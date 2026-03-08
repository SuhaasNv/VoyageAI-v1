import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import Link from "next/link";

export const metadata = {
    title: "Travel Stories | VoyageAI",
    description: "Inspiring travel stories and trip reports from travelers who used VoyageAI to plan their adventures.",
};

export default function TravelStoriesPage() {
    return (
        <>
            <PageHero
                title="Travel Stories"
                subtitle="Real adventures from travelers who planned with VoyageAI."
            />
            <PageContent>
                <p>
                    Discover how others use VoyageAI to plan trips across the globe. From solo backpackers to family road trips, these stories share tips, itineraries, and lessons learned.
                </p>
                <div className="mt-10 p-8 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-slate-400 mb-4">
                        Travel Stories are coming soon. We&apos;re collecting stories from our early users.
                    </p>
                    <p className="text-sm text-slate-500">
                        Planned a great trip with VoyageAI?{" "}
                        <Link href="/contact" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                            Share your story
                        </Link>
                        .
                    </p>
                </div>
            </PageContent>
        </>
    );
}
