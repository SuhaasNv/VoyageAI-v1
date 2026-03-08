import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Smartphone, Globe, Monitor } from "lucide-react";

export const metadata = {
    title: "Our Apps | VoyageAI",
    description: "Access VoyageAI on web, iOS, and Android. Plan trips anywhere, anytime.",
};

export default function AppsPage() {
    return (
        <>
            <PageHero
                title="Our Apps"
                subtitle="Plan and manage trips from anywhere—web, iOS, or Android."
            />
            <PageContent>
                <p>
                    VoyageAI is available on the platforms you use most. Start on the web, sync to your phone, and keep your itinerary in your pocket on the go.
                </p>
                <div className="grid gap-6 mt-8 sm:grid-cols-3">
                    {[
                        {
                            icon: Globe,
                            title: "Web",
                            desc: "Full-featured experience in your browser. Create trips, chat with AI, and view maps on any device.",
                        },
                        {
                            icon: Smartphone,
                            title: "Mobile (Coming Soon)",
                            desc: "iOS and Android apps for on-the-go planning. Add activities, check your itinerary, and get AI suggestions from your phone.",
                        },
                        {
                            icon: Monitor,
                            title: "Offline",
                            desc: "Access key trip details offline. Your itinerary is saved locally so you can view it without connectivity.",
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className="p-6 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <Icon className="w-8 h-8 text-indigo-400 mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                            <p className="text-slate-400 text-sm">{desc}</p>
                        </div>
                    ))}
                </div>
            </PageContent>
        </>
    );
}
