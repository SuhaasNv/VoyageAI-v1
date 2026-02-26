import { Hero } from "@/components/Hero";
import { AISimplifies } from "@/components/AISimplifies";
import { Testimonials } from "@/components/Testimonials";
import { FAQ } from "@/components/FAQ";
import { CTA } from "@/components/CTA";

export default function Home() {
    return (
        <>
            <Hero />
            <AISimplifies />
            <Testimonials />
            <FAQ />
            <CTA />
        </>
    );
}
