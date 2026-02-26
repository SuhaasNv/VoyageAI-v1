"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

function displayName(name: string | null, email: string): string {
    if (name?.trim()) return name.trim();
    const local = email.split("@")[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : "User";
}

export function DashboardSidebarFooter() {
    const router = useRouter();
    const { user, logout } = useAuthStore();

    const handleLogout = async () => {
        await logout();
        router.replace("/");
    };

    const userName = user ? displayName(user.name, user.email) : "User";

    return (
        <div className="space-y-1.5">
            <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 ease-out text-sm font-medium"
            >
                <LogOut className="w-4 h-4" />
                Logout
            </button>

            <div className="mt-6 flex items-center gap-3 pt-6 border-t border-white/[0.06]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shadow-lg overflow-hidden border border-white/10">
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-zinc-200 truncate">{userName}</span>
                    <span className="text-xs text-slate-500">Free Plan</span>
                </div>
            </div>
        </div>
    );
}
