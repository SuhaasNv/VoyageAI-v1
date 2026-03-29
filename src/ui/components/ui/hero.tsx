"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronDown } from "lucide-react";

const EARTH_IMAGE =
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1400&q=80";
const PREVIEW_IMAGE =
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1920&q=80";

export default function Globe3D() {
  return (
    <section
      className="relative w-full overflow-hidden bg-[#0a0613] pb-10 pt-32 font-light text-white antialiased md:pb-16 md:pt-20"
      style={{
        background: "linear-gradient(135deg, #0a0613 0%, #150d27 100%)",
      }}
    >
      <div
        className="absolute right-0 top-0 h-1/2 w-1/2"
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(155, 135, 245, 0.15) 0%, rgba(13, 10, 25, 0) 60%)",
        }}
      />
      <div
        className="absolute left-0 top-0 h-1/2 w-1/2 -scale-x-100"
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(155, 135, 245, 0.15) 0%, rgba(13, 10, 25, 0) 60%)",
        }}
      />

      <div className="container relative z-10 mx-auto max-w-2xl px-4 text-center md:max-w-4xl md:px-6 lg:max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <span className="mb-6 inline-block rounded-full border border-[#9b87f5]/30 px-3 py-1 text-xs text-[#9b87f5]">
            AI-powered travel planning
          </span>
          <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-light md:text-5xl lg:text-7xl">
            Your next adventure,{" "}
            <span className="bg-gradient-to-r from-[#9b87f5] via-violet-300 to-indigo-400 bg-clip-text text-transparent">
              planned by AI.
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/60 md:text-xl">
            Day-by-day itineraries, smart budgets, and routes that adapt in real
            time—so you spend less time planning and more time exploring.
          </p>

          <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:mb-0 sm:flex-row">
            <Link
              href="/signup"
              className="neumorphic-button hover:shadow-[0_0_20px_rgba(155,135,245,0.5)] relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-white/10 bg-gradient-to-b from-white/10 to-white/5 px-8 py-4 text-white shadow-lg transition-all duration-300 hover:border-[#9b87f5]/30 sm:w-auto"
            >
              <span>Start Planning</span>
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <Link
              href="/#how-it-works"
              className="flex w-full items-center justify-center gap-2 text-white/70 transition-colors hover:text-white sm:w-auto"
            >
              <span>Learn how it works</span>
              <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
            </Link>
          </div>
        </motion.div>
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
        >
          <div className="relative flex h-40 w-full justify-center overflow-hidden md:h-64">
            <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[min(280px,95vw)] w-[min(880px,110vw)] -translate-x-1/2 md:h-[min(360px,95vw)]">
              <Image
                src={EARTH_IMAGE}
                alt=""
                fill
                className="object-cover object-[center_20%] opacity-80"
                sizes="(max-width: 768px) 110vw, 880px"
                priority
              />
            </div>
          </div>
          <div className="relative z-10 mx-auto max-w-5xl overflow-hidden rounded-lg shadow-[0_0_50px_rgba(155,135,245,0.2)]">
            <Image
              src={PREVIEW_IMAGE}
              alt="Travel planning workspace preview"
              width={1920}
              height={1080}
              className="h-auto w-full rounded-lg border border-white/10 object-cover"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
