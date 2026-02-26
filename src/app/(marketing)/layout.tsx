import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main className="min-h-screen bg-[#0A0D12] selection:bg-white/20">
            <Navbar />
            {children}
            <Footer />
        </main>
    );
}
