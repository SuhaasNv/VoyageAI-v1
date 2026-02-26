interface PageContentProps {
    children: React.ReactNode;
    className?: string;
}

export function PageContent({ children, className = "" }: PageContentProps) {
    return (
        <section className={`px-6 lg:px-12 pb-24 max-w-4xl mx-auto ${className}`}>
            <div className="prose prose-invert prose-slate max-w-none">
                <div className="text-slate-300 leading-relaxed space-y-6">
                    {children}
                </div>
            </div>
        </section>
    );
}
