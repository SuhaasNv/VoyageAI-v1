import { Plane } from "lucide-react";

export function MapSimulationPanel() {
    return (
        <div className="relative w-full h-[240px] md:h-[340px] bg-white/[0.02] border border-white/5 rounded-3xl overflow-hidden group shadow-2xl">
            {/* Minimal Background Plate */}
            <div className="absolute inset-0 bg-[#0B0F14]/50 backdrop-blur-md" />

            {/* Glowing route arc using SVG */}
            <svg
                className="absolute inset-0 w-full h-full opacity-60"
                viewBox="0 0 800 400"
                preserveAspectRatio="xMidYMid meet"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Dotted background path */}
                <path d="M 150 220 Q 400 80 650 160" fill="transparent" stroke="rgba(16,185,129,0.3)" strokeWidth="2" strokeDasharray="4,6" />

                {/* Animated progress path - pure css via tailwind arbitrary values or inline style */}
                <path
                    d="M 150 220 Q 400 80 650 160"
                    fill="transparent"
                    stroke="#10B981"
                    strokeWidth="3"
                    strokeDasharray="800"
                    strokeDashoffset="800"
                    style={{ animation: 'dash-route 8s ease-in-out forwards' }}
                />

                {/* Dots at start/end */}
                <circle cx="150" cy="220" r="4" fill="#10B981" />
                <circle cx="150" cy="220" r="10" fill="rgba(16,185,129,0.15)" className="opacity-50" />
                <circle cx="650" cy="160" r="3" fill="#ffffff" />
            </svg>

            {/* Injected style for the route animation */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes dash-route {
                    0% { stroke-dashoffset: 800; }
                    100% { stroke-dashoffset: 200; }
                }
            `}} />

            {/* Simulated overlay data */}
            <div className="relative z-20 flex justify-between items-end px-[5%] mt-auto mb-10 w-full">
                <div className="bg-[#14151B]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 flex items-center gap-2 transform -translate-y-4 shadow-lg">
                    <span className="text-xs font-semibold text-white">New York</span>
                    <span className="text-[10px] text-zinc-500 font-medium">• Departure 6:30 PM</span>
                </div>

                <div className="relative transform -rotate-12 translate-y-6">
                    <div className="bg-[#10B981] p-2.5 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-in fade-in zoom-in duration-1000">
                        <Plane className="w-4 h-4 text-black fill-current" />
                    </div>
                </div>

                <div className="bg-[#14151B]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 flex items-center gap-2 transform -translate-y-8 shadow-lg">
                    <span className="text-xs font-semibold text-white">Milan</span>
                    <span className="text-[10px] text-zinc-500 font-medium">• Arrival 08:15 AM</span>
                </div>
            </div>

            {/* Bottom info bar */}
            <div className="flex items-center justify-between relative z-20 pt-6 border-t border-white/5 mt-auto">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Distance to arrival:</span>
                    <span className="text-[#10B981] font-black tracking-tight text-xl leading-none">2368 <span className="text-xs font-semibold text-zinc-400">/ 6470km</span></span>
                </div>

                <div className="bg-[#10B981]/10 border border-[#10B981]/20 px-3 py-1.5 rounded-md text-[#10B981] text-[10px] uppercase tracking-wider font-bold">
                    Currently Flying
                </div>
            </div>
        </div>
    );
}
