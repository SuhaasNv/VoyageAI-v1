import { PageHero } from "@/components/marketing/PageHero";
import { PageContent } from "@/components/marketing/PageContent";
import { MapPin, Calendar, CreditCard, MessageCircle } from "lucide-react";

export const metadata = {
    title: "Integrations | VoyageAI",
    description: "Connect VoyageAI with your favorite travel tools, calendars, and payment providers for seamless trip planning.",
};

export default function IntegrationsPage() {
    return (
        <>
            <PageHero
                title="Integrations"
                subtitle="Connect VoyageAI with your favorite tools and services for a seamless travel planning experience."
            />
            <PageContent>
                <p>
                    VoyageAI integrates with leading travel and productivity platforms so you can plan, book, and manage trips without leaving the app.
                </p>
                <div className="grid gap-6 mt-8 sm:grid-cols-2">
                    {[
                        {
                            icon: MapPin,
                            title: "Mapbox & Google Places",
                            desc: "Real-time maps, 3D terrain, and rich destination data for accurate itineraries and location-aware suggestions.",
                        },
                        {
                            icon: Calendar,
                            title: "Calendar Sync",
                            desc: "Sync your trips with Google Calendar, Apple Calendar, or Outlook. Never double-book again.",
                        },
                        {
                            icon: CreditCard,
                            title: "Budget & Payments",
                            desc: "Track spending and connect with your preferred payment providers for seamless expense management.",
                        },
                        {
                            icon: MessageCircle,
                            title: "Chat & Notifications",
                            desc: "Get trip updates via Slack, email, or push notifications. Stay informed wherever you are.",
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
                <p className="mt-10 text-slate-500 text-sm">
                    More integrations are coming soon. Have a suggestion?{" "}
                    <a href="/contact" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        Get in touch
                    </a>
                    .
                </p>
            </PageContent>
        </>
    );
}
