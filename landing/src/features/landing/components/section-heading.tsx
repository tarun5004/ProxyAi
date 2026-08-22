import type { ReactNode } from "react";

export function SectionHeading({
    description,
    eyebrow,
    id,
    theme = "light",
    title,
}: Readonly<{
    description: ReactNode;
    eyebrow: string;
    id: string;
    theme?: "dark" | "light";
    title: string;
}>) {
    const isDark = theme === "dark";

    return (
        <div className="max-w-3xl">
            <p className={`text-xs font-bold tracking-[0.13em] ${isDark ? "text-brand-200" : "text-brand-700"}`}>{eyebrow}</p>
            <h2 className={`mt-4 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-4xl ${isDark ? "text-white" : "text-ink-950"}`} id={id}>
                {title}
            </h2>
            <p className={`mt-5 text-base leading-7 ${isDark ? "text-white/65" : "text-ink-600"}`}>{description}</p>
        </div>
    );
}
