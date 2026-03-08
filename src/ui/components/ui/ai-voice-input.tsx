"use client";

import { Mic } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AIVoiceInputProps {
    onStart?: () => void;
    onStop?: (duration: number) => void;
    visualizerBars?: number;
    demoMode?: boolean;
    demoInterval?: number;
    className?: string;
}

export function AIVoiceInput({
    onStart,
    onStop,
    visualizerBars = 48,
    demoMode = false,
    demoInterval = 3000,
    className,
}: AIVoiceInputProps) {
    const [submitted, setSubmitted] = useState(false);
    const [time, setTime] = useState(0);
    const [isClient, setIsClient] = useState(false);
    const [isDemo, setIsDemo] = useState(demoMode);

    useEffect(() => { setIsClient(true); }, []);

    useEffect(() => {
        let intervalId: ReturnType<typeof setInterval>;
        if (submitted) {
            onStart?.();
            intervalId = setInterval(() => setTime((t) => t + 1), 1000);
        } else {
            onStop?.(time);
            setTime(0);
        }
        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submitted]);

    useEffect(() => {
        if (!isDemo) return;
        let timeoutId: ReturnType<typeof setTimeout>;
        const run = () => {
            setSubmitted(true);
            timeoutId = setTimeout(() => {
                setSubmitted(false);
                timeoutId = setTimeout(run, 1000);
            }, demoInterval);
        };
        const init = setTimeout(run, 100);
        return () => { clearTimeout(timeoutId); clearTimeout(init); };
    }, [isDemo, demoInterval]);

    const formatTime = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

    const handleClick = () => {
        if (isDemo) { setIsDemo(false); setSubmitted(false); }
        else setSubmitted((p) => !p);
    };

    return (
        <div className={cn("w-full py-4", className)}>
            <div className="relative max-w-xl w-full mx-auto flex items-center flex-col gap-2">
                <button
                    type="button"
                    onClick={handleClick}
                    className={cn(
                        "group w-16 h-16 rounded-xl flex items-center justify-center transition-colors",
                        !submitted && "bg-none hover:bg-white/10",
                    )}
                >
                    {submitted ? (
                        <div
                            className="w-6 h-6 rounded-sm animate-spin bg-white cursor-pointer"
                            style={{ animationDuration: "3s" }}
                        />
                    ) : (
                        <Mic className="w-6 h-6 text-white/70" />
                    )}
                </button>

                <span className={cn(
                    "font-mono text-sm transition-opacity duration-300",
                    submitted ? "text-white/70" : "text-white/30",
                )}>
                    {formatTime(time)}
                </span>

                <div className="h-4 w-64 flex items-center justify-center gap-0.5">
                    {[...Array(visualizerBars)].map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-0.5 rounded-full transition-all duration-300",
                                submitted ? "bg-white/50 animate-pulse" : "bg-white/10 h-1",
                            )}
                            style={submitted && isClient
                                ? { height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.05}s` }
                                : undefined}
                        />
                    ))}
                </div>

                <p className="h-4 text-xs text-white/70">
                    {submitted ? "Listening..." : "Click to speak"}
                </p>
            </div>
        </div>
    );
}
