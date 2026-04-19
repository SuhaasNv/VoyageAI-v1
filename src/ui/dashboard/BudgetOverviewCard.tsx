import { PieChart, TrendingUp, Plane } from "lucide-react";
import { CurrencyService, type CurrencyCode } from "@/lib/services/currency.service";

interface BudgetOverviewCardProps {
    totalPlanned: number;
    tripCount?: number;
    currency?: string;
    /** Optional global budget target — if provided, shows an allocation bar. */
    budgetTarget?: number;
}

export function BudgetOverviewCard({
    totalPlanned,
    tripCount = 0,
    currency = "USD",
    budgetTarget,
}: BudgetOverviewCardProps) {
    const code = currency as CurrencyCode;
    const formattedPlanned = CurrencyService.format(totalPlanned, code);

    // Only show allocation bar + remaining if a global budget target is defined.
    const allocationPct = budgetTarget && budgetTarget > 0
        ? Math.min(Math.round((totalPlanned / budgetTarget) * 100), 100)
        : null;
    const remaining = budgetTarget ? budgetTarget - totalPlanned : null;
    const formattedRemaining = remaining !== null ? CurrencyService.format(Math.max(remaining, 0), code) : null;

    return (
        <div className="min-h-[280px] bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 relative overflow-hidden flex flex-col justify-between shadow-2xl transition-all hover:border-white/10">
            <div className="absolute top-0 right-0 w-40 h-40 bg-[#10B981] rounded-full blur-[100px] opacity-10 pointer-events-none" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-[#10B981] rounded-full blur-[80px] opacity-5 pointer-events-none" />

            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-[#10B981]" />
                    Budget Overview
                </h2>
                <span className="text-xs font-bold text-white bg-[#10B981] px-2.5 py-1 rounded-lg">
                    All Trips
                </span>
            </div>

            <div className="space-y-6">
                {/* Primary number */}
                <div>
                    <div className="flex items-end gap-2 mb-1">
                        <span className="text-4xl font-black tracking-tighter text-white">
                            {totalPlanned > 0 ? formattedPlanned : "—"}
                        </span>
                        {totalPlanned > 0 && (
                            <span className="text-sm text-zinc-500 font-medium mb-1 leading-none">planned</span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">
                        {tripCount > 0
                            ? `Across ${tripCount} ${tripCount === 1 ? "trip" : "trips"}`
                            : "No trips yet"}
                    </p>
                </div>

                {/* Allocation bar — only when a global budget target exists */}
                {allocationPct !== null && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                            <span className={allocationPct > 80 ? "text-rose-400" : "text-[#10B981]"}>
                                {allocationPct}% of budget allocated
                            </span>
                            {formattedRemaining !== null && (
                                <span className="text-zinc-500 font-medium">
                                    {formattedRemaining} remaining
                                </span>
                            )}
                        </div>
                        <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${allocationPct > 80 ? "from-rose-500 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]" : "from-[#34D399] to-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.2)]"}`}
                                style={{ width: `${allocationPct}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Bottom metric cards */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white border-opacity-5">
                    <div className="flex items-center gap-3 p-3 rounded-[1rem] bg-white/[0.02] border border-white/5 hover:border-[#10B981]/20 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center text-[#10B981]">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Planned</div>
                            <div className="text-sm font-bold text-white">
                                {totalPlanned > 0 ? formattedPlanned : "—"}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-[1rem] bg-white/[0.02] border border-white/5 hover:border-[#10B981]/20 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center text-[#10B981]">
                            <Plane className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Trips</div>
                            <div className="text-sm font-bold text-white">{tripCount}</div>
                        </div>
                    </div>
                </div>

                <p className="text-[10px] text-zinc-600">Estimates based on your planned trips</p>
            </div>
        </div>
    );
}
