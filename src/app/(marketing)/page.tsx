import { Hero } from "@/ui/components/Hero";
import { ProductShowcase } from "@/ui/components/ProductShowcase";
import { AISimplifies } from "@/ui/components/AISimplifies";
import { Testimonials } from "@/ui/components/Testimonials";
import { FAQ } from "@/ui/components/FAQ";
import { CTA } from "@/ui/components/CTA";

export default function Home() {
    return (
        <>
            <Hero />
            <ProductShowcase />
            <AISimplifies />
            <Testimonials />
            <FAQ />
            <CTA />
        </>
    );
}
