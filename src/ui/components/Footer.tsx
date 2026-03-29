import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/ui/components/Logo";

export function Footer() {
    return (
        <footer className="border-t border-white/5 bg-[#0A0D12] px-6 py-12 text-slate-400 lg:px-12">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-white">
                            <Logo size="md" />
                            <span className="text-lg font-semibold tracking-tight">VoyageAI</span>
                        </div>
                        <p className="max-w-sm text-sm leading-relaxed text-slate-500">
                            Intelligent, personalized travel planning powered by AI.
                        </p>
                        <Link
                            href="/signup"
                            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-white/5"
                        >
                            Try it now
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>

                <div className="mt-10 flex flex-col gap-4 border-t border-white/5 pt-8 text-xs font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>&copy; {new Date().getFullYear()} VoyageAI. All rights reserved.</p>
                    <div className="flex flex-wrap gap-6">
                        <Link href="/terms" className="hover:text-white transition-colors">
                            Terms
                        </Link>
                        <Link href="/privacy" className="hover:text-white transition-colors">
                            Privacy
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
