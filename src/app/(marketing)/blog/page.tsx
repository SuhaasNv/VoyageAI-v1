import { PageHero } from "@/components/marketing/PageHero";
import { PageContent } from "@/components/marketing/PageContent";
import { FileText } from "lucide-react";

export const metadata = {
    title: "Blog | VoyageAI",
    description: "Travel tips, product updates, and AI insights from the VoyageAI team.",
};

export default function BlogPage() {
    return (
        <>
            <PageHero
                title="Blog"
                subtitle="Travel tips, product updates, and insights from the VoyageAI team."
            />
            <PageContent>
                <p>
                    We share travel tips, product updates, and thoughts on AI in travel. Subscribe to stay in the loop.
                </p>
                <div className="mt-10 p-12 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400 mb-2">
                        Our blog is coming soon.
                    </p>
                    <p className="text-sm text-slate-500">
                        We&apos;re working on our first posts. In the meantime, follow us on social or{" "}
                        <a href="/contact" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                            get in touch
                        </a>
                        {" "}to suggest topics.
                    </p>
                </div>
            </PageContent>
        </>
    );
}
