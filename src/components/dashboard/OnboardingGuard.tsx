"use client";

import { useAuthStore } from "@/stores/authStore";
import { OnboardingModal } from "./OnboardingModal";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
    const { user } = useAuthStore();
    const showOnboarding = user && user.hasOnboarded === false;

    return (
        <>
            {children}
            <OnboardingModal isOpen={!!showOnboarding} />
        </>
    );
}
