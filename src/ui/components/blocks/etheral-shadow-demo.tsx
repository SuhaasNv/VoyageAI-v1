"use client";

import { Component } from "@/components/ui/etheral-shadow";

export function DemoOne() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-[#0a0b12] p-6">
            <div className="h-[min(640px,85vh)] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-violet-950/40">
                <Component
                    title="Ethereal Shadows"
                    color="rgba(128, 128, 128, 1)"
                    animation={{ scale: 100, speed: 90 }}
                    noise={{ opacity: 1, scale: 1.2 }}
                    sizing="fill"
                />
            </div>
        </div>
    );
}
