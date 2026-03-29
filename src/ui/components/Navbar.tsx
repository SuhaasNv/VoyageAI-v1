"use client";

import Link from "next/link";
import { MoveRight } from "lucide-react";
import { Logo } from "@/ui/components/Logo";

export function Navbar() {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 lg:px-10 animate-in fade-in slide-in-from-top-4 duration-500 bg-[#0A0D12]/70 backdrop-blur-xl border-b border-white/[0.06]">
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity shrink-0">
                <Logo size="md" />
                <span className="text-lg font-semibold tracking-tight text-white">VoyageAI</span>
            </Link>

            <div className="flex items-center gap-3 shrink-0">
                <Link
                    href="/login"
                    className="hidden sm:inline-flex items-center text-sm font-medium text-slate-300 hover:text-white transition-colors px-4 py-2 rounded-full border border-white/[0.1] hover:bg-white/[0.05] backdrop-blur-sm"
                >
                    Login
                </Link>
                <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 text-sm font-semibold bg-white text-[#0A0D12] px-5 py-2 rounded-full hover:bg-slate-100 transition-colors shadow-[0_2px_20px_rgba(255,255,255,0.15)]"
                >
                    Sign Up <MoveRight className="w-3.5 h-3.5" />
                </Link>
            </div>
        </nav>
    );
}
