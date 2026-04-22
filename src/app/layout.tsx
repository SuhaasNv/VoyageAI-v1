import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/ui/components/ServiceWorkerRegistration";
import { HMRRecoveryGuard } from "@/ui/components/HMRRecoveryGuard";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#10141a",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  title: "VoyageAI | Smart & Simple Trip Planning",
  description:
    "Plan your dream trip with AI in seconds. Get personalized itineraries, smart recommendations, and seamless travel planning powered by AI.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "VoyageAI",
    title: "VoyageAI | Smart & Simple Trip Planning",
    description:
      "Plan your dream trip with AI in seconds. Get personalized itineraries, smart recommendations, and seamless travel planning powered by AI.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VoyageAI — AI-powered travel planning",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VoyageAI | Smart & Simple Trip Planning",
    description:
      "Plan your dream trip with AI in seconds. Get personalized itineraries, smart recommendations, and seamless travel planning powered by AI.",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request nonce set by proxy.ts so Next.js can attach it to
  // the inline hydration scripts it emits (required for strict CSP compliance).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className="dark" {...(nonce ? { nonce } : {})}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        <HMRRecoveryGuard />
        {children}
      </body>
    </html>
  );
}
