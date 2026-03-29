"use client";

import Image from "next/image";
import {
    ArrowDown,
    ArrowUp,
    Clock,
    MapPinned,
    Sparkles,
    Users,
    type LucideIcon,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { cn } from "@/lib/utils";

type StatItem = {
    percentage: string;
    label: string;
    isIncrease: boolean;
    Icon: LucideIcon;
};

const STATS: StatItem[] = [
    {
        percentage: "60%",
        label: "less time on trip prep",
        isIncrease: true,
        Icon: Clock,
    },
    {
        percentage: "40%",
        label: "fewer last-minute changes",
        isIncrease: true,
        Icon: MapPinned,
    },
    {
        percentage: "3×",
        label: "more stops per journey",
        isIncrease: true,
        Icon: Users,
    },
    {
        percentage: "94%",
        label: "would plan again with AI",
        isIncrease: true,
        Icon: Sparkles,
    },
];

const AVATAR =
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80";
const AVATAR2 =
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80";

function InlineFaceTooltip({
    src,
    alt,
    quote,
    name,
    sizeClass,
}: {
    src: string;
    alt: string;
    quote: string;
    name: string;
    sizeClass: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-block mx-2 align-middle cursor-default">
                    <span
                        className={cn(
                            "relative block overflow-hidden rounded-full border-2 border-white/25 bg-white/5",
                            "origin-center transition-all duration-300 ease-out",
                            "md:hover:scale-110 hover:border-white/50",
                            sizeClass
                        )}
                    >
                        <Image
                            src={src}
                            alt={alt}
                            width={160}
                            height={160}
                            className="h-full w-full object-cover"
                            sizes="144px"
                        />
                    </span>
                </span>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                className="max-w-xs border-white/10 bg-[#151922] text-white"
            >
                <p className="mb-2 text-sm text-slate-300">&ldquo;{quote}&rdquo;</p>
                <p className="text-sm font-medium text-white">{name}</p>
            </TooltipContent>
        </Tooltip>
    );
}

export default function Testimonial1() {
    return (
        <section className="relative w-full bg-[#0A0D12] py-20 md:py-24 px-4 md:px-8 lg:px-16">
            <TooltipProvider>
                <div className="mx-auto max-w-6xl">
                    <div className="mb-10 flex justify-center">
                        <div className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-slate-300">
                            Our community
                        </div>
                    </div>

                    <div className="relative mx-auto max-w-screen-xl text-center text-white">
                        <h2 className="text-2xl font-semibold leading-tight text-white md:text-3xl lg:text-5xl">
                            We make it easy for
                            <InlineFaceTooltip
                                src={AVATAR}
                                alt="Traveler portrait"
                                quote="VoyageAI turned a messy group chat into a real itinerary. We actually stuck to the plan."
                                name="Marcus Chen"
                                sizeClass="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16"
                            />
                            travelers and
                        </h2>

                        <h2 className="text-2xl font-semibold leading-tight text-white md:text-3xl lg:text-5xl">
                            their
                            <InlineFaceTooltip
                                src={AVATAR2}
                                alt="Traveler portrait"
                                quote="I love how it balances must-sees with downtime — it feels like a human planned it."
                                name="Elena Ruiz"
                                sizeClass="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16"
                            />
                            crews to plan, adapt, and
                        </h2>

                        <h2 className="text-2xl font-bold leading-tight text-slate-100 md:text-3xl lg:text-5xl">
                            enjoy every itinerary
                        </h2>
                    </div>

                    <div className="mx-auto mt-10 grid w-full grid-cols-2 gap-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 sm:flex sm:gap-8 sm:px-8">
                        {STATS.map((stat, index) => {
                            const IconRow = stat.Icon;
                            return (
                                <div
                                    key={stat.label}
                                    className="relative flex flex-1 flex-col gap-4 pl-6 sm:pl-10"
                                >
                                    {index !== 0 && (
                                        <div
                                            className="absolute left-0 top-1/2 hidden h-9 w-px -translate-y-1/2 border-l border-dashed border-white/15 sm:block"
                                            aria-hidden
                                        />
                                    )}
                                    <div className="group relative flex min-h-[4.5rem] w-full flex-col items-center justify-center">
                                        <div className="flex w-[85%] translate-y-0 items-center justify-center opacity-100 transition-all duration-300 ease-out group-hover:-translate-y-10 group-hover:opacity-0">
                                            <IconRow
                                                className="h-10 w-10 text-slate-400 md:h-12 md:w-12"
                                                strokeWidth={1.25}
                                            />
                                        </div>
                                        <div className="absolute left-0 top-8 flex w-full flex-col items-center justify-center opacity-0 transition-all duration-300 ease-out group-hover:-top-1 group-hover:opacity-100">
                                            <div className="flex items-center justify-center gap-2">
                                                {stat.isIncrease ? (
                                                    <ArrowUp className="h-4 w-4 text-emerald-400 md:h-6 md:w-6" />
                                                ) : (
                                                    <ArrowDown className="h-4 w-4 text-slate-400 md:h-6 md:w-6" />
                                                )}
                                                <span className="text-2xl font-semibold text-white md:text-4xl">
                                                    {stat.percentage}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-center text-xs capitalize text-slate-400 md:text-sm">
                                                {stat.label}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </TooltipProvider>
        </section>
    );
}
