import { ChevronLeft, ChevronRight } from "lucide-react";

export function CalendarWidget() {
    return (
        <div className="bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden transition-all hover:border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <button className="w-8 h-8 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/5 transition-colors text-zinc-400 hover:text-white">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-white font-bold tracking-wide">June 2026</div>
                <button className="w-8 h-8 rounded-full flex items-center justify-center border border-white/5 hover:bg-white/5 transition-colors text-zinc-400 hover:text-white">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Days row */}
            <div className="grid grid-cols-7 mb-4">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {day}
                    </div>
                ))}
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-7 gap-y-3">
                {[...Array(30)].map((_, i) => {
                    const date = i + 1;
                    const isActive = date === 9 || date === 13;
                    const isBetween = date > 9 && date < 13;

                    return (
                        <div key={date} className="flex items-center justify-center">
                            <span
                                className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold cursor-pointer transition-colors ${isActive
                                    ? "bg-[#10B981] text-white shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                                    : isBetween
                                        ? "bg-white/5 text-white"
                                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                                    }`}
                            >
                                {date}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
