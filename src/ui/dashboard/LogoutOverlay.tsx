"use client";

import { useAuthStore } from "@/stores/authStore";

export function LogoutOverlay() {
    const _logoutPending = useAuthStore((s) => s._logoutPending);
    if (!_logoutPending) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0B0F14]" aria-hidden="true">
            <span className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
    );
}
