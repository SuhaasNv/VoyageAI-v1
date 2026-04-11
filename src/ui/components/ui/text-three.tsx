"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

const TYPE_MS = 90;
const DELETE_MS = 48;
const PAUSE_FULL_MS = 2200;
const PAUSE_EMPTY_MS = 450;

/** Greetings from around the world — cycled with typewriter + backspace */
const GREETING_PHRASES = [
    "Namaste",
    "你好",
    "Bonjour",
    "Hola",
    "こんにちは",
    "Marhaba",
    "Guten Tag",
    "Ciao",
    "Olá",
    "안녕하세요",
    "Sawasdee",
    "Shalom",
] as const;

export interface MultilingualGreetingTypewriterProps {
    className?: string;
    /** Visual scale for the hero vs compact demos */
    size?: "sm" | "md" | "lg";
}

/**
 * Cycles through greetings: types each phrase, pauses, backspaces, then continues.
 */
export function MultilingualGreetingTypewriter({
    className = "",
    size = "md",
}: MultilingualGreetingTypewriterProps) {
    const [displayText, setDisplayText] = useState("");
    const reduceMotion = useReducedMotion();

    const { textClass, wrapperClass } = useMemo(() => {
        switch (size) {
            case "sm":
                return {
                    textClass: "text-lg md:text-xl",
                    wrapperClass: "min-h-[1.5rem]",
                };
            case "lg":
                /* Fixed row height: min-h alone still grew with glyphs / baseline, shifting the pill above */
                return {
                    textClass:
                        "text-[1.65rem] sm:text-3xl md:text-4xl lg:text-[2.35rem] xl:text-5xl leading-none font-semibold",
                    wrapperClass:
                        "h-[3rem] sm:h-[3.35rem] md:h-[3.85rem] lg:h-[4.125rem] xl:h-[4.75rem] shrink-0",
                };
            default:
                return {
                    textClass: "text-xl md:text-2xl",
                    wrapperClass: "min-h-[2.75rem]",
                };
        }
    }, [size]);

    useEffect(() => {
        if (reduceMotion) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDisplayText("Namaste · 你好 · Bonjour · Hola");
            return;
        }

        const signal = { cancelled: false };

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, ms);
            });

        const run = async () => {
            const phrases = [...GREETING_PHRASES];
            const start = Math.floor(Math.random() * phrases.length);
            const ordered = [...phrases.slice(start), ...phrases.slice(0, start)];

            while (!signal.cancelled) {
                for (const phrase of ordered) {
                    if (signal.cancelled) return;
                    for (let i = 0; i <= phrase.length; i++) {
                        if (signal.cancelled) return;
                        setDisplayText(phrase.slice(0, i));
                        await sleep(TYPE_MS);
                    }
                    if (signal.cancelled) return;
                    await sleep(PAUSE_FULL_MS);
                    if (signal.cancelled) return;
                    for (let i = phrase.length; i >= 0; i--) {
                        if (signal.cancelled) return;
                        setDisplayText(phrase.slice(0, i));
                        await sleep(DELETE_MS);
                    }
                    if (signal.cancelled) return;
                    await sleep(PAUSE_EMPTY_MS);
                }
            }
        };

        void run();
        return () => {
            signal.cancelled = true;
        };
    }, [reduceMotion]);

    return (
        <div
            className={`flex w-full items-center justify-start ${wrapperClass} ${className}`}
            aria-live="polite"
            aria-atomic="true"
        >
            <motion.div
                className={`inline-flex max-w-full items-center gap-1 tracking-tight text-white/95 ${textClass} ${
                    reduceMotion ? "whitespace-normal" : "whitespace-nowrap"
                }`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
                <span className="min-w-0 bg-gradient-to-r from-violet-200 via-white to-indigo-200 bg-clip-text text-transparent">
                    {displayText.length === 0 ? "\u00a0" : displayText}
                </span>
                {!reduceMotion && (
                    <span
                        className="inline-block h-[0.72em] w-[2px] shrink-0 self-center animate-pulse rounded-sm bg-violet-400/90 shadow-[0_0_12px_rgba(167,139,250,0.7)]"
                        aria-hidden
                    />
                )}
            </motion.div>
        </div>
    );
}

/** Original single-phrase demo behavior — kept for parity with the snippet */
function TextThree() {
    const text = "Namaste World!";
    const [displayText, setDisplayText] = useState("");

    useEffect(() => {
        let currentIndex = 0;
        const intervalId = setInterval(() => {
            if (currentIndex <= text.length) {
                setDisplayText(text.slice(0, currentIndex));
                currentIndex++;
            } else {
                clearInterval(intervalId);
            }
        }, 100);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="flex h-64 items-center justify-center p-4">
            <motion.div
                className="text-4xl font-semibold"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                {displayText}
            </motion.div>
        </div>
    );
}

export default TextThree;
