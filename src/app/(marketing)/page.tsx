import { Hero } from "@/ui/components/Hero";
import { WorldMapSection } from "@/ui/components/WorldMapSection";
import { ProductShowcase } from "@/ui/components/ProductShowcase";
import { FeatureStrip } from "@/ui/components/FeatureStrip";
import Testimonial1 from "@/ui/components/ui/testimonial-1";
import { FAQ } from "@/ui/components/FAQ";
import { CTA } from "@/ui/components/CTA";

export default function Home() {
    return (
        <>
            <Hero />
            <WorldMapSection />
            <ProductShowcase />
            <FeatureStrip />
            <Testimonial1 />
            <FAQ />
            <CTA />
        </>
    );
}
