"use client";

import { useState } from "react";

import { SectionHeading } from "./section-heading";

const nodes = {
    dns: { x: 40, y: 140, w: 130, h: 44, label: "Route53 + ACM", sub: "DNS · TLS" },
    alb: { x: 220, y: 140, w: 130, h: 44, label: "Load Balancer", sub: "public entry" },
    next: { x: 430, y: 50, w: 150, h: 44, label: "Next.js task", sub: "product surface" },
    api: { x: 430, y: 140, w: 150, h: 44, label: "Express API task", sub: "authoritative" },
    worker: { x: 430, y: 230, w: 150, h: 44, label: "BullMQ worker", sub: "background jobs" },
    atlas: { x: 660, y: 90, w: 130, h: 40, label: "Atlas", sub: "database" },
    redis: { x: 660, y: 145, w: 130, h: 40, label: "Redis", sub: "queue + cache" },
    groq: { x: 660, y: 200, w: 130, h: 40, label: "Groq", sub: "provider" },
} as const;

type NodeKey = keyof typeof nodes;

const edges: [NodeKey, NodeKey][] = [
    ["dns", "alb"],
    ["alb", "next"],
    ["alb", "api"],
    ["api", "worker"],
    ["api", "atlas"],
    ["api", "redis"],
    ["worker", "redis"],
    ["api", "groq"],
];

const detailCopy: Record<NodeKey, string> = {
    dns: "Public DNS and TLS termination — the only edge exposed directly to the internet.",
    alb: "Routes / and default traffic to the Next.js task; /api and /health to the Express API task.",
    next: "Public product surface. Immutable ECR image, no secrets baked into the bundle.",
    api: "Authoritative application boundary — every policy, auth, and PII decision happens here.",
    worker: "Private, long-running background processing. Never reachable from outside the network.",
    atlas: "External database dependency, reached only from inside the private application network.",
    redis: "Idempotency, rate limits, and durable queue state for BullMQ workers.",
    groq: "The only enabled production provider, called from behind the policy boundary.",
};

function pathBetween(a: (typeof nodes)[NodeKey], b: (typeof nodes)[NodeKey]) {
    const startX = a.x + a.w;
    const startY = a.y + a.h / 2;
    const endX = b.x;
    const endY = b.y + b.h / 2;
    const midX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

export function DeploymentSection() {
    const [activeNode, setActiveNode] = useState<NodeKey>("api");

    return (
        <section className="py-20 sm:py-28" aria-labelledby="deployment-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description="Immutable ECR images define separate frontend, API, and worker ECS/Fargate services. Secrets stay in AWS Secrets Manager rather than the frontend bundle or image layers."
                    eyebrow="CANONICAL DEPLOYMENT"
                    id="deployment-heading"
                    title="AWS ECS/Fargate with a private application tier."
                />

                <div className="mt-12 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                    <div className="overflow-x-auto rounded-3xl border border-line bg-white p-4 shadow-soft sm:p-6">
                        <svg viewBox="0 0 830 300" className="min-w-[720px]" role="img" aria-label="AWS deployment topology from public internet to private application tier">
                            <rect x="405" y="20" width="410" height="240" rx="16" fill="var(--color-surface-muted)" stroke="var(--color-brand-200)" strokeWidth="1.5" strokeDasharray="5 5" />
                            <text x="421" y="14" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="700" fill="var(--color-brand-700)" letterSpacing="0.5">
                                PRIVATE APPLICATION NETWORK
                            </text>

                            {edges.map(([from, to]) => {
                                const isLit = activeNode === from || activeNode === to;
                                return (
                                    <path
                                        d={pathBetween(nodes[from], nodes[to])}
                                        fill="none"
                                        key={`${from}-${to}`}
                                        stroke={isLit ? "var(--color-brand-500)" : "var(--color-line)"}
                                        strokeWidth={isLit ? 2 : 1.5}
                                        style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
                                    />
                                );
                            })}

                            {(Object.keys(nodes) as NodeKey[]).map((key) => {
                                const node = nodes[key];
                                const isActive = activeNode === key;
                                const isExternal = key === "atlas" || key === "redis" || key === "groq";
                                return (
                                    <g
                                        key={key}
                                        onMouseEnter={() => setActiveNode(key)}
                                        onFocus={() => setActiveNode(key)}
                                        style={{ cursor: "pointer" }}
                                        tabIndex={0}
                                        role="button"
                                        aria-pressed={isActive}
                                        aria-label={node.label}
                                    >
                                        <rect
                                            x={node.x}
                                            y={node.y}
                                            width={node.w}
                                            height={node.h}
                                            rx="10"
                                            fill={isActive ? "var(--color-brand-500)" : isExternal ? "white" : "var(--color-ink-950)"}
                                            stroke={isActive ? "var(--color-brand-500)" : isExternal ? "var(--color-line)" : "transparent"}
                                            strokeWidth="1.5"
                                            style={{ transition: "fill 0.2s" }}
                                        />
                                        <text
                                            x={node.x + node.w / 2}
                                            y={node.y + node.h / 2 - 4}
                                            textAnchor="middle"
                                            fontSize="12"
                                            fontWeight="700"
                                            fill={isActive ? "white" : isExternal ? "var(--color-ink-950)" : "white"}
                                        >
                                            {node.label}
                                        </text>
                                        <text
                                            x={node.x + node.w / 2}
                                            y={node.y + node.h / 2 + 12}
                                            textAnchor="middle"
                                            fontSize="9.5"
                                            fontFamily="ui-monospace, monospace"
                                            fill={isActive ? "rgba(255,255,255,0.75)" : isExternal ? "var(--color-ink-600)" : "rgba(255,255,255,0.5)"}
                                        >
                                            {node.sub}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface-muted p-6 sm:p-7">
                        <div aria-live="polite">
                            <p className="font-mono text-xs font-bold tracking-[0.08em] text-brand-700">{nodes[activeNode].label.toUpperCase()}</p>
                            <p className="mt-3 text-sm leading-7 text-ink-800">{detailCopy[activeNode]}</p>
                        </div>
                        <p className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4 text-xs leading-6 text-brand-700">
                            The low-traffic demo uses one task per service and snapshot-driven deep stop/start for cost control. This is not a multi-task high-availability claim.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}