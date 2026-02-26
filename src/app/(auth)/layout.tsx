import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "VoyageAI — Sign in",
    description: "Sign in or create your VoyageAI account to start planning AI-powered trips.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
