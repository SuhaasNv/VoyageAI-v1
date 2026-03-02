import { Hero } from "@/components/Hero";
import { ProductShowcase } from "@/components/ProductShowcase";
import { AISimplifies } from "@/components/AISimplifies";
import { Testimonials } from "@/components/Testimonials";
import { FAQ } from "@/components/FAQ";
import { CTA } from "@/components/CTA";

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
