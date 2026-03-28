"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { AGENT_REGISTRY, agentColorClasses } from "./agentRegistry";
import type { FlowStage } from "./types";

interface AgentThinkingCardProps {
    stage: Exclude<FlowStage, "saved">;
    isError?: boolean;
    errorMessage?: string;
    onRetry?: () => void;
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
            <div className="card-premium ai-shimmer p-6">
                <div className="flex items-start gap-4 relative">
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
                                              `0 0 28px ${agent.glow}`,
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

                        {!isError && !prefersReduced && (
                            <motion.div
                                className={`absolute inset-0 rounded-2xl border-2 ${colors.border} opacity-30`}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            />
                        )}

                        {/* Pulse dot */}
                        {!isError && (
                            <motion.div
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${colors.fill} border-2 border-[#0B0F19]`}
                                animate={prefersReduced ? {} : { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-bold text-white">
                                {agent.name}
                            </span>
                            <span className="text-[10px] text-slate-500 border border-white/[0.06] rounded-full px-2 py-0.5">
                                AI Agent
                            </span>
                        </div>

                        <p className={`text-sm leading-relaxed ${isError ? "text-rose-400" : "text-slate-400"}`}>
                            {isError
                                ? "Agent encountered an issue"
                                : agent.message}
                        </p>

                        {isError && errorMessage && (
                            <p className="mt-2 text-xs text-rose-400/70 font-mono break-words bg-rose-500/5 rounded-lg px-3 py-2">
                                {errorMessage}
                            </p>
                        )}

                        {/* Typewriter log lines */}
                        {!isError && (
                            <div className="mt-4 space-y-2 font-mono">
                                {visibleLogs.map((line, i) => (
                                    <motion.div
                                        key={i}
                                        initial={prefersReduced ? {} : { opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex items-center gap-2.5 text-[11px] text-slate-500"
                                    >
                                        <motion.span
                                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.fill}`}
                                            animate={i === visibleLogs.length - 1 && !prefersReduced ? { opacity: [1, 0.3, 1] } : {}}
                                            transition={{ duration: 0.8, repeat: Infinity }}
                                        />
                                        {line}
                                    </motion.div>
                                ))}
                                {/* Blinking cursor */}
                                {logIndex < agent.logs.length && (
                                    <motion.span
                                        className={`inline-block w-1.5 h-4 ${colors.fill} rounded-sm`}
                                        animate={prefersReduced ? {} : { opacity: [1, 0, 1] }}
                                        transition={{ duration: 0.8, repeat: Infinity }}
                                    />
                                )}
                            </div>
                        )}

                        {isError && (
                            <button
                                onClick={onRetry}
                                className="mt-3 flex items-center gap-2 text-sm text-rose-400 hover:text-rose-300 transition-all duration-200 hover:translate-x-0.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Try again
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Skeleton */}
            {skeleton && !isError && (
                <div className="opacity-50 pointer-events-none select-none relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0B0F19] z-10" />
                    {skeleton}
                </div>
            )}

            {!skeleton && !isError && <DefaultSkeleton colors={colors} />}
        </div>
    );
}

function DefaultSkeleton({ colors }: { colors: ReturnType<typeof agentColorClasses> }) {
    return (
        <div className="space-y-4 opacity-50 pointer-events-none select-none relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0B0F19] z-10" />
            <div className="h-48 bg-white/[0.03] rounded-2xl ai-shimmer border border-white/[0.05]" />
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-3 ai-shimmer"
                    style={{ animationDelay: `${i * 0.3}s` }}
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
                            <div key={j} className="h-16 bg-white/[0.03] rounded-xl border border-white/[0.05]" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
