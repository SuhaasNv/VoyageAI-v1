import { Map as MapIcon, Layers, Maximize } from "lucide-react";

export function InteractiveMap() {
    return (
        <div className="relative w-full h-full bg-zinc-900 overflow-hidden">
            {/* Visual Mock of a modern dark mode map */}
            <div
                className="absolute inset-0 z-0 opacity-60 mix-blend-screen"
                style={{
                    backgroundImage: `url('https://maps.googleapis.com/maps/api/staticmap?center=Tokyo&zoom=13&size=800x800&maptype=roadmap&style=feature:all|element:labels.text.fill|color:0x8ec3b9&style=feature:all|element:labels.text.stroke|color:0x1a3646&style=feature:all|element:labels.icon|visibility:off&style=feature:administrative.country|element:geometry.stroke|color:0x4b6878&style=feature:administrative.province|element:geometry.stroke|color:0x4b6878&style=feature:administrative.locality|element:labels.text.fill|color:0xc4dd8f&style=feature:administrative.neighborhood|element:labels.text.fill|color:0xe5c163&style=feature:landscape.natural|element:geometry|color:0x023e58&style=feature:poi|element:geometry|color:0x283d6a&style=feature:poi|element:labels.text.fill|color:0x6f9ba5&style=feature:poi|element:labels.text.stroke|color:0x1d2c4d&style=feature:poi.park|element:geometry.fill|color:0x023e58&style=feature:poi.park|element:labels.text.fill|color:0x3C7680&style=feature:road|element:geometry|color:0x304a7d&style=feature:road|element:labels.text.fill|color:0x98a5be&style=feature:road|element:labels.text.stroke|color:0x1d2c4d&style=feature:road.highway|element:geometry|color:0x2c6675&style=feature:road.highway|element:geometry.stroke|color:0x255763&style=feature:road.highway|element:labels.text.fill|color:0xb0d5ce&style=feature:road.highway|element:labels.text.stroke|color:0x023e58&style=feature:transit|element:labels.text.fill|color:0x98a5be&style=feature:transit|element:labels.text.stroke|color:0x1d2c4d&style=feature:transit.line|element:geometry.fill|color:0x283d6a&style=feature:transit.station|element:geometry|color:0x3a4762&style=feature:water|element:geometry|color:0x0e1626&style=feature:water|element:labels.text.fill|color:0x4e6d70&sensor=false')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'grayscale(0.5) contrast(1.2)'
                }}
            />

            {/* Fallback pattern if image fails to load */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800/20 via-zinc-950/80 to-zinc-950 z-[1]" />

            {/* Map Controls Mock */}
            <div className="absolute top-6 right-6 z-20 flex flex-col gap-2">
                <button className="w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/5 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/10 hover:bg-black/80 transition-all shadow-xl">
                    <Layers className="w-4 h-4" />
                </button>
                <button className="w-10 h-10 bg-black/60 backdrop-blur-xl border border-white/5 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/10 hover:bg-black/80 transition-all shadow-xl">
                    <Maximize className="w-4 h-4" />
                </button>
            </div>

            {/* Route Line Mock */}
            <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 200 300 Q 350 400 300 500 T 500 600" fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="4 6" opacity="0.4" />
            </svg>

            {/* Map Pins Mock */}
            {[
                { x: '20%', y: '30%', label: 'Shinjuku Granbell' },
                { x: '45%', y: '60%', label: 'Shibuya Crossing' },
                { x: '65%', y: '40%', label: 'Akihabara', active: true },
                { x: '80%', y: '70%', label: 'teamLab Planets' },
            ].map((pin, i) => (
                <div
                    key={i}
                    className="absolute z-20 flex flex-col items-center group cursor-pointer"
                    style={{ left: pin.x, top: pin.y }}
                >
                    <div className="relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-xl transition-transform group-hover:scale-110 ${pin.active
                            ? 'bg-[#10B981] text-white shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                            : 'bg-black/80 backdrop-blur-md border border-white/10 text-zinc-400'
                            }`}>
                            <MapIcon className="w-4 h-4" />
                        </div>
                        {pin.active && (
                            <div className="absolute -inset-2 rounded-full border border-[#10B981]/30 opacity-50"></div>
                        )}
                    </div>
                    <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-xl backdrop-blur-xl transition-all ${pin.active
                        ? 'bg-[#10B981] text-white'
                        : 'bg-black/60 text-zinc-300 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 border border-white/5'
                        }`}>
                        {pin.label}
                    </div>
                </div>
            ))}
        </div>
    );
}
