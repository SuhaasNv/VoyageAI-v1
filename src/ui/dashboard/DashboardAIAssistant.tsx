import { useState } from "react";
import { Sparkles, Send, Loader2, CheckCircle2 } from "lucide-react";
import { ensureCsrfToken, type Trip } from "@/lib/api";

interface DashboardAIAssistantProps {
    onTripCreated: (trip: Trip) => void;
}

export function DashboardAIAssistant({ onTripCreated }: DashboardAIAssistantProps) {
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || isLoading) return;

        setIsLoading(true);
        setSuccessMsg(null);
        setErrorMsg(null);
        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/ai/create-trip", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({ text: prompt }),
            });
            const data = await res.json();

            if (res.ok && data.success && data.data) {
                onTripCreated(data.data as Trip);
                setSuccessMsg(`Trip to ${data.data.destination} created.`);
                setPrompt("");
                setTimeout(() => setSuccessMsg(null), 5000);
            } else {
                throw new Error(data.error?.message || data.message || "Failed to create trip");
            }
        } catch (err: unknown) {
            console.error(err);
            const msg = err instanceof Error ? err.message : "An error occurred";
            setErrorMsg(msg);
            setTimeout(() => setErrorMsg(null), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl transition-all hover:border-white/10 flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#10B981]" />
                <h2 className="text-xl font-bold text-white tracking-tight">AI Assistant</h2>
            </div>
            <p className="text-xs text-zinc-400">
                Type natural language to instantly create a trip.
            </p>
            <form onSubmit={handleSubmit} className="relative">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder='e.g., "Plan a trip to Dubai from March 12 to 30 with $2500 budget, relaxed vibe"'
                    className="w-full bg-black/20 border border-white/10 rounded-xl p-3 pr-12 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 resize-none h-24"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={!prompt.trim() || isLoading}
                    className="absolute bottom-3 right-3 p-2 rounded-lg bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </form>
            {successMsg && (
                <div className="flex items-center gap-2 text-xs text-[#10B981] bg-[#10B981]/10 px-3 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    {successMsg}
                </div>
            )}
            {errorMsg && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                    {errorMsg}
                </div>
            )}
        </div>
    );
}
