"use client";

import React, { useRef, useState, useEffect } from "react";
import { useScroll, useTransform, motion, type MotionValue } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// ContainerScroll
//
// Uses global useScroll() (window.scrollY) instead of target-based scroll,
// because the project sets h-full on html/body which can confuse Framer
// Motion's scroll-container detection.  The element's absolute position is
// measured after mount and used to derive the exact scroll range.
// ─────────────────────────────────────────────────────────────────────────────

export const ContainerScroll = ({
    titleComponent,
    children,
}: {
    titleComponent: string | React.ReactNode;
    children: React.ReactNode;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Global page scroll — always tracks window.scrollY.
    const { scrollY } = useScroll();

    // Element position measured once after mount.
    const [elementTop, setElementTop]   = useState(0);
    const [elementH, setElementH]       = useState(1);
    const [viewportH, setViewportH]     = useState(800);
    const [isMobile, setIsMobile]       = useState(false);

    useEffect(() => {
        const measure = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setElementTop(rect.top + window.scrollY);
            setElementH(rect.height);
            setViewportH(window.innerHeight);
            setIsMobile(window.innerWidth <= 768);
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    const scaleDimensions = (): [number, number] =>
        isMobile ? [0.7, 0.9] : [1.05, 1];

    // Start animating when the section top hits the viewport bottom.
    // Finish when the section has scrolled half its height past viewport top.
    const start = elementTop - viewportH;         // section enters viewport
    const end   = elementTop + elementH * 0.45;   // card is centred

    const rotate    = useTransform(scrollY, [start, end], [20, 0],    { clamp: true });
    const scale     = useTransform(scrollY, [start, end], scaleDimensions(), { clamp: true });
    const translate = useTransform(scrollY, [start, end], [0, -100],  { clamp: true });

    return (
        <div
            className="h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20"
            ref={containerRef}
        >
            <div
                className="py-10 md:py-40 w-full relative"
                style={{ perspective: "1000px" }}
            >
                <Header translate={translate} titleComponent={titleComponent} />
                <Card rotate={rotate} translate={translate} scale={scale}>
                    {children}
                </Card>
            </div>
        </div>
    );
};

// ─── Header ──────────────────────────────────────────────────────────────────

export const Header = ({
    translate,
    titleComponent,
}: {
    translate: MotionValue<number>;
    titleComponent: React.ReactNode;
}) => (
    <motion.div
        style={{ translateY: translate }}
        className="max-w-5xl mx-auto text-center"
    >
        {titleComponent}
    </motion.div>
);

// ─── Card ─────────────────────────────────────────────────────────────────────

export const Card = ({
    rotate,
    scale,
    children,
}: {
    rotate:    MotionValue<number>;
    scale:     MotionValue<number>;
    translate: MotionValue<number>;
    children:  React.ReactNode;
}) => (
    <motion.div
        style={{
            rotateX: rotate,
            scale,
            boxShadow:
                "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, " +
                "0 84px 50px #00000026, 0 149px 60px #0000000a, 0 233px 65px #00000003",
        }}
        className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full border-4 border-[#6C6C6C] p-2 md:p-6 bg-[#222222] rounded-[30px] shadow-2xl"
    >
        <div className="h-full w-full overflow-hidden rounded-2xl bg-zinc-900 md:rounded-2xl md:p-4">
            {children}
        </div>
    </motion.div>
);
