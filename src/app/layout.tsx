import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/ui/components/ServiceWorkerRegistration";


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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
