import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/ui/components/Logo";

export function Footer() {
    return (
        <footer className="bg-[#0A0D12] text-slate-400 border-t border-white/5 pt-16 pb-8 px-6 lg:px-12">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
                {/* Brand Column */}
                <div className="lg:col-span-2">
                    <div className="flex items-center gap-2 mb-6 text-white">
                        <Logo size="md" />
                        <span className="text-xl font-semibold tracking-tight">VoyageAI</span>
                    </div>
                    <p className="text-sm text-slate-400 max-w-sm leading-relaxed mb-6">
                        Explore the world effortlessly with intelligent, personalized travel planning powered by AI.
                    </p>
                    <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-2 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-colors text-xs">
                        Try it now <ArrowUpRight className="w-4 h-4" />
                    </Link>
                </div>

                {/* Links Columns */}
                <div>
                    <h4 className="text-white font-medium mb-6 text-sm">Releases</h4>
                    <ul className="space-y-4 text-xs font-medium text-slate-500">
                        <li><Link href="/integrations" className="hover:text-white transition-colors">Integrations</Link></li>
                        <li><Link href="/smart-routes" className="hover:text-white transition-colors">Smart Routes</Link></li>
                        <li><Link href="/ai-itineraries" className="hover:text-white transition-colors">AI Itineraries</Link></li>
                        <li><Link href="/vision-maps" className="hover:text-white transition-colors">Vision Maps</Link></li>
                        <li><Link href="/destinations" className="hover:text-white transition-colors">100M Destinations</Link></li>
                    </ul>
                </div>

                <div>
                    <h4 className="text-white font-medium mb-6 text-sm">Resources</h4>
                    <ul className="space-y-4 text-xs font-medium text-slate-500">
                        <li><Link href="/travel-stories" className="hover:text-white transition-colors">Travel Stories</Link></li>
                        <li><Link href="/apps" className="hover:text-white transition-colors">Our Apps</Link></li>
                        <li><Link href="/travel-library" className="hover:text-white transition-colors">Travel Library</Link></li>
                        <li><Link href="/tutorials" className="hover:text-white transition-colors">Tutorials</Link></li>
                    </ul>
                </div>

                <div>
                    <h4 className="text-white font-medium mb-6 text-sm">Company</h4>
                    <ul className="space-y-4 text-xs font-medium text-slate-500">
                        <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                        <li><Link href="/careers" className="hover:text-white transition-colors">Careers</Link></li>
                        <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                        <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                    </ul>
                </div>
            </div>

            {/* Bottom Footer block */}
            <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
                <p>&copy; {new Date().getFullYear()} VoyageAI. All rights reserved.</p>
                <div className="flex items-center gap-6">
                    <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                    <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                    <div className="flex items-center gap-4 ml-4">
                        <Link href="#" className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" /></svg>
                        </Link>
                        <Link href="#" className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
