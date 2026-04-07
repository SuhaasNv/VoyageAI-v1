/**
 * itinerary-flow/transitions.ts
 *
 * Shared motion variants used by every stage component to animate
 * the inner loading ↔ loaded ↔ error swap. Keeping these in one place
 * guarantees all five stages fade in lockstep.
 */

import type { Variants, Transition } from "framer-motion";

export const stageContentVariants: Variants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
};

export const stageContentTransition: Transition = {
    type: "spring",
    stiffness: 320,
    damping: 32,
};
