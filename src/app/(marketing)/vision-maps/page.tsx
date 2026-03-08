import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Map, Layers, Compass } from "lucide-react";

export const metadata = {
    title: "Vision Maps | VoyageAI",
    description: "Interactive maps with 3D terrain, custom styling, and your itinerary overlaid for visual trip planning.",
};

export default function VisionMapsPage() {
    return (
        <>
            <PageHero
                title="Vision Maps"
                subtitle="Interactive maps that bring your itinerary to life with 3D terrain and custom styling."
            />
            <PageContent>
                <p>
                    Vision Maps use Mapbox GL JS to render your trip on beautiful, customizable maps. See your day-by-day route, explore destinations in 3D, and get a spatial understanding of your plan.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Map,
                            title: "Itinerary Overlay",
                            desc: "Your activities appear as pins on the map. Click to see details, reorder by drag-and-drop, or add new stops. The map updates in real time.",
                        },
                        {
                            icon: Layers,
                            title: "3D Terrain & Custom Styles",
                            desc: "Toggle 3D terrain for mountainous regions. Choose from light, dark, or satellite styles to match your preference.",
                        },
                        {
                            icon: Compass,
                            title: "Explore Before You Go",
                            desc: "Pan and zoom to discover neighborhoods, nearby attractions, and transit options. Make informed decisions before you arrive.",
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
                    Mapbox provides 50,000 map loads per month on the free tier—plenty for most travelers.
                </p>
            </PageContent>
        </>
    );
}
