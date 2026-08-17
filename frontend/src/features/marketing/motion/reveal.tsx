import type { ReactNode } from "react";

type RevealProps = Readonly<{
    children: ReactNode;
    className?: string;
    delayMs?: number;
}>;

export function Reveal({ children, className = "", delayMs = 0 }: RevealProps) {
    return (
        <div
            className={`${className} motion-safe:animate-marketing-rise motion-reduce:animate-none`}
            style={{ animationDelay: `${delayMs}ms` }}
        >
            {children}
        </div>
    );
}
