interface LogoProps {
    size?: "sm" | "md";
    className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
    const iconSize = size === "sm" ? "w-6 h-6" : "w-8 h-8";
    const padding = size === "sm" ? "p-[5px]" : "p-[7px]";

    return (
        <div className={`${iconSize} rounded-full bg-white flex items-center justify-center shrink-0 ${padding} ${className}`}>
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" className="block" style={{ transform: "translate(1px, 1px)" }}>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#10141a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}
