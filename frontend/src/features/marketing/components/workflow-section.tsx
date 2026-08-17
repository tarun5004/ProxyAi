import { ChartBar, GitBranch, ShieldCheck, Sparkle, User } from "@phosphor-icons/react/dist/ssr";

import { Reveal } from "../motion/reveal";
import { WorkspaceDemo } from "./workspace-demo";

const steps = [
    { detail: "A user sends an AI request from their workspace.", icon: User, title: "User makes a request" },
    { detail: "Sensitive data is detected and risk is classified.", icon: Sparkle, title: "ProxiAI inspects risk" },
    { detail: "Organisation policy allows, masks, or blocks safely.", icon: ShieldCheck, title: "Policy decides" },
    { detail: "Only the approved prompt reaches the configured provider.", icon: GitBranch, title: "Approved request is routed" },
    { detail: "The response streams back with safe decision metadata.", icon: ChartBar, title: "Response returns safely" },
] as const;

export function WorkflowSection() {
    return (
        <section className="relative overflow-hidden py-16 lg:py-18" aria-labelledby="workflow-heading">
            <div className="absolute right-0 bottom-0 h-80 w-80 opacity-25 [background-image:radial-gradient(rgb(11_143_56_/_45%)_1px,transparent_1px)] [background-size:14px_14px]" />
            <div className="relative mx-auto grid w-full max-w-295 gap-14 px-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:px-8">
                <Reveal>
                    <p className="text-[11px] font-bold tracking-[0.06em] text-brand-dark">BUILT FOR ENTERPRISES</p>
                    <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-text-primary" id="workflow-heading">How ProxiAI works</h2>

                    <ol className="relative mt-8 space-y-6 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-border-default">
                        {steps.map(({ detail, icon: Icon, title }) => (
                            <li className="relative flex gap-4" key={title}>
                                <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-border-default bg-surface text-brand shadow-panel">
                                    <Icon size={19} aria-hidden="true" />
                                </span>
                                <div className="pt-1">
                                    <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                                    <p className="mt-1 text-xs leading-5 text-text-soft">{detail}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Reveal>

                <Reveal delayMs={120}>
                    <WorkspaceDemo />
                </Reveal>
            </div>
        </section>
    );
}
