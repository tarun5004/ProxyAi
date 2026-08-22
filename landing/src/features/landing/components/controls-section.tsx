import { piiCategories, rbacRoles } from "../content";
import { SectionHeading } from "./section-heading";

export function ControlsSection() {
    return (
        <section className="border-y border-line bg-ink-950 py-20 text-white sm:py-28" id="controls" aria-labelledby="controls-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <SectionHeading
                    description={<span className="text-white/65">Implemented controls are explicit, tenant scoped, and tested. ProxiAI does not convert planned capabilities into public claims.</span>}
                    eyebrow="SECURITY DESIGN"
                    id="controls-heading"
                    theme="dark"
                    title="Protect data without hiding the enforcement boundary."
                />

                <div className="mt-12 grid gap-5 lg:grid-cols-2">
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
                        <h3 className="text-xl font-bold">Deterministic sensitive-data controls</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">Rule-based detection preserves source spans, classifies without raw values, scores risk, and masks derived prompts without mutating the original request.</p>
                        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Implemented PII categories">
                            {piiCategories.map((category) => (
                                <li className="rounded-lg border border-white/10 bg-white/7 px-3 py-2 font-mono text-xs text-white/85" key={category}>{category}</li>
                            ))}
                        </ul>
                    </article>

                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
                        <h3 className="text-xl font-bold">Encrypted or metadata-only retention</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">AES-256-GCM storage uses a versioned runtime keyring, unique IVs, and tenant/resource-bound AAD. Encryption failure is strict: there is no plaintext fallback.</p>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 p-4">
                                <p className="font-mono text-xs font-bold text-brand-200">METADATA_ONLY</p>
                                <p className="mt-2 text-sm text-white/65">No message content is stored.</p>
                            </div>
                            <div className="rounded-xl border border-white/10 p-4">
                                <p className="font-mono text-xs font-bold text-brand-200">ENCRYPTED_STORAGE</p>
                                <p className="mt-2 text-sm text-white/65">Completed user and assistant content is stored as ciphertext for owner-authorized reads.</p>
                            </div>
                        </div>
                    </article>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <article className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
                        <h3 className="text-xl font-bold">Database-backed RBAC</h3>
                        <p className="mt-3 text-sm leading-7 text-white/65">Access tokens identify the session; current user status, organisation status, role, and canonical permissions are reloaded from the database.</p>
                        <div className="mt-6 grid gap-3">
                            {rbacRoles.map((role) => (
                                <div className="grid gap-2 rounded-xl border border-white/10 p-4 sm:grid-cols-[9rem_1fr]" key={role.role}>
                                    <p className="font-mono text-xs font-bold text-brand-200">{role.role}</p>
                                    <p className="text-sm leading-6 text-white/65">{role.detail}</p>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-6 sm:p-8">
                        <h3 className="text-xl font-bold">Append-only audit trail</h3>
                        <ul className="mt-5 grid gap-4 text-sm leading-6 text-white/70">
                            <li>Tenant-scoped, bounded safe metadata.</li>
                            <li>Required admin mutations commit with their audit event.</li>
                            <li>AuditLog update and delete operations are forbidden.</li>
                            <li>CSV export protects against spreadsheet formula injection.</li>
                            <li>No raw prompt, password, token, or secret payload.</li>
                        </ul>
                    </article>
                </div>
            </div>
        </section>
    );
}
