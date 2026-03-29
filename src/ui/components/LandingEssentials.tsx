import Link from "next/link";
import {
    Compass,
    Sparkles,
    Heart,
    Dna,
    RefreshCw,
    Globe,
    Search,
    Star,
    Mail,
} from "lucide-react";

const blocks = [
    {
        id: "about" as const,
        title: "About VoyageAI",
        icon: Compass,
        intro:
            "Planning a trip shouldn’t feel like a second job. We combine AI, real-time data, and thoughtful design so you can plan in minutes—not hours.",
        points: [
            {
                icon: Compass,
                h: "Our mission",
                p: "Great travel planning for everyone—first trip or fiftieth. VoyageAI adapts to your style and surfaces the right experiences.",
            },
            {
                icon: Sparkles,
                h: "AI-first",
                p: "Modern models turn your dates, budget, and Travel DNA into itineraries that actually match how you like to move.",
            },
            {
                icon: Heart,
                h: "Built for real trips",
                p: "Create trips, chat for tweaks, track budget, and refine the plan until departure—without tab overload.",
            },
        ],
    },
    {
        id: "how-it-works" as const,
        title: "How it works",
        icon: Dna,
        intro:
            "Tell us who’s traveling and what matters—pace, budget, interests. We generate day-by-day plans you can refine anytime.",
        points: [
            {
                icon: Dna,
                h: "Travel DNA",
                p: "One onboarding pass captures style and constraints so every suggestion stays on-brand for you.",
            },
            {
                icon: Sparkles,
                h: "Smart generation",
                p: "The AI weighs dates, group size, and practical details, grounded in live place data when available.",
            },
            {
                icon: RefreshCw,
                h: "Re-optimize freely",
                p: "Swap a day, add a constraint, or ask for a different vibe—iterate until it feels right.",
            },
        ],
    },
    {
        id: "destinations" as const,
        title: "Destinations",
        icon: Globe,
        intro:
            "From major hubs to quieter corners, we combine broad coverage with natural-language search so you can ask the way you think.",
        points: [
            {
                icon: Globe,
                h: "Global coverage",
                p: "Hotels, food, sights, and transit context across cities and regions you actually want to visit.",
            },
            {
                icon: Search,
                h: "Ask naturally",
                p: "“Best coffee near the museum” or “rainy-day ideas”—intent matters more than perfect keywords.",
            },
            {
                icon: Star,
                h: "Quality-aware",
                p: "We bias toward places that are open, well reviewed, and worth your limited time on the ground.",
            },
        ],
    },
    {
        id: "contact" as const,
        title: "Contact",
        icon: Mail,
        intro:
            "Questions, feedback, or partnership ideas—we read every message. For product help, check the FAQ below first.",
        points: [
            {
                icon: Mail,
                h: "Email us",
                p: "Reach the team directly—we typically reply within a couple of days.",
            },
        ],
        cta: (
            <a
                href="mailto:hello@voyageai.app"
                className="mt-4 inline-flex text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
                hello@voyageai.app
            </a>
        ),
        extra: (
            <p className="mt-4 text-xs text-slate-500">
                Prefer self-serve?{" "}
                <Link href="/#faq" className="text-violet-400/90 hover:text-violet-300 transition-colors">
                    Jump to FAQ
                </Link>
                .
            </p>
        ),
    },
];

export function LandingEssentials() {
    return (
        <section
            aria-labelledby="landing-essentials-heading"
            className="relative border-t border-white/5 bg-[#0A0D12] px-6 py-20 lg:px-12"
        >
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto mb-14 max-w-2xl text-center">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                        <span className="text-xs font-medium text-slate-300">Why VoyageAI</span>
                    </div>
                    <h2
                        id="landing-essentials-heading"
                        className="text-3xl font-bold tracking-tight text-white md:text-4xl"
                    >
                        The essentials, on one page
                    </h2>
                    <p className="mt-3 text-sm text-slate-400 md:text-base">
                        What used to live on separate pages—about, how it works, destinations, and contact—is here in a
                        tighter form.
                    </p>
                </div>

                <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-12 lg:gap-y-14">
                    {blocks.map((block) => {
                        const MainIcon = block.icon;
                        return (
                            <article
                                key={block.id}
                                id={block.id}
                                className="scroll-mt-28 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8"
                            >
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                                        <MainIcon className="h-5 w-5 text-violet-300" strokeWidth={1.75} />
                                    </div>
                                    <h3 className="text-xl font-semibold tracking-tight text-white">{block.title}</h3>
                                </div>
                                <p className="text-sm leading-relaxed text-slate-400">{block.intro}</p>
                                <ul className="mt-6 space-y-4">
                                    {block.points.map((pt) => {
                                        const Pi = pt.icon;
                                        return (
                                            <li key={pt.h} className="flex gap-3">
                                                <Pi className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                                                <div>
                                                    <p className="text-sm font-medium text-white/90">{pt.h}</p>
                                                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{pt.p}</p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {"cta" in block && block.cta}
                                {"extra" in block && block.extra}
                                {block.id === "about" && (
                                    <p className="mt-6 text-xs text-slate-500">
                                        Ready to try it?{" "}
                                        <Link
                                            href="/signup"
                                            className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
                                        >
                                            Sign up free
                                        </Link>
                                        .
                                    </p>
                                )}
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
