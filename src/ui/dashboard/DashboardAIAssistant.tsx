import { useState } from "react";
import { Sparkles, Send, Loader2, CheckCircle2, Edit2, Check, X, Calendar, Wallet } from "lucide-react";
import { ensureCsrfToken, type Trip } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardAIAssistantProps {
    onTripCreated: (trip: Trip) => void;
}

interface RefinedTrip {
    destination: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    style?: string;
    raw: string;
}

export function DashboardAIAssistant({ onTripCreated }: DashboardAIAssistantProps) {
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [preview, setPreview] = useState<RefinedTrip | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleInitialSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || isLoading) return;

        setIsLoading(true);
        setErrorMsg(null);
        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/ai/refine-trip", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({ text: prompt }),
            });
            const data = await res.json();
            if (data.success && data.data) {
                setPreview(data.data);
            } else {
                throw new Error(data.message || "Failed to parse trip");
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "AI failed to parse details");
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!preview || isLoading) return;
        setIsLoading(true);
        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/ai/create-trip", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrf,
                },
                body: JSON.stringify({ text: prompt }),
            });
            const data = await res.json();
            if (data.success) {
                onTripCreated(data.data);
                setSuccessMsg(`Adventure to ${data.data.destination} confirmed.`);
                setPreview(null);
                setPrompt("");
                setTimeout(() => setSuccessMsg(null), 5000);
            } else {
                throw new Error(data.message);
            }
        } catch {
            setErrorMsg("Failed to create trip");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden shadow-2xl transition-all hover:border-white/10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#10B981]" />
                    <h2 className="text-xl font-bold text-white tracking-tight">AI Assistant</h2>
                </div>
                {preview && (
                    <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full uppercase">
                        Review Details
                    </span>
                )}
            </div>

            <AnimatePresence mode="wait">
                {preview ? (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                    >
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Destination</span>
                                <span className="text-sm font-bold text-white truncate block">{preview.destination}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Style</span>
                                <span className="text-sm font-bold text-[#10B981] truncate block">{preview.style ?? "Flexible"}</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5 col-span-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-3 h-3 text-zinc-500" />
                                    <span className="text-xs text-zinc-300 font-medium">
                                        {preview.startDate ? `${preview.startDate} → ${preview.endDate}` : "TBD"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 border-l border-white/10 pl-3">
                                    <Wallet className="w-3 h-3 text-zinc-500" />
                                    <span className="text-xs text-zinc-300 font-medium">
                                        {preview.budget ? `$${preview.budget.toLocaleString()}` : "Flexible"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <button
                                onClick={handleConfirm}
                                disabled={isLoading}
                                className="flex-1 bg-[#10B981] hover:bg-[#10B981]/90 text-black font-bold py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Looks Perfect
                            </button>
                            <button
                                onClick={() => setPreview(null)}
                                disabled={isLoading}
                                className="p-2 rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white transition-colors"
                                title="Edit Prompt"
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                    >
                        <p className="text-xs text-zinc-400">
                            Type natural language to instantly create a trip.
                        </p>
                        <form onSubmit={handleInitialSubmit} className="relative">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder='e.g., "Trip to Bali, April 10-20, $1800 budget, relax vibes"'
                                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 pr-12 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#10B981]/30 focus:ring-1 focus:ring-[#10B981]/20 resize-none h-24"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={!prompt.trim() || isLoading}
                                className="absolute bottom-3 right-3 p-2 rounded-lg bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 disabled:opacity-50 transition-colors"
                            >
                                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {successMsg && (
                <div className="flex items-center gap-2 text-xs text-[#10B981] bg-[#10B981]/10 px-3 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    {successMsg}
                </div>
            )}
            {errorMsg && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                    <X className="w-4 h-4" />
                    {errorMsg}
                </div>
            )}
        </div>
    );
}
