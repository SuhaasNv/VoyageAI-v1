import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Briefcase, Globe, Zap } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Careers | VoyageAI",
    description: "Join VoyageAI and help build the future of AI-powered travel planning.",
};

export default function CareersPage() {
    return (
        <>
            <PageHero
                title="Careers"
                subtitle="Help us make travel planning smarter for everyone."
            />
            <PageContent>
                <p>
                    We&apos;re a small team building something big. If you love travel, AI, and great product design, we&apos;d love to hear from you.
                </p>
                <div className="space-y-6 mt-8">
                    {[
                        {
                            icon: Briefcase,
                            title: "Open Roles",
                            desc: "We're hiring for engineering, design, and growth roles. Check back soon or reach out to express your interest.",
                        },
                        {
                            icon: Globe,
                            title: "Remote-First",
                            desc: "We're distributed across time zones. Work from wherever you do your best work—as long as you have reliable internet.",
                        },
                        {
                            icon: Zap,
                            title: "Impact",
                            desc: "You'll ship features that thousands of travelers use. Your work directly improves how people plan and experience trips.",
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className="flex gap-4 p-6 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <Icon className="w-8 h-8 text-indigo-400 shrink-0" />
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                                <p className="text-slate-400 text-sm">{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-10 p-6 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-slate-300 mb-4">
                        Don&apos;t see a role that fits? We&apos;re always interested in meeting talented people.
                    </p>
                    <Link
                        href="/contact"
                        className="inline-flex items-center gap-2 px-6 py-2 rounded-full border border-white/20 text-white font-medium hover:bg-white/5 transition-colors text-sm"
                    >
                        Get in touch
                    </Link>
                </div>
            </PageContent>
        </>
    );
}
