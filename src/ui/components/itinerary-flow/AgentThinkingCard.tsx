"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { AGENT_REGISTRY, agentColorClasses } from "./agentRegistry";
import type { FlowStage } from "./types";

interface AgentThinkingCardProps {
    stage: Exclude<FlowStage, "saved">;
    /** When true, show error state instead of loading. */
    isError?: boolean;
    /** Optional error message to display when isError is true. */
    errorMessage?: string;
    onRetry?: () => void;
    /** Skeleton slot — renders the precise shape of the results below. */
    skeleton?: React.ReactNode;
}

export function AgentThinkingCard({
    stage,
    isError = false,
    errorMessage,
    onRetry,
    skeleton,
}: AgentThinkingCardProps) {
    const agent = AGENT_REGISTRY[stage];
    const colors = agentColorClasses(agent.color);
    const prefersReduced = useReducedMotion();

    // Typewriter log lines
    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const [logIndex, setLogIndex] = useState(0);

    useEffect(() => {
        if (isError) return;
        setVisibleLogs([]);
        setLogIndex(0);
    }, [stage, isError]);

    useEffect(() => {
        if (isError || logIndex >= agent.logs.length) return;
        const timer = setTimeout(() => {
            setVisibleLogs((prev) => [...prev, agent.logs[logIndex]]);
            setLogIndex((i) => i + 1);
        }, prefersReduced ? 0 : 1200);
        return () => clearTimeout(timer);
    }, [logIndex, agent.logs, isError, prefersReduced]);

    const Icon = agent.icon;

    return (
        <div className="w-full space-y-6">
            {/* Agent card */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6">
                <div className="flex items-start gap-4">
                    {/* Avatar with breathing glow */}
                    <div className="relative flex-shrink-0">
                        <motion.div
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${
                                isError
                                    ? "border-rose-500/50 bg-rose-500/10"
                                    : `${colors.border} ${colors.bg}`
                            }`}
                            animate={
                                prefersReduced || isError
                                    ? {}
                                    : {
                                          boxShadow: [
                                              `0 0 0px ${agent.glow}`,
                                              `0 0 24px ${agent.glow}`,
                                              `0 0 0px ${agent.glow}`,
                                          ],
                                      }
                            }
                            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <Icon
                                className={`w-6 h-6 ${isError ? "text-rose-400" : colors.text}`}
                            />
                        </motion.div>

                        {/* Spinning ring when active */}
                        {!isError && !prefersReduced && (
                            <motion.div
                                className={`absolute inset-0 rounded-2xl border-2 ${colors.border} opacity-40`}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                                {agent.name}
                            </span>
                            {/* Responsible AI badge */}
                            <span className="text-[10px] text-slate-500 border border-white/[0.06] rounded-full px-2 py-0.5">
                                Transparent AI · {agent.name}
                            </span>
                        </div>

                        <p className={`text-sm font-medium ${isError ? "text-rose-400" : "text-white"}`}>
                            {isError
                                ? "Agent encountered an issue"
                                : agent.message}
                        </p>

                        {/* Error detail */}
                        {isError && errorMessage && (
                            <p className="mt-1 text-xs text-rose-400/70 font-mono break-words">
                                {errorMessage}
                            </p>
                        )}

                        {/* Typewriter log lines */}
                        {!isError && (
                            <div className="mt-3 space-y-1.5 font-mono">
                                {visibleLogs.map((line, i) => (
                                    <motion.div
                                        key={i}
                                        initial={prefersReduced ? {} : { opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex items-center gap-2 text-[11px] text-slate-500"
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.fill}`} />
                                        {line}
                                    </motion.div>
                                ))}
                                {/* Blinking cursor at end */}
                                {logIndex < agent.logs.length && (
                                    <motion.span
                                        className={`inline-block w-1.5 h-3 ${colors.fill} rounded-sm`}
                                        animate={prefersReduced ? {} : { opacity: [1, 0, 1] }}
                                        transition={{ duration: 0.8, repeat: Infinity }}
                                    />
                                )}
                            </div>
                        )}

                        {/* Error retry */}
                        {isError && (
                            <button
                                onClick={onRetry}
                                className="mt-3 flex items-center gap-2 text-sm text-rose-400 hover:text-rose-300 transition-colors"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Try again
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Skeleton results area */}
            {skeleton && !isError && (
                <div className="opacity-50 pointer-events-none select-none">
                    {skeleton}
                </div>
            )}

            {/* Default skeleton if none provided */}
            {!skeleton && !isError && <DefaultSkeleton colors={colors} />}
        </div>
    );
}

function DefaultSkeleton({ colors }: { colors: ReturnType<typeof agentColorClasses> }) {
    return (
        <div className="space-y-4 animate-pulse">
            {/* Hero banner skeleton */}
            <div className="h-48 bg-white/[0.04] rounded-2xl" />
            {/* Card rows */}
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 space-y-3"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl ${colors.bg}`} />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 bg-white/[0.06] rounded-full w-1/3" />
                            <div className="h-2 bg-white/[0.04] rounded-full w-2/3" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((j) => (
                            <div key={j} className="h-16 bg-white/[0.04] rounded-xl" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
