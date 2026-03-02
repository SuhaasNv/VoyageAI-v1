"use client";

import React, { useRef } from "react";
import { useScroll, useTransform, motion, type MotionValue } from "framer-motion";

// ─── ContainerScroll ──────────────────────────────────────────────────────────
// Scroll-driven 3-D perspective tilt that resolves to flat as the user
// scrolls the section into view. Content ("children") is rendered inside
// the device-frame card.

export const ContainerScroll = ({
    titleComponent,
    children,
}: {
    titleComponent: React.ReactNode;
    children: React.ReactNode;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({ target: containerRef });

    const [isMobile, setIsMobile] = React.useState(false);

    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
        // eslint-disable-next-line react-hooks/set-state-in-effect
    }, []);

    const scaleDimensions = (): [number, number] =>
        isMobile ? [0.7, 0.9] : [1.05, 1];

    const rotate    = useTransform(scrollYProgress, [0, 1], [20, 0]);
    const scale     = useTransform(scrollYProgress, [0, 1], scaleDimensions());
    const translate = useTransform(scrollYProgress, [0, 1], [0, -100]);

    return (
        <div
            className="h-[60rem] md:h-[80rem] flex items-center justify-center relative p-2 md:p-20"
            ref={containerRef}
        >
            <div
                className="py-10 md:py-40 w-full relative"
                style={{ perspective: "1000px" }}
            >
                <ScrollHeader translate={translate} titleComponent={titleComponent} />
                <ScrollCard rotate={rotate} translate={translate} scale={scale}>
                    {children}
                </ScrollCard>
            </div>
        </div>
    );
};

// ─── ScrollHeader ─────────────────────────────────────────────────────────────

export const ScrollHeader = ({
    translate,
    titleComponent,
}: {
    translate: MotionValue<number>;
    titleComponent: React.ReactNode;
}) => (
    <motion.div
        style={{ translateY: translate }}
        className="max-w-5xl mx-auto text-center mb-8"
    >
        {titleComponent}
    </motion.div>
);

// ─── ScrollCard ───────────────────────────────────────────────────────────────

export const ScrollCard = ({
    rotate,
    scale,
    children,
}: {
    rotate:    MotionValue<number>;
    scale:     MotionValue<number>;
    translate: MotionValue<number>; // accepted but applied at parent level
    children:  React.ReactNode;
}) => (
    <motion.div
        style={{
            rotateX: rotate,
            scale,
            boxShadow: [
                "0 0 #0000004d",
                "0 9px 20px #0000004a",
                "0 37px 37px #00000042",
                "0 84px 50px #00000026",
                "0 149px 60px #0000000a",
                "0 233px 65px #00000003",
            ].join(", "),
        }}
        className="max-w-5xl -mt-12 mx-auto h-[30rem] md:h-[40rem] w-full rounded-[30px] border border-white/[0.08] bg-[#0D1117] p-1.5 md:p-3 shadow-2xl"
    >
        {/* Inner bezel */}
        <div className="h-full w-full overflow-hidden rounded-[22px] bg-[#0B0F14]">
            {children}
        </div>
    </motion.div>
);
