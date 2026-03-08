"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
    name: string;
    url: string;
    icon: LucideIcon;
}

interface NavBarProps {
    items: NavItem[];
    className?: string;
}

export function TubelightNavBar({ items, className }: NavBarProps) {
    const [activeTab, setActiveTab] = useState(items[0].name);

    // Sync active tab with current path on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        const path = window.location.pathname;
        const match = items.find((item) => item.url !== "#" && path.startsWith(item.url));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (match) setActiveTab(match.name);
    }, [items]);

    return (
        <div className={cn("flex items-center", className)}>
            <div className="flex items-center gap-1 bg-white/[0.07] border border-white/[0.14] backdrop-blur-lg py-1 px-1 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.name;

                    return (
                        <Link
                            key={item.name}
                            href={item.url}
                            onClick={() => setActiveTab(item.name)}
                            className={cn(
                                "relative cursor-pointer text-sm font-medium px-5 py-2 rounded-full transition-colors duration-200",
                                isActive
                                    ? "text-white"
                                    : "text-white/60 hover:text-white/90",
                            )}
                        >
                            {/* Desktop: text label */}
                            <span className="hidden md:inline relative z-10">{item.name}</span>
                            {/* Mobile: icon only */}
                            <span className="md:hidden relative z-10">
                                <Icon size={16} strokeWidth={2} />
                            </span>

                            {isActive && (
                                <motion.div
                                    layoutId="tubelight-pill"
                                    className="absolute inset-0 rounded-full bg-white/[0.12] border border-white/[0.12] -z-10"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                >
                                    {/* Tube glow — top bar */}
                                    <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[#f48c06] rounded-b-full overflow-visible">
                                        {/* Diffused glow layers */}
                                        <div className="absolute -top-1 -left-3 w-14 h-5 bg-[#f48c06]/25 rounded-full blur-md" />
                                        <div className="absolute -top-0.5 -left-1 w-10 h-4 bg-[#f48c06]/20 rounded-full blur-sm" />
                                        <div className="absolute top-0 left-1 w-6 h-3 bg-[#f48c06]/30 rounded-full blur-[3px]" />
                                    </div>
                                </motion.div>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
