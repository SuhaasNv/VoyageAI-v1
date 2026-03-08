'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
    children: string;
    as?: React.ElementType;
    className?: string;
    /** Animation duration in seconds. Default: 2 */
    duration?: number;
    /** Controls how wide the shimmer sweep is relative to text length. Default: 2 */
    spread?: number;
}

const MotionElements: Record<string, React.ElementType> = {
    p: motion.p,
    h1: motion.h1,
    h2: motion.h2,
    h3: motion.h3,
    h4: motion.h4,
    h5: motion.h5,
    h6: motion.h6,
    span: motion.span,
    div: motion.div,
};

export function TextShimmer({
    children,
    as: Component = 'p',
    className,
    duration = 2,
    spread = 2,
}: TextShimmerProps) {
    const MotionComponent = MotionElements[Component as unknown as string] || motion.p;

    const dynamicSpread = useMemo(
        () => children.length * spread,
        [children, spread]
    );

    return (
        <MotionComponent
            className={cn(
                // Layout
                'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
                // Light-mode defaults (dark text + black shimmer — rarely used here)
                'text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]',
                '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
                '[background-repeat:no-repeat,padding-box]',
                // Dark-mode overrides (used everywhere in VoyageAI)
                'dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff]',
                'dark:[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
                className
            )}
            initial={{ backgroundPosition: '100% center' }}
            animate={{ backgroundPosition: '0% center' }}
            transition={{ repeat: Infinity, duration, ease: 'linear' }}
            style={
                {
                    '--spread': `${dynamicSpread}px`,
                    backgroundImage: `var(--bg), linear-gradient(var(--base-color), var(--base-color))`,
                } as React.CSSProperties
            }
        >
            {children}
        </MotionComponent>
    );
}
