import { Sparkles, MapPin } from "lucide-react";

export function AISuggestionsCard() {
    const suggestions = [
        {
            id: "s1",
            title: "Optimize Tokyo Itinerary",
            description: "Heavy walking on Day 3",
            action: "Review",
            tag: "Alert",
            image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=200&q=80"
        },
        {
            id: "s2",
            title: "Price Drop: flights to Reykjavik",
            description: "Dropped by $120 for your dates",
            action: "View",
            tag: "Savings",
            image: "https://images.unsplash.com/photo-1504826260979-242151ce5d22?auto=format&fit=crop&w=200&q=80"
        },
        {
            id: "s3",
            title: "Paris forecast: rain next week",
            description: "Add umbrella to packing list",
            action: "Add",
            tag: "Weather",
            image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=200&q=80"
        }
    ];

    return (
        <div className="min-h-[280px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl transition-all hover:border-white/10">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#10B981]" />
                    Suggestions
                </h2>
                <button className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors">
                    View all
                </button>
            </div>

            <div className="flex flex-col gap-5">
                {suggestions.map((suggestion) => (
                    <div
                        key={suggestion.id}
                        className="group flex items-center gap-4 cursor-pointer"
                    >
                        <div className="relative w-20 h-16 rounded-xl overflow-hidden shrink-0">
                            <img src={suggestion.image} className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500" alt={suggestion.title} />
                        </div>
                        <div className="flex flex-col justify-center overflow-hidden flex-1">
                            <h4 className="text-sm font-bold text-white truncate transition-colors group-hover:text-[#10B981]">{suggestion.title}</h4>
                            <div className="flex items-center gap-1 text-xs text-zinc-500 font-medium mt-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{suggestion.description}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-bold text-white bg-[#10B981] px-1.5 py-0.5 rounded-sm uppercase tracking-wider">{suggestion.tag}</span>
                                <span className="text-[10px] text-zinc-400 font-semibold">• {suggestion.action}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
