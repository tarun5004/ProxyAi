import {
    Atom,
    Circuitry,
    Infinity,
    ShieldChevron,
    User,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import type { ReactNode } from "react";

export function ProxyFlowVisual() {
    return (
        <div className="relative mx-auto h-100 w-full max-w-150 overflow-hidden lg:h-120" aria-label="User requests pass through ProxiAI before reaching AI providers">
            <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgb(126_219_153_/_23%)_0%,rgb(235_249_239_/_35%)_38%,transparent_72%)] motion-safe:animate-proxy-breathe motion-reduce:animate-none" />

            <div className="absolute top-1/2 left-[16%] h-px w-[30%] -translate-y-1/2 border-t border-dashed border-brand/25" />
            <div className="absolute top-1/2 right-[15%] h-px w-[30%] -translate-y-1/2 border-t border-dashed border-brand/25" />
            <div className="absolute top-[22%] right-[15%] h-[56%] w-[20%] border-y border-r border-dashed border-brand/15" />

            <FlowNode className="top-1/2 left-[6%] -translate-y-1/2" label="User">
                <User size={34} weight="regular" />
            </FlowNode>

            <div className="absolute top-1/2 left-1/2 grid size-40 -translate-x-1/2 -translate-y-1/2 place-items-center lg:size-48">
                <ShieldChevron className="absolute inset-0 size-full text-white drop-shadow-[0_18px_38px_rgb(17_83_40_/_10%)]" weight="fill" />
                <Image
                    className="relative z-10 h-auto w-23 object-contain lg:w-28"
                    src="/proxiai-logo.png"
                    alt="ProxiAI proxy"
                    width={360}
                    height={90}
                    priority
                />
            </div>

            <FlowNode className="top-[12%] right-[4%]" label="AI provider">
                <Atom size={31} />
            </FlowNode>
            <FlowNode className="top-1/2 right-[4%] -translate-y-1/2" label="AI provider">
                <Circuitry size={31} />
            </FlowNode>
            <FlowNode className="right-[4%] bottom-[12%]" label="AI provider">
                <Infinity size={33} />
            </FlowNode>
        </div>
    );
}

function FlowNode({
    children,
    className,
    label,
}: Readonly<{
    children: ReactNode;
    className: string;
    label: string;
}>) {
    return (
        <div
            className={`absolute z-10 grid size-17 place-items-center rounded-xl border border-brand/30 bg-surface text-text-primary shadow-panel motion-safe:animate-marketing-rise motion-reduce:animate-none lg:size-20 ${className}`}
            aria-label={label}
        >
            {children}
        </div>
    );
}
