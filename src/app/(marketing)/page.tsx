import { Hero } from "@/ui/components/Hero";
import { ScrollExpandMedia } from "@/ui/components/ui/scroll-expansion-hero";
import { ProductShowcase } from "@/ui/components/ProductShowcase";
import { FeatureStrip } from "@/ui/components/FeatureStrip";
import Testimonial1 from "@/ui/components/ui/testimonial-1";
import { FAQ } from "@/ui/components/FAQ";
import { CTA } from "@/ui/components/CTA";

export default function Home() {
    return (
        <>
            <Hero />
            <ScrollExpandMedia
                mediaType="image"
                mediaSrc="https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=2070&q=80"
                title="See the world differently"
                date="AI-Powered Itineraries"
                scrollToExpand="Scroll to explore"
            />
            <ProductShowcase />
            <FeatureStrip />
            <Testimonial1 />
            <FAQ />
            <CTA />
        </>
    );
}
