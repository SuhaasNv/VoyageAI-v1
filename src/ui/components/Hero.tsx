"use client";

import dynamic from "next/dynamic";
import {
    ArrowUpRight,
    Mic,
    Heart,
    Maximize2,
    Loader2,
    Sparkles,
    AlertCircle,
    X,
} from "lucide-react";
import Image from "next/image";
import {
    useState,
    useEffect,
    useRef,
    useCallback,
    Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import Link from "next/link";
import { getCsrfToken } from "@/lib/api";
import { HERO_GLOBE_ARCS, HERO_GLOBE_MARKERS } from "@/ui/components/hero-globe-routes";

const MotionDiv = dynamic(
    () => import("framer-motion").then((m) => m.motion.div),
    { ssr: false }
);

const RotatingEarth = dynamic(
    () => import("@/ui/components/ui/cobe-globe"),
    { ssr: false }
);

const EtherealShadow = dynamic(
    () =>
        import("@/components/ui/etheral-shadow").then((m) => m.EtherealShadow),
    { ssr: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PENDING_PROMPT_KEY = "voyageai_pending_prompt";
const DEBOUNCE_MS = 300;

/** Fullscreen hero loop. Default: `/header-video.mp4` in `public/`. Set env to another URL, or `NEXT_PUBLIC_HERO_BG_VIDEO_URL=` (empty) for mesh-only. */
const HERO_BG_VIDEO_RAW = process.env.NEXT_PUBLIC_HERO_BG_VIDEO_URL;
const HERO_BG_VIDEO_URL =
    HERO_BG_VIDEO_RAW !== undefined ? HERO_BG_VIDEO_RAW.trim() : "/header-video.mp4";
const HERO_BG_VIDEO_POSTER = (process.env.NEXT_PUBLIC_HERO_BG_VIDEO_POSTER ?? "").trim() || undefined;

const SUGGESTION_CHIPS = [
    "Inspire me where to go",
    "Create a 5-day trip to Bali",
    "Find family hotels in Dubai",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Minimal markdown renderer — covers only the patterns the AI emits.
// No external dependency; handles: ## h2, ### h3, **bold**, *italic*/_italic_,
// - bullets, > blockquotes, blank lines, and plain paragraphs.
// ─────────────────────────────────────────────────────────────────────────────

function splitInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_)/);
    return (
        <>
            {parts.map((part, i) => {
                if (/^\*\*[^*]+\*\*$/.test(part))
                    return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
                if (/^(\*[^*]+\*|_[^_]+_)$/.test(part))
                    return <span key={i} className="italic text-slate-300">{part.slice(1, -1)}</span>;
                return <span key={i}>{part}</span>;
            })}
        </>
    );
}

function renderMdLine(line: string, key: number): React.ReactNode {
    if (line.startsWith("## "))
        return <p key={key} className="text-sm font-bold text-white mt-3 mb-0.5 first:mt-0">{splitInline(line.slice(3))}</p>;
    if (line.startsWith("### "))
        return <p key={key} className="text-xs font-semibold text-slate-300 mt-2 mb-0.5 uppercase tracking-wide">{splitInline(line.slice(4))}</p>;
    if (/^\s*>\s/.test(line))
        return <p key={key} className="text-[11px] text-slate-400 pl-2 border-l-2 border-white/20 italic my-0.5">{splitInline(line.replace(/^\s*>\s*/, ""))}</p>;
    if (line.startsWith("- ") || /^\* /.test(line))
        return <p key={key} className="text-xs text-slate-200 leading-relaxed pl-1">· {splitInline(line.slice(2))}</p>;
    if (line.trim() === "")
        return <div key={key} className="h-1.5" />;
    return <p key={key} className="text-xs text-slate-200 leading-relaxed">{splitInline(line)}</p>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream phase state machine
//   idle → loading (shimmer) → typing (typewriter) → done
// ─────────────────────────────────────────────────────────────────────────────

type StreamPhase = "idle" | "loading" | "typing" | "done";

// ─────────────────────────────────────────────────────────────────────────────
// AILandingPrompt
// ─────────────────────────────────────────────────────────────────────────────

function AILandingPrompt() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, accessToken } = useAuthStore();

    const [isClient, setIsClient] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [phase, setPhase] = useState<StreamPhase>("idle");
    const [displayedText, setDisplayedText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [showAuthCTA, setShowAuthCTA] = useState(false);
    const [retryAfter, setRetryAfter] = useState<number | null>(null);
    const [postAnswerActions, setPostAnswerActions] = useState<string | null>(null);

    // ── Request lifecycle refs ─────────────────────────────────────────────
    const abortRef = useRef<AbortController | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const submittingRef = useRef(false);

    // ── Voice transcription state ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const [isListening, setIsListening] = useState(false);
    const [micSupported, setMicSupported] = useState(false);

    // ── Session identity ───────────────────────────────────────────────────
    // Stable UUID for the lifetime of this page visit. Sent with every landing
    // request so the server can maintain short-term conversational memory
    // (follow-up questions reference the same session context).
    const sessionIdRef = useRef<string>("");
    useEffect(() => {
        sessionIdRef.current = crypto.randomUUID();
    }, []);

    // ── Typewriter engine refs ─────────────────────────────────────────────
    // incomingRef accumulates every character received from the server.
    // displayedLenRef tracks how many of those chars are currently on screen.
    // The RAF loop drains the gap between the two at an adaptive pace.
    const incomingRef = useRef("");
    const displayedLenRef = useRef(0);
    const streamEndedRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pendingActionRef = useRef<string | null>(null);

    // ── Hydration guard + mic support detection ────────────────────────────
    useEffect(() => {
        setIsClient(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        setMicSupported(!!SR);
    }, []);

    // ── Global cleanup on unmount ──────────────────────────────────────────
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            recognitionRef.current?.abort();
        };
    }, []);

    // ── Rate-limit countdown — tick every second until retryAfter reaches 0 ──
    useEffect(() => {
        if (!retryAfter) return;
        if (retryAfter <= 0) { setRetryAfter(null); return; }
        const t = setTimeout(() => setRetryAfter((s) => (s !== null ? s - 1 : null)), 1000);
        return () => clearTimeout(t);
    }, [retryAfter]);

    // ── Typewriter: RAF loop that drains incomingRef → displayedText ───────
    //
    // Speed is adaptive:
    //   • 1 char/frame  when buffer is thin  (smooth, deliberate start)
    //   • up to 6/frame when buffer builds   (keeps pace with fast streams)
    //   • 30/frame      after stream ends     (instant drain of remainder)
    //
    const startTypewriter = useCallback(() => {
        if (rafRef.current !== null) return; // already running

        const tick = () => {
            const total = incomingRef.current.length;
            const current = displayedLenRef.current;

            if (current < total) {
                const buffered = total - current;
                const speed = streamEndedRef.current ? 30
                    : buffered > 80 ? 6
                        : buffered > 20 ? 3
                            : 1;
                const next = Math.min(current + speed, total);
                displayedLenRef.current = next;
                setDisplayedText(incomingRef.current.slice(0, next));
            }

            // Keep ticking while chars remain or server hasn't finished
            if (displayedLenRef.current < incomingRef.current.length || !streamEndedRef.current) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
                setPhase("done");
            }
        };

        rafRef.current = requestAnimationFrame(tick);
    }, []);

    const stopTypewriter = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
    }, []);

    // ── Auto-fill from ?q= param, auto-submit on post-login redirect ───────
    useEffect(() => {
        if (!isClient) return;
        const q = searchParams?.get("q");
        if (!q) return;

        const decoded = decodeURIComponent(q);
        setPrompt(decoded);

        if (user) {
            try {
                const pending = sessionStorage.getItem(PENDING_PROMPT_KEY);
                if (pending === decoded) {
                    sessionStorage.removeItem(PENDING_PROMPT_KEY);
                    setTimeout(() => executeSubmit(decoded), 0);
                }
            } catch { /* sessionStorage may be unavailable */ }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isClient, searchParams, user]);

    // ── Cancel ─────────────────────────────────────────────────────────────
    const handleCancel = useCallback(() => {
        abortRef.current?.abort();
        stopTypewriter();
        incomingRef.current = "";
        displayedLenRef.current = 0;
        streamEndedRef.current = false;
        submittingRef.current = false;
        pendingActionRef.current = null;
        setPhase("idle");
        setDisplayedText("");
        setPostAnswerActions(null);
    }, [stopTypewriter]);

    // ── Core submit ────────────────────────────────────────────────────────
    const executeSubmit = useCallback(
        async (finalPrompt: string) => {
            if (!finalPrompt.trim() || !isClient) return;
            if (submittingRef.current) return;
            submittingRef.current = true;

            // Reset typewriter state
            stopTypewriter();
            incomingRef.current = "";
            displayedLenRef.current = 0;
            streamEndedRef.current = false;

            setError(null);
            setDisplayedText("");
            setShowAuthCTA(false);
            setPostAnswerActions(null);
            pendingActionRef.current = null;
            setPhase("loading"); // → show shimmer immediately

            // Ensure CSRF token (landing endpoint is CSRF-exempt but fetch it
            // for other routes that might be called via the same flow)
            let csrfToken = getCsrfToken();
            if (!csrfToken) {
                try {
                    await fetch("/api/auth/csrf", { credentials: "include" });
                    csrfToken = getCsrfToken() ?? "";
                } catch { csrfToken = ""; }
            }

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const res = await fetch("/api/ai/landing", {
                    method: "POST",
                    credentials: "include",
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    body: JSON.stringify({
                        prompt: finalPrompt.slice(0, 500),
                        sessionId: sessionIdRef.current,
                    }),
                });

                if (res.status === 429) {
                    const retryHeader = res.headers.get("Retry-After");
                    const parsed = retryHeader ? parseInt(retryHeader, 10) : 60;
                    const wait = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
                    setRetryAfter(wait);
                    let errMsg = "Too many requests. Please wait before trying again.";
                    try { errMsg = (await res.json())?.error?.message ?? errMsg; } catch { /* ignore */ }
                    setError(errMsg);
                    setPhase("idle");
                    return;
                }
                if (!res.ok && res.status !== 200) {
                    let errMsg = `Request failed (${res.status})`;
                    try { errMsg = (await res.json())?.error?.message ?? errMsg; } catch { /* ignore */ }
                    setError(errMsg);
                    setPhase("idle");
                    return;
                }

                const contentType = res.headers.get("content-type") ?? "";

                if (contentType.includes("text/plain")) {
                    // ── Streaming path: start typewriter as soon as phase flips ──
                    setPhase("typing");
                    startTypewriter();

                    const reader = res.body?.getReader();
                    if (!reader) {
                        setError("Stream not available. Please try again.");
                        setPhase("idle");
                        return;
                    }

                    const decoder = new TextDecoder();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            if (controller.signal.aborted) break;

                            const chunk = decoder.decode(value, { stream: true });

                            if (chunk.includes("\x00ERROR:")) {
                                stopTypewriter();
                                setError(chunk.split("\x00ERROR:")[1]?.trim() ?? "AI error occurred.");
                                setDisplayedText("");
                                setPhase("idle");
                                return;
                            }

                            if (chunk.includes("\x00ACTION:AUTH_REQUIRED_CREATE")) {
                                incomingRef.current += chunk.replace("\x00ACTION:AUTH_REQUIRED_CREATE", "");
                                // Signal the typewriter to drain and then show CTA
                                setShowAuthCTA(true);
                                break;
                            }

                            // Parse ACTIONS sentinel or feed typewriter normally
                            if (chunk.includes("\x00ACTIONS:")) {
                                const [textPart, actionPart] = chunk.split("\x00ACTIONS:");
                                if (textPart) incomingRef.current += textPart;
                                pendingActionRef.current = (actionPart ?? "").trim();
                            } else {
                                // Feed the typewriter — never set React state directly here
                                incomingRef.current += chunk;
                            }
                        }
                    } catch (readErr) {
                        if ((readErr as Error).name !== "AbortError") {
                            stopTypewriter();
                            setError("Stream interrupted. Please try again.");
                            setPhase("idle");
                        }
                    } finally {
                        // Tell the typewriter the server is done; it will drain
                        // any remaining chars and then call setPhase("done")
                        streamEndedRef.current = true;
                        if (pendingActionRef.current) {
                            setPostAnswerActions(pendingActionRef.current);
                            pendingActionRef.current = null;
                        }
                        reader.cancel().catch(() => { });
                    }
                } else {
                    // ── JSON path (authenticated CREATE_TRIP redirect) ─────────
                    let json: Record<string, unknown>;
                    try { json = await res.json(); }
                    catch { setError("Invalid response from server."); setPhase("idle"); return; }

                    if (json?.requiresAuth === true) {
                        const encoded = encodeURIComponent(finalPrompt.trim());
                        try { sessionStorage.setItem(PENDING_PROMPT_KEY, finalPrompt.trim()); } catch { /* ignore */ }
                        router.push(`/login?returnUrl=/?q=${encoded}`);
                        setPhase("idle");
                        return;
                    }

                    if (!json?.success) {
                        const msg = (json as { error?: { message?: string } })?.error?.message;
                        setError(typeof msg === "string" ? msg : "Failed to process request.");
                        setPhase("idle");
                        return;
                    }

                    const data = (json as { success: true; data: { action: string; tripId?: string; style?: string | null } }).data;
                    if (data?.action === "redirect" && data?.tripId) {
                        const styleParam = typeof data.style === "string" && data.style
                            ? `&style=${encodeURIComponent(data.style)}`
                            : "";
                        router.push(`/dashboard/trip/${data.tripId}?fromLanding=1${styleParam}`);
                    }
                    setPhase("idle");
                }
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                setError("A network error occurred. Please check your connection.");
                setPhase("idle");
            } finally {
                submittingRef.current = false;
                // Phase transitions to "done" are handled by the typewriter RAF,
                // not here, so we intentionally don't touch phase in finally.
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isClient, user, accessToken, router, startTypewriter, stopTypewriter]
    );

    // ── Custom event handler for triggering submit from sibling components ──
    useEffect(() => {
        if (!isClient) return;
        const handler = (e: Event) => {
            const promptText = (e as CustomEvent).detail;
            setPrompt(promptText);
            // Execute on the next tick to ensure state is clean
            setTimeout(() => executeSubmit(promptText), 0);
        };
        window.addEventListener("voyage_hero_submit", handler);
        return () => window.removeEventListener("voyage_hero_submit", handler);
    }, [isClient, executeSubmit]);

    // ── Voice recognition ──────────────────────────────────────────────────
    const stopVoice = useCallback(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setIsListening(false);
    }, []);

    const toggleVoice = useCallback(async () => {
        if (isListening) { stopVoice(); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        if (!SR) return;

        // Check permission state before prompting — catches OS-level blocks early.
        try {
            const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
            if (perm.state === "denied") {
                setError("Microphone blocked at system level. On Mac: System Settings → Privacy & Security → Microphone → enable Chrome. Then refresh.");
                return;
            }
        } catch { /* permissions API not available in this browser — continue */ }

        // getUserMedia triggers the browser's native permission dialog.
        // SpeechRecognition.start() alone does NOT show the popup in Chrome.
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
        } catch (err: unknown) {
            const name = (err instanceof Error) ? err.name : "";
            if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                setError("Mic blocked. On Mac: System Settings → Privacy & Security → Microphone → enable Chrome. Then refresh and try again.");
            } else {
                setError("Could not access microphone. Please check your device settings.");
            }
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition: any = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
            let interim = "";
            let final = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) final += t;
                else interim += t;
            }
            const live = final || interim;
            if (live) setPrompt(live);

            if (final.trim()) {
                stopVoice();
                executeSubmit(final.trim());
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
            if (event.error === "not-allowed") {
                setError("Microphone access denied. Click the 🔒 icon in your browser address bar to allow mic access.");
            }
            stopVoice();
        };

        recognition.onend = () => setIsListening(false);

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    }, [isListening, stopVoice, executeSubmit]);

    // ── Debounced submit wrapper ───────────────────────────────────────────
    const handleSubmit = useCallback(
        (e?: React.FormEvent, overridePrompt?: string) => {
            if (e) e.preventDefault();
            const finalPrompt = (overridePrompt ?? prompt).trim();
            if (!finalPrompt) return;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => executeSubmit(finalPrompt), DEBOUNCE_MS);
        },
        [prompt, executeSubmit]
    );

    const handleChipClick = useCallback(
        (text: string) => { setPrompt(text); executeSubmit(text); },
        [executeSubmit]
    );

    const handleReset = useCallback(() => {
        abortRef.current?.abort();
        stopTypewriter();
        incomingRef.current = "";
        displayedLenRef.current = 0;
        streamEndedRef.current = false;
        submittingRef.current = false;
        pendingActionRef.current = null;
        sessionIdRef.current = crypto.randomUUID();
        setPhase("idle");
        setDisplayedText("");
        setPrompt("");
        setError(null);
        setShowAuthCTA(false);
        setPostAnswerActions(null);
    }, [stopTypewriter]);

    const handleCopy = useCallback(() => {
        if (!displayedText) return;
        navigator.clipboard.writeText(displayedText).catch(() => { });
    }, [displayedText]);

    const handleFollowUp = useCallback(() => {
        setPhase("idle");
        setDisplayedText("");
        setPostAnswerActions(null);
        setPrompt("");
        incomingRef.current = "";
        displayedLenRef.current = 0;
        streamEndedRef.current = false;
        inputRef.current?.focus();
    }, []);

    const handlePlanTrip = useCallback(() => {
        const createPrompt = `Plan a trip: ${prompt.slice(0, 200)}`;
        setPostAnswerActions(null);
        setPrompt(createPrompt);
        executeSubmit(createPrompt);
    }, [executeSubmit, prompt]);

    const isBusy = phase === "loading" || phase === "typing";
    const showCard = phase !== "idle";

    return (
        <div className="col-span-1 lg:col-span-1 rounded-[2rem] p-2 max-w-xl mx-auto w-full relative border border-white/12 bg-black/45 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            {/* Input bar */}
            <form
                onSubmit={handleSubmit}
                className="flex items-center rounded-full border border-white/10 bg-black/35 px-4 py-3 relative z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
                <button
                    type="button"
                    onClick={handleReset}
                    title="New conversation"
                    aria-label="Start new conversation"
                    className="text-slate-300 mr-2 text-xl leading-none hover:text-white transition-colors cursor-pointer"
                >
                    +
                </button>
                <input
                    ref={inputRef}
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={500}
                    disabled={isBusy}
                    placeholder={isListening ? "" : "Ask Anything..."}
                    aria-label="Ask a travel question"
                    className="bg-transparent border-none outline-none flex-1 text-sm text-slate-50 placeholder:text-slate-400 disabled:opacity-50"
                />
                {isListening && (
                    <span className="text-xs text-red-400/80 whitespace-nowrap animate-pulse mr-1">
                        Listening…
                    </span>
                )}
                <div className="flex items-center gap-2">
                    {/* Mic — active while listening, disabled when unsupported or busy */}
                    <button
                        type="button"
                        onClick={toggleVoice}
                        disabled={isBusy || !micSupported}
                        title={!micSupported ? "Voice input not supported in this browser" : isListening ? "Stop listening" : "Voice input"}
                        aria-label={isListening ? "Stop listening" : "Voice input"}
                        className={`p-2 rounded-full transition-all duration-200 ${isListening
                            ? "bg-red-500/20 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                            : "hover:bg-white/12 text-slate-200 disabled:opacity-30"
                            }`}
                    >
                        {isListening
                            ? <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                <Mic className="w-4 h-4" />
                            </span>
                            : <Mic className="w-4 h-4" />
                        }
                    </button>

                    {isBusy ? (
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="p-2 rounded-full bg-white/20 text-white hover:bg-red-500/30 transition-colors"
                            aria-label="Cancel"
                        >
                            {phase === "typing"
                                ? <X className="w-4 h-4" />
                                : <Loader2 className="w-4 h-4 animate-spin" />}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!prompt.trim() || !!retryAfter}
                            className="p-2 rounded-full bg-white text-[#10141a] hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:bg-white/50"
                            aria-label="Submit"
                        >
                            <ArrowUpRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </form>

            {/* Error */}
            {error && phase === "idle" && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{error}{retryAfter ? ` Retry in ${retryAfter}s.` : ""}</p>
                </div>
            )}

            {/* ── Response card ─────────────────────────────────────────── */}
            {showCard && (
                <div
                    className="mt-4 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-3"
                    role="region"
                    aria-label="AI response"
                    aria-live="polite"
                    aria-atomic="false"
                >

                    {/* Shimmer skeleton — shown while waiting for first token */}
                    {phase === "loading" && (
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-white/10 animate-pulse shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-2.5 pt-1">
                                {[100, 92, 84, 72, 56].map((w, i) => (
                                    <div
                                        key={i}
                                        style={{ width: `${w}%` }}
                                        className="h-2.5 rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] [animation:shimmer_1.5s_linear_infinite]"
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Typewriter text — shown once first token arrives */}
                    {(phase === "typing" || phase === "done") && (
                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                            </div>
                            <div className="leading-relaxed space-y-0.5">
                                {displayedText.split("\n").map((line, i) => renderMdLine(line, i))}
                                {phase === "typing" && (
                                    <span className="inline-block w-[2px] h-[1.1em] bg-white/80 ml-px align-middle [animation:blink_1s_step-end_infinite]" />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Post-answer actions — shown after Q&A completes (not after itinerary preview) */}
                    {phase === "done" && !showAuthCTA && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.08]">
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="text-[10px] px-2.5 py-1 rounded-full border border-white/12 bg-black/30 hover:bg-black/50 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                Copy
                            </button>
                            <button
                                type="button"
                                onClick={handleFollowUp}
                                className="text-[10px] px-2.5 py-1 rounded-full border border-white/12 bg-black/30 hover:bg-black/50 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                Ask a follow-up
                            </button>
                            {postAnswerActions === "create_trip" && (
                                <button
                                    type="button"
                                    onClick={handlePlanTrip}
                                    className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 text-amber-300 transition-colors flex items-center gap-1"
                                >
                                    <Sparkles className="w-3 h-3" />
                                    Plan this trip
                                </button>
                            )}
                        </div>
                    )}

                    {/* Auth CTA — appears after full preview has been typed out */}
                    {showAuthCTA && phase === "done" && (
                        <button
                            type="button"
                            onClick={() => {
                                const encoded = encodeURIComponent(prompt.trim());
                                try { sessionStorage.setItem(PENDING_PROMPT_KEY, prompt.trim()); } catch { /* ignore */ }
                                router.push(`/login?returnUrl=/?q=${encoded}`);
                            }}
                            className="mt-2 w-full py-2.5 px-4 rounded-full bg-[#f48c06] hover:bg-[#f48c06]/80 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            Save This Trip → Sign Up
                        </button>
                    )}
                </div>
            )}

            {/* Trust disclaimer */}
            <p className="text-[10px] text-center text-slate-500/70 mt-1 px-2">
                AI-generated · may be inaccurate · not legal, visa, or medical advice
            </p>

            {/* Suggestion chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2 p-1">
                {SUGGESTION_CHIPS.map((chip) => (
                    <button
                        key={chip}
                        type="button"
                        onClick={() => handleChipClick(chip)}
                        disabled={isBusy}
                        className="text-[10px] px-3 py-1.5 rounded-full border border-white/14 bg-black/40 hover:bg-black/55 text-slate-100 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
                    >
                        <span className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]">✦</span> {chip}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeroCard
// ─────────────────────────────────────────────────────────────────────────────

function HeroCard() {
    const { user, accessToken } = useAuthStore();
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const [isFavoriting, setIsFavoriting] = useState(false);
    const [favorited, setFavorited] = useState(false);
    const favoriteInFlightRef = useRef(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const handleFavorite = useCallback(async () => {
        if (!isClient) return;
        if (!user) {
            router.push("/login?returnUrl=/");
            return;
        }
        if (favoriteInFlightRef.current) return; // prevent duplicate clicks
        favoriteInFlightRef.current = true;
        setIsFavoriting(true);

        // Optimistic update
        const prev = favorited;
        setFavorited((f) => !f);

        try {
            let csrfToken = getCsrfToken();
            if (!csrfToken) {
                await fetch("/api/auth/csrf", { credentials: "include" });
                csrfToken = getCsrfToken() ?? "";
            }

            const res = await fetch("/api/favorites", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({ destination: "Bali" }),
            });

            const data = await res.json();
            if (data?.success) {
                setFavorited(data.data.favorited);
            } else {
                // Revert optimistic update on failure
                setFavorited(prev);
            }
        } catch {
            setFavorited(prev); // Revert on network error
        } finally {
            setIsFavoriting(false);
            favoriteInFlightRef.current = false;
        }
    }, [isClient, user, favorited, accessToken, router]);

    return (
        <MotionDiv
            initial={{ opacity: 0, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="glass-card p-4 w-72 rounded-[2rem] overflow-hidden rotate-2 hover:rotate-0 transition-transform duration-500"
        >
            <div className="relative h-48 rounded-2xl overflow-hidden mb-4">
                <Image
                    src="https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=800&q=80"
                    alt="Modern city at dusk"
                    fill
                    className="object-cover"
                />
                <div className="absolute top-3 right-3 p-1.5 bg-white/20 backdrop-blur-md rounded-full">
                    <Maximize2 className="w-4 h-4 text-white" />
                </div>
            </div>

            <h3 className="text-lg font-medium text-white mb-2">Bali Slow Travel</h3>

            <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">7 days</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">Nature escape</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-slate-300">Wellness</span>
            </div>

            <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                A mindful itinerary blending rice terrace walks, yoga, and authentic Balinese healing.
            </p>

            <div className="flex gap-2">
                <button
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent("voyage_hero_submit", {
                            detail: "Create a 7-day mindful itinerary to Bali focusing on nature and wellness"
                        }));
                    }}
                    className="flex-1 py-2 rounded-full border border-white/20 text-xs font-medium hover:bg-white/10 transition-colors text-center inline-block"
                >
                    View Details
                </button>
                <button
                    onClick={handleFavorite}
                    disabled={isFavoriting}
                    className={`px-3 py-2 rounded-full ${favorited ? "bg-red-500 text-white" : "bg-[#f48c06] text-white"
                        } hover:opacity-80 transition-all disabled:opacity-50`}
                    aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                >
                    <Heart className={`w-4 h-4 ${favorited ? "fill-current" : ""}`} />
                </button>
            </div>
        </MotionDiv>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero backdrop — optional video + scrim, or generative mesh
// ─────────────────────────────────────────────────────────────────────────────

function HeroBackdrop() {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const sync = () => setReduceMotion(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);

    const useVideo = Boolean(HERO_BG_VIDEO_URL) && !reduceMotion;

    return (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            {useVideo ? (
                <video
                    className="absolute inset-0 z-0 h-full w-full object-cover will-change-transform [transform:translateZ(0)]"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={HERO_BG_VIDEO_POSTER}
                >
                    <source src={HERO_BG_VIDEO_URL} type="video/mp4" />
                </video>
            ) : (
                <div className="absolute inset-0 z-0">
                    <EtherealShadow
                        className="h-full min-h-full w-full"
                        color="rgba(36, 32, 58, 0.88)"
                        animation={{ scale: 34, speed: 52 }}
                        noise={{ opacity: 0.45, scale: 1 }}
                        sizing="fill"
                    />
                </div>
            )}
            {useVideo ? (
                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0a0c14]/72 via-[#0a0c14]/38 to-[#10141a]/95" />
            ) : (
                <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0a0c14]/20 via-transparent to-[#10141a]" />
            )}
            {useVideo ? (
                <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_85%_75%_at_16%_38%,rgba(6,8,14,0.82),transparent_55%)]" />
            ) : null}
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,_rgba(124,58,237,0.22),_transparent_55%)]" />
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_88%_18%,_rgba(99,102,241,0.18),_transparent_38%)]" />
            <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_12%_40%,_rgba(56,80,104,0.2),_transparent_45%)]" />
            <div className="absolute inset-0 z-[2] ring-1 ring-inset ring-white/[0.04]" />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

export function Hero() {
    return (
        <section className="relative min-h-screen pt-24 pb-28 flex flex-col justify-end px-6 lg:px-12 overflow-hidden bg-[#0a0c14]">
            <HeroBackdrop />

            <div className="relative z-20 mx-auto mt-20 flex h-full w-full max-w-[1400px] flex-col justify-between">
                <div className="flex h-full flex-col items-stretch gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                    {/* Left text */}
                    <MotionDiv
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="flex min-w-0 max-w-xl flex-col gap-6 lg:max-w-[min(36rem,48%)]"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full w-fit border border-white/15 bg-black/45 backdrop-blur-md shadow-[0_2px_20px_rgba(0,0,0,0.5)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                            <span className="text-xs font-medium text-violet-50">
                                AI-powered travel planning
                            </span>
                        </div>

                        <div className="flex flex-col gap-3">
                            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-white">
                                Your next adventure,
                                <br />
                                <span className="inline-block drop-shadow-[0_2px_24px_rgba(251,146,60,0.45)]">
                                    <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-amber-400 bg-clip-text text-transparent">
                                        planned by AI.
                                    </span>
                                </span>
                            </h1>
                            <p className="text-base text-slate-100/95 max-w-sm leading-relaxed">
                                Day-by-day itineraries, smart budgets, and routes that adapt in real time.
                            </p>
                        </div>

                        <Link
                            href="/dashboard"
                            className="flex items-center gap-2 group w-fit px-6 py-3.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium transition-all duration-200 shadow-[0_0_28px_rgba(124,58,237,0.5)] hover:shadow-[0_0_40px_rgba(124,58,237,0.6)]"
                        >
                            <span className="text-sm font-medium">Start Planning</span>
                            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
                        </Link>
                    </MotionDiv>

                    {/* Globe — compact square, nudged toward the right edge */}
                    <MotionDiv
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="relative hidden w-full shrink-0 justify-end pl-4 sm:pl-8 lg:flex lg:w-auto lg:min-w-0 lg:pl-6 xl:pl-8 lg:mr-2 xl:mr-3 2xl:mr-5"
                    >
                        <div className="mx-auto w-full max-w-[min(420px,88vw)] sm:max-w-[min(460px,78vw)] lg:mx-0 lg:max-w-[min(460px,42vw)] lg:translate-x-3 xl:max-w-[min(500px,38vw)] xl:translate-x-5 2xl:max-w-[min(540px,36vw)] 2xl:translate-x-6">
                            <RotatingEarth
                                className="w-full opacity-90"
                                markers={HERO_GLOBE_MARKERS}
                                arcs={HERO_GLOBE_ARCS}
                                showHint={false}
                                mapBrightness={8}
                                diffuse={1.35}
                                speed={0.0055}
                                baseColor={[0.92, 0.92, 0.93]}
                                glowColor={[0.82, 0.78, 0.95]}
                                markerColor={[0.55, 0.45, 0.98]}
                                arcColor={[0.5, 0.4, 0.95]}
                                markerSize={0.028}
                                markerElevation={0.01}
                                arcWidth={0.48}
                                arcHeight={0.27}
                            />
                        </div>
                    </MotionDiv>
                </div>

                {/* Bottom bar */}
                <MotionDiv
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end mt-20 pb-8"
                >
                    <div className="hidden lg:block" />

                    {/* Prompt bar — lazy loaded to avoid blocking SSR */}
                    <Suspense
                        fallback={
                            <div className="col-span-1 lg:col-span-1 h-16 bg-white/5 rounded-full animate-pulse mx-auto w-full max-w-xl" />
                        }
                    >
                        <AILandingPrompt />
                    </Suspense>

                    {/* Social proof */}
                    <div className="flex flex-col items-end text-right">
                        <div className="flex -space-x-3 mb-3">
                            <Image
                                src="https://i.pravatar.cc/100?img=33"
                                alt="user"
                                width={32}
                                height={32}
                                className="w-8 h-8 rounded-full border-2 border-[#10141a] z-20"
                            />
                            <Image
                                src="https://i.pravatar.cc/100?img=47"
                                alt="user"
                                width={32}
                                height={32}
                                className="w-8 h-8 rounded-full border-2 border-[#10141a] z-10"
                            />
                            <div className="w-8 h-8 rounded-full border-2 border-[#10141a] bg-[#f48c06] z-0 flex items-center justify-center text-[10px] font-medium">
                                +
                            </div>
                        </div>
                        <p className="text-[11px] text-slate-100/90 max-w-[220px] leading-relaxed">
                            With Worldwide Access, We Bring Our Top-Rated Travel Planning Solutions to Explorers Across
                            the Globe.
                        </p>
                    </div>
                </MotionDiv>
            </div>
        </section>
    );
}
