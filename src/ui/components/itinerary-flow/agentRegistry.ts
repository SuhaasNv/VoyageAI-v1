/**
 * itinerary-flow/agentRegistry.ts
 *
 * Single source of truth for all agent identities.
 * Every UI component reads from AGENT_REGISTRY[stage] — no colors,
 * copy, or log lines scattered across component files.
 *
 * Adding a 6th agent: add one entry here and implement StageProps.
 */

import {
    Brain,
    Globe,
    Route,
    Wallet,
    Shield,
    type LucideIcon,
} from "lucide-react";
import type { FlowStage } from "./types";

export interface AgentConfig {
    name: string;
    icon: LucideIcon;
    /** Tailwind color name (without shade) — used to build class strings. */
    color: "indigo" | "teal" | "amber" | "green" | "purple";
    /** CSS rgba for box-shadow glow effects. */
    glow: string;
    /** First-person loading message shown in AgentThinkingCard. */
    message: string;
    /** 6–8 typewriter log lines that appear during loading. */
    logs: string[];
    /** Data sources this agent used — shown in ExplainabilityPanel. */
    dataSources: string[];
    /** What this agent explicitly did NOT do — builds user trust. */
    notDoing: string[];
    /** Short role description for ExplainabilityPanel biography. */
    role: string;
}

export const AGENT_REGISTRY: Record<Exclude<FlowStage, "saved">, AgentConfig> = {
    planner: {
        name: "Planner",
        icon: Brain,
        color: "indigo",
        glow: "rgba(99,102,241,0.35)",
        message: "Analyzing your travel intent and building a day-by-day blueprint...",
        logs: [
            "Parsing destination and date range...",
            "Inferring travel style from your preferences...",
            "Mapping duration to day count...",
            "Assigning themes to each day...",
            "Calibrating activity pace...",
            "Validating date consistency...",
            "Finalizing day-by-day blueprint...",
        ],
        dataSources: ["Travel preferences", "Date & duration analysis", "Style heuristics"],
        notDoing: [
            "Booking anything or confirming reservations",
            "Researching specific places or restaurants",
            "Calculating costs",
            "Assessing safety",
        ],
        role: "The Planner builds the structural skeleton of your trip — days, themes, pace, and style — before any real-world research begins.",
    },

    research: {
        name: "Evan",
        icon: Globe,
        color: "teal",
        glow: "rgba(20,184,166,0.35)",
        message: "Scouring the web for the best experiences in your destination...",
        logs: [
            "Querying Bright Data for local attractions...",
            "Searching hotel options near key areas...",
            "Finding top-rated restaurants...",
            "Cross-referencing theme alignment...",
            "Filtering by your travel style...",
            "Deduplicating overlapping results...",
            "Structuring activity options per day...",
            "Selecting 3–5 hotels across price tiers...",
        ],
        dataSources: ["Bright Data web search", "14+ live sources", "Hotel directories", "Review aggregators"],
        notDoing: [
            "Optimizing the order of activities",
            "Calculating any costs",
            "Assessing safety conditions",
            "Making final hotel selection",
        ],
        role: "Evan (Research Agent) uses live web data from Bright Data to find real activities, experiences, and hotels that match your trip themes — not hallucinated guesses.",
    },

    logistics: {
        name: "Logistics",
        icon: Route,
        color: "amber",
        glow: "rgba(245,158,11,0.35)",
        message: "Calculating the most efficient path through your activities...",
        logs: [
            "Grouping activities by geography...",
            "Assigning morning / afternoon / evening slots...",
            "Selecting optimal hotel from options...",
            "Computing route distance per day...",
            "Minimizing unnecessary backtracking...",
            "Balancing activity load across time slots...",
            "Generating route efficiency score...",
        ],
        dataSources: ["Activity coordinates", "Geographic clustering", "Time-slot heuristics"],
        notDoing: [
            "Researching new activities",
            "Calculating monetary costs",
            "Assessing weather or safety risks",
        ],
        role: "The Logistics Agent takes your researched activities and arranges them into an efficient day-by-day schedule — grouping by geography and time slot to minimize travel fatigue.",
    },

    budget: {
        name: "Budget",
        icon: Wallet,
        color: "green",
        glow: "rgba(16,185,129,0.35)",
        message: "Tallying every cost so there are no surprises on the road...",
        logs: [
            "Calculating hotel nightly rate...",
            "Estimating activity costs per day...",
            "Distributing costs across categories...",
            "Comparing total against your budget...",
            "Flagging over-budget days...",
            "Generating saving suggestions if needed...",
            "Preparing currency conversion baseline...",
        ],
        dataSources: ["Local pricing data", "Hotel rate tables", "Activity cost estimates", "Currency baselines"],
        notDoing: [
            "Changing your selected activities",
            "Re-routing the itinerary",
            "Assessing safety",
        ],
        role: "The Budget Agent deterministically calculates every cost — hotel nights, activities, and food — then evaluates whether the trip fits your budget and suggests reductions if not.",
    },

    safety: {
        name: "Safety",
        icon: Shield,
        color: "purple",
        glow: "rgba(168,85,247,0.35)",
        message: "Assessing risk signals and preparing your safety briefing...",
        logs: [
            "Scanning for overpacked days...",
            "Checking travel fatigue patterns...",
            "Evaluating budget overflow risk...",
            "Applying weather risk heuristics...",
            "Analyzing famous attraction crowding...",
            "Generating traveler tips...",
            "Calculating VoyageAI Trip Score...",
            "Assembling your complete itinerary...",
        ],
        dataSources: ["Risk rule engine", "Weather heuristics", "Destination data", "Travel advisories"],
        notDoing: [
            "Booking or confirming anything",
            "Changing your itinerary",
            "Providing real-time government travel advisories",
        ],
        role: "The Safety Agent applies deterministic risk rules (no LLM) to flag fatigue, budget overflow, weather risks, and crowd conditions — then generates your complete trip score.",
    },
};

export type AgentKey = keyof typeof AGENT_REGISTRY;

/** Returns Tailwind utility class strings for an agent's accent color. */
export function agentColorClasses(color: AgentConfig["color"]) {
    const map = {
        indigo: {
            border: "border-indigo-500/40",
            bg: "bg-indigo-500/10",
            text: "text-indigo-400",
            ring: "ring-indigo-500/30",
            fill: "bg-indigo-500",
        },
        teal: {
            border: "border-teal-500/40",
            bg: "bg-teal-500/10",
            text: "text-teal-400",
            ring: "ring-teal-500/30",
            fill: "bg-teal-500",
        },
        amber: {
            border: "border-amber-500/40",
            bg: "bg-amber-500/10",
            text: "text-amber-400",
            ring: "ring-amber-500/30",
            fill: "bg-amber-500",
        },
        green: {
            border: "border-emerald-500/40",
            bg: "bg-emerald-500/10",
            text: "text-emerald-400",
            ring: "ring-emerald-500/30",
            fill: "bg-emerald-500",
        },
        purple: {
            border: "border-purple-500/40",
            bg: "bg-purple-500/10",
            text: "text-purple-400",
            ring: "ring-purple-500/30",
            fill: "bg-purple-500",
        },
    } as const;
    return map[color];
}
