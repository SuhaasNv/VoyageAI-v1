"use client";

import { useEffect, useState } from "react";

// People-free nature only – verified 200, no humans in frame
const UNSPLASH_NATURE = [
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80", // cliff landscape
    "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1920&q=80", // mountain sunset
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80", // snow peaks
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1920&q=80",
] as const;

const ROTATE_INTERVAL_MS = 60_000; // 1 minute

export function DashboardBackground() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            setIndex((i) => (i + 1) % UNSPLASH_NATURE.length);
        }, ROTATE_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0d12]">
            {UNSPLASH_NATURE.map((src, i) => (
                <div
                    key={i}
                    className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
                        i === index ? "opacity-100" : "opacity-0 pointer-events-none"
                    }`}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover scale-105"
                    />
                    <div className="absolute inset-0 bg-[#0a0d12]/75 backdrop-blur-md" />
                </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d12] via-transparent to-[#0a0d12]/60 pointer-events-none" />
        </div>
    );
}
