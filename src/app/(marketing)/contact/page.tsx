import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";
import { Mail, MessageCircle, HelpCircle } from "lucide-react";
import Link from "next/link";

export const metadata = {
    title: "Contact | VoyageAI",
    description: "Get in touch with the VoyageAI team. We'd love to hear from you.",
};

export default function ContactPage() {
    return (
        <>
            <PageHero
                title="Contact"
                subtitle="We'd love to hear from you. Reach out for support, partnerships, or just to say hello."
            />
            <PageContent>
                <p>
                    Whether you have a question, feedback, or a partnership idea, we&apos;re here to help.
                </p>
                <div className="grid gap-6 mt-8 sm:grid-cols-2">
                    {[
                        {
                            icon: HelpCircle,
                            title: "Support",
                            desc: "Having trouble with your account or a trip? Check our FAQ first, or reach out for help.",
                        },
                        {
                            icon: MessageCircle,
                            title: "Feedback",
                            desc: "We're constantly improving. Ideas for new features? Let us know.",
                        },
                        {
                            icon: Mail,
                            title: "General",
                            desc: "Partnerships, press, or general inquiries. We read every message.",
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className="p-6 rounded-xl bg-white/[0.03] border border-white/5"
                        >
                            <Icon className="w-8 h-8 text-indigo-400 mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                            <p className="text-slate-400 text-sm mb-4">{desc}</p>
                            <a
                                href="mailto:hello@voyageai.app"
                                className="text-indigo-400 hover:text-indigo-300 transition-colors text-sm"
                            >
                                hello@voyageai.app
                            </a>
                        </div>
                    ))}
                </div>
                <p className="mt-10 text-slate-500 text-sm">
                    We typically respond within 24–48 hours. For urgent support,{" "}
                    <Link href="/" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        check our FAQ
                    </Link>
                    {" "}on the homepage.
                </p>
            </PageContent>
        </>
    );
}
