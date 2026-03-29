import { Hero } from "@/ui/components/Hero";
import { ProductShowcase } from "@/ui/components/ProductShowcase";
import { FeatureStrip } from "@/ui/components/FeatureStrip";
import { AISimplifies } from "@/ui/components/AISimplifies";
import { Testimonials } from "@/ui/components/Testimonials";
import { FAQ } from "@/ui/components/FAQ";
import { CTA } from "@/ui/components/CTA";

export default function Home() {
    return (
        <>
            <Hero />
            <ProductShowcase />
            <FeatureStrip />
            <AISimplifies />
            <Testimonials />
            <FAQ />
            <CTA />
        </>
    );
}
