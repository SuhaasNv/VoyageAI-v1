export function SkeletonCard({ className = "" }: { className?: string }) {
    return (
        <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse ${className}`}>
            <div className="h-3 w-1/3 rounded bg-white/[0.06] mb-3" />
            <div className="h-8 w-1/2 rounded bg-white/[0.08]" />
            <div className="h-2 w-2/5 rounded bg-white/[0.04] mt-2" />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] shrink-0" />
            <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
                <div className="h-2 w-1/2 rounded bg-white/[0.04]" />
            </div>
            <div className="h-4 w-12 rounded bg-white/[0.06]" />
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="rounded-xl border border-white/[0.08] overflow-hidden animate-pulse">
            <div className="h-10 bg-white/[0.02] border-b border-white/[0.06]" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] last:border-0">
                    <div className="w-8 h-8 rounded-full bg-white/[0.05]" />
                    <div className="flex-1 h-3 rounded bg-white/[0.05]" />
                    <div className="w-16 h-5 rounded bg-white/[0.04]" />
                    <div className="w-8 h-3 rounded bg-white/[0.04]" />
                </div>
            ))}
        </div>
    );
}
