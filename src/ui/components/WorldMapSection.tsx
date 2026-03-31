"use client";

import dynamic from "next/dynamic";
import { Globe } from "lucide-react";
import { WorldMap } from "@/ui/components/ui/map";

const MotionDiv = dynamic(
  () => import("framer-motion").then((m) => m.motion.div),
  { ssr: false }
);

const TRAVEL_ROUTES = [
  {
    start: { lat: 40.7128, lng: -74.006, label: "New York" },
    end: { lat: 51.5074, lng: -0.1278, label: "London" },
  },
  {
    start: { lat: 51.5074, lng: -0.1278, label: "London" },
    end: { lat: 25.2048, lng: 55.2708, label: "Dubai" },
  },
  {
    start: { lat: 25.2048, lng: 55.2708, label: "Dubai" },
    end: { lat: 35.6762, lng: 139.6503, label: "Tokyo" },
  },
  {
    start: { lat: 35.6762, lng: 139.6503, label: "Tokyo" },
    end: { lat: -33.8688, lng: 151.2093, label: "Sydney" },
  },
  {
    start: { lat: -23.5505, lng: -46.6333, label: "São Paulo" },
    end: { lat: 40.7128, lng: -74.006, label: "New York" },
  },
  {
    start: { lat: 48.8566, lng: 2.3522, label: "Paris" },
    end: { lat: -1.2921, lng: 36.8219, label: "Nairobi" },
  },
] as const;

export function WorldMapSection() {
  return (
    <section className="relative py-20 px-6 lg:px-12 bg-[#0A0D12] overflow-hidden">
      {/* Top separator */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      {/* Bottom separator */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Ambient glow behind map */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[300px] bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] mb-6">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-medium text-slate-300">
              Everywhere you want to go
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Your world, fully connected
          </h2>
          <p className="mt-4 text-slate-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            VoyageAI plans trips across every continent — from weekend getaways
            to multi-leg global itineraries, all in seconds.
          </p>
        </MotionDiv>

        {/* Map */}
        <MotionDiv
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-6 shadow-[0_0_80px_rgba(99,102,241,0.06)]"
        >
          <WorldMap
            dots={TRAVEL_ROUTES as unknown as Array<{
              start: { lat: number; lng: number; label?: string };
              end: { lat: number; lng: number; label?: string };
            }>}
            lineColor="#818cf8"
            showLabels
            animationDuration={2}
            loop
          />
        </MotionDiv>

        {/* Stats row */}
        <MotionDiv
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 grid grid-cols-3 gap-4 max-w-lg mx-auto text-center"
        >
          {[
            { value: "195+", label: "Countries" },
            { value: "10k+", label: "Trips planned" },
            { value: "6", label: "Continents" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-2xl font-bold text-white">{stat.value}</span>
              <span className="text-xs text-slate-500">{stat.label}</span>
            </div>
          ))}
        </MotionDiv>
      </div>
    </section>
  );
}
