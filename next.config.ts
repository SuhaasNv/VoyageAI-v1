import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads test fixtures at require-time; keep it out of the Next.js bundle.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // NOTE: Do NOT add server-only secrets to the `env` block — that injects them
  // into the client-side JS bundle. Server route handlers read process.env directly.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
