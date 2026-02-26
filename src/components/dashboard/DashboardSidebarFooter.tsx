"use client";

import React from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

function displayName(name: string | null, email: string): string {
    if (name?.trim()) return name.trim();
    const local = email.split("@")[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : "User";
}

export function DashboardSidebarFooter({ mobileMinimal }: { mobileMinimal?: boolean }) {
    const { user, logout } = useAuthStore();

    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

    const handleLogout = () => {
        setIsLoggingOut(true);
        logout();
        window.location.href = "/login";
    };

    const userName = user ? displayName(user.name, user.email) : "User";
    const initial = userName.charAt(0).toUpperCase();

    if (mobileMinimal) {
        return (
            <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-3.5 px-4 py-3 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 group"
            >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                    {isLoggingOut ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                    ) : (
                        <LogOut className="w-4 h-4" />
                    )}
                </div>
                <span className="text-sm font-semibold tracking-wide">
                    {isLoggingOut ? "Logging out..." : "Logout"}
                </span>
            </button>
        );
    }

    return (
        <div className="space-y-1.5">
            <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-out text-sm font-medium"
            >
                {isLoggingOut ? (
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                    <LogOut className="w-4 h-4" />
                )}
                {isLoggingOut ? "Logging out..." : "Logout"}
            </button>

            <div className="mt-6 flex items-center gap-3 pt-6 border-t border-white/[0.06]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-lg overflow-hidden border border-white/10 shrink-0">
                    {user?.image ? (
                        <Image
                            src={user.image}
                            alt={userName}
                            width={32}
                            height={32}
                            className="w-full h-full object-cover"
                            unoptimized
                        />
                    ) : (
                        initial
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-zinc-200 truncate">{userName}</span>
                    <span className="text-xs text-slate-500">Free Plan</span>
                </div>
            </div>
        </div>
    );
}
