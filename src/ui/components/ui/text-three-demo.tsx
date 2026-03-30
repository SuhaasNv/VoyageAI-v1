"use client";

import { MultilingualGreetingTypewriter } from "@/components/ui/text-three";
import TextThree from "@/components/ui/text-three";

/** Centered demo of the legacy single-phrase typewriter */
export function TextThreeDemo() {
    return <TextThree />;
}

/** Hero-style greeting line for playgrounds / internal previews */
export function MultilingualGreetingDemo() {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-8">
            <MultilingualGreetingTypewriter size="lg" />
        </div>
    );
}
