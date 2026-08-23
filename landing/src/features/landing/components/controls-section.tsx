"use client";

import { useState } from "react";

import { piiCategories, rbacRoles } from "../content";
import { SectionHeading } from "./section-heading";

export function ControlsSection() {
    const [activeRole, setActiveRole] = useState(0);

    return (
        <section className="relative overflow-hidden border-y border-line bg-ink-950 py-20 text-white sm:py-28" id="controls" aria-labelledby="controls-heading">
            {/* Ambient background — faint grid + green glow, echoes architecture section */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 opacity-[0.12]"
                    style={{
                        backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
                        backgroundSize: "24px 24px",
                        maskImage: "radial-gradient(ellipse 70% 60% at 80% 0%, black 30%, transparent 90%)",
                        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 80% 0%, black 30%, transparent 90%)",
                    }}
                />
                <div className="absolute -top-24 -right-24 size-[26rem] rounded-full bg-brand-500/15 blur-[110px] motion-safe:animate-[drift_16s_ease-in-out_infinite]" />
            </div>

            <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description={<span className="text-white/65">Implemented controls are explicit, tenant scoped, and tested. ProxiAI does not convert planned capabilities into public claims.</span>}
                    eyebrow="SECURITY DESIGN"
                    id="controls-heading"
                    theme="dark"
                    title="Protect data without hiding the enforcement boundary."
                />

                <div className="mt-12 grid gap-5 lg:grid-cols-2">
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
                        <h3 className="text-xl font-bold">Deterministic sensitive-data controls</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">Rule-based detection preserves source spans, classifies without raw values, scores risk, and masks derived prompts without mutating the original request.</p>
                        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Implemented PII categories">
                            {piiCategories.map((category) => (
                                <li
                                    className="cursor-default rounded-lg border border-white/10 bg-white/7 px-3 py-2 font-mono text-xs text-white/85 transition-colors hover:border-brand-400/50 hover:bg-brand-500/15 hover:text-brand-100"
                                    key={category}
                                >
                                    {category}
                                </li>
                            ))}
                        </ul>
                    </article>

                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
                        <h3 className="text-xl font-bold">Encrypted or metadata-only retention</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">AES-256-GCM storage uses a versioned runtime keyring, unique IVs, and tenant/resource-bound AAD. Encryption failure is strict: there is no plaintext fallback.</p>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 p-4 transition-colors hover:border-brand-400/40">
                                <p className="font-mono text-xs font-bold text-brand-300">METADATA_ONLY</p>
                                <p className="mt-2 text-sm text-white/65">No message content is stored.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 p-4 transition-colors hover:border-brand-400/40">
                                <p className="font-mono text-xs font-bold text-brand-300">ENCRYPTED_STORAGE</p>
                                <p className="mt-2 text-sm text-white/65">Completed user and assistant content is stored as ciphertext for owner-authorized reads.</p>
                            </div>
                        </div>
                    </article>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    {/* RBAC — now an interactive role switcher instead of a static stacked list */}
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
                        <h3 className="text-xl font-bold">Database-backed RBAC</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">Access tokens identify the session; current user status, organisation status, role, and canonical permissions are reloaded from the database.</p>

                        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="RBAC roles">
                            {rbacRoles.map((role, index) => (
                                <button
                                    aria-controls="rbac-detail"
                                    aria-selected={activeRole === index}
                                    className={`rounded-lg px-3 py-2 font-mono text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${
                                        activeRole === index
                                            ? "bg-brand-500 text-white"
                                            : "border border-white/10 bg-white/5 text-white/60 hover:border-brand-400/40 hover:text-white"
                                    }`}
                                    key={role.role}
                                    onClick={() => setActiveRole(index)}
                                    onMouseEnter={() => setActiveRole(index)}
                                    role="tab"
                                    type="button"
                                >
                                    {role.role}
                                </button>
                            ))}
                        </div>

                        <div className="mt-4 min-h-[3.5rem] rounded-xl border border-white/10 bg-white/5 p-4" id="rbac-detail" aria-live="polite">
                            <p className="text-sm leading-6 text-white/70">{rbacRoles[activeRole].detail}</p>
                        </div>
                    </article>

                    <article className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-6 sm:p-8">
                        <h3 className="text-xl font-bold">Append-only audit trail</h3>
                        <ul className="mt-5 grid gap-3 text-sm leading-6 text-white/70">
                            {[
                                "Tenant-scoped, bounded safe metadata.",
                                "Required admin mutations commit with their audit event.",
                                "AuditLog update and delete operations are forbidden.",
                                "CSV export protects against spreadsheet formula injection.",
                                "No raw prompt, password, token, or secret payload.",
                            ].map((line) => (
                                <li className="flex gap-2.5" key={line}>
                                    <span className="mt-1 text-brand-400" aria-hidden="true">✓</span>
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                    </article>
                </div>
            </div>
        </section>
    );
}