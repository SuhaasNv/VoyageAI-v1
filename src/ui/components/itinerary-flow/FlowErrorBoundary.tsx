"use client";

/**
 * FlowErrorBoundary
 *
 * React class-based error boundary for the itinerary creation flow.
 * Catches any unhandled runtime errors thrown during rendering inside the
 * pipeline (e.g. undefined property access on agent output, third-party
 * library error, etc.) so the entire flow overlay never goes blank.
 *
 * Usage:
 *   <FlowErrorBoundary stage="research" onReset={() => runResearch(...)}>
 *     <ResearchStage ... />
 *   </FlowErrorBoundary>
 */

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
    children: React.ReactNode;
    /** Human-readable stage name shown in the recovery message. */
    stage?: string;
    /** Called when the user clicks "Try again" — typically re-runs the stage. */
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    errorMessage: string;
}

export class FlowErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, errorMessage: "" };
    }

    static getDerivedStateFromError(err: Error): State {
        return {
            hasError: true,
            errorMessage: err?.message ?? "An unknown error occurred.",
        };
    }

    componentDidCatch(err: Error, info: React.ErrorInfo) {
        // Log to console so the error is visible in dev tools without crashing the UI.
        console.error(
            `[FlowErrorBoundary] Rendering error in "${this.props.stage ?? "unknown"}" stage:`,
            err,
            info.componentStack,
        );
    }

    handleReset = () => {
        this.setState({ hasError: false, errorMessage: "" });
        this.props.onReset?.();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        const { stage } = this.props;

        return (
            <div className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-6 space-y-4">
                {/* Header */}
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertCircle className="w-5 h-5 text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">
                            {stage
                                ? `The ${stage} stage hit an unexpected error`
                                : "Something went wrong"}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            This is a display error, not a data error — your pipeline progress is
                            safe. Click &ldquo;Try again&rdquo; to reload this stage.
                        </p>
                    </div>
                </div>

                {/* Collapsed technical detail — hidden by default, useful for debugging */}
                <details className="group">
                    <summary className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer select-none list-none flex items-center gap-1.5 transition-colors">
                        <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                        Technical detail
                    </summary>
                    <p className="mt-2 text-[10px] font-mono text-rose-400/60 bg-rose-500/[0.03] rounded-lg px-3 py-2 break-words leading-relaxed">
                        {this.state.errorMessage}
                    </p>
                </details>

                {/* Recovery button */}
                <button
                    onClick={this.handleReset}
                    className="flex items-center gap-2 text-sm font-semibold text-rose-400 hover:text-rose-300 transition-colors duration-200 group"
                >
                    <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                    Try again
                </button>
            </div>
        );
    }
}
