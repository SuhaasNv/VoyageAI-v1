"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Settings, LogOut, User } from "lucide-react";
import { DashboardSidebarFooter } from "./DashboardSidebarFooter";

interface MobileUserMenuProps {
    user: {
        name: string | null;
        image: string | null;
        email: string;
    };
}

export function MobileUserMenu({ user }: MobileUserMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-10 h-10 rounded-full overflow-hidden shrink-0 focus:outline-none active:scale-90 transition-all duration-300 ring-2 ${isOpen ? 'ring-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'ring-white/10 shadow-lg'}`}
            >
                {user.image ? (
                    <img src={user.image} alt={user.name ?? "User"} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm">
                        {user.name?.[0].toUpperCase() || "V"}
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-60 bg-[#0B0F14]/90 backdrop-blur-3xl border border-white/10 rounded-[1.75rem] shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_1px_rgba(255,255,255,0.1)] overflow-hidden z-[100] animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 ease-out">
                    {/* User Profile Info */}
                    <div className="px-5 py-4 border-b border-white/[0.05] bg-white/[0.02]">
                        <p className="text-sm font-bold text-white tracking-tight truncate">{user.name || "Traveller"}</p>
                        <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5">{user.email}</p>
                    </div>

                    {/* Menu Actions */}
                    <div className="p-1.5 space-y-0.5">
                        <Link
                            href="/dashboard/settings"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-3 px-3.5 py-2.5 rounded-[1.25rem] text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 group"
                        >
                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors shrink-0">
                                <Settings className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold tracking-wide">Settings</span>
                        </Link>

                        <DashboardSidebarFooter mobileMinimal />
                    </div>

                    <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#10B981]/20 to-transparent opacity-50" />
                </div>
            )}
        </div>
    );
}
