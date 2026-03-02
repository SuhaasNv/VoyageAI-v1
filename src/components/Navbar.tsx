"use client";

import Link from "next/link";
import { MoveRight } from "lucide-react";
import { Logo } from "@/components/Logo";

export function Navbar() {
    return (
        <nav
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 lg:px-12 backdrop-blur-md bg-[#10141a]/80 border-b border-white/5 animate-in fade-in slide-in-from-top-4 duration-500"
        >
            <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                <Logo size="md" />
                <span className="text-xl font-semibold tracking-tight text-white">VoyageAI</span>
            </Link>

            <div className="hidden md:flex items-center gap-8 text-sm text-slate-300">
                <Link href="#" className="hover:text-white transition-colors">Home</Link>
                <Link href="#" className="hover:text-white transition-colors">About Us</Link>
                <Link href="#" className="hover:text-white transition-colors">How it Works</Link>
                <Link href="#" className="hover:text-white transition-colors">Destinations</Link>
                <Link href="#" className="hover:text-white transition-colors">Contact</Link>
            </div>

            <div className="flex items-center gap-4">
                <Link href="/login" className="hidden sm:inline-block text-sm font-medium text-slate-300 hover:text-white transition-colors px-4 py-2 border border-white/10 rounded-full hover:bg-white/5">
                    Login
                </Link>
                <Link href="/signup" className="flex items-center gap-2 text-sm font-medium bg-white text-[#10141a] px-5 py-2 rounded-full hover:bg-slate-200 transition-colors">
                    Sign Up <MoveRight className="w-4 h-4" />
                </Link>
            </div>
        </nav>
    );
}
