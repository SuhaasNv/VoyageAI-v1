import { PieChart, TrendingUp, DollarSign } from "lucide-react";

interface BudgetOverviewCardProps {
    totalBudget: number;
    totalSpent?: number;
    currency?: string;
}

export function BudgetOverviewCard({ totalBudget, totalSpent = 0, currency = "USD" }: BudgetOverviewCardProps) {
    const symbol = currency === "USD" ? "$" : currency + " ";
    const percentage = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const remaining = totalBudget - totalSpent;

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
                    YTD
                </span>
            </div>

            <div className="space-y-6">
                <div>
                    <div className="flex items-end gap-2 mb-1">
                        <span className="text-4xl font-black tracking-tighter text-white">
                            {totalBudget > 0 ? `${symbol}${totalBudget.toLocaleString()}` : "—"}
                        </span>
                        {totalBudget > 0 && (
                            <span className="text-sm text-zinc-500 font-medium mb-1">planned</span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-500 font-medium">Total estimated across all trips</p>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                        <span className={percentage > 80 ? "text-rose-400" : "text-[#10B981]"}>
                            {totalBudget > 0 ? `${percentage}% spent` : "No itinerary yet"}
                        </span>
                        <span className="text-zinc-500 font-medium">
                            {totalBudget > 0 ? `${symbol}${remaining.toLocaleString()} remaining` : ""}
                        </span>
                    </div>
                    <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${percentage > 80 ? "from-rose-500 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]" : "from-[#34D399] to-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.2)]"}`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white border-opacity-5">
                    <div className="flex items-center gap-3 p-3 rounded-[1rem] bg-white/[0.02] border border-white/5 hover:border-[#10B981]/20 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-[#10B981]/10 flex items-center justify-center text-[#10B981]">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Planned</div>
                            <div className="text-sm font-bold text-white">
                                {totalBudget > 0 ? `${symbol}${totalBudget.toLocaleString()}` : "—"}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-[1rem] bg-white/[0.02] border border-white/5 hover:border-rose-500/20 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
                            <DollarSign className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Spent</div>
                            <div className="text-sm font-bold text-white">{symbol}{totalSpent.toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
