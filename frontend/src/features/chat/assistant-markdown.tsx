import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export function AssistantMarkdown({ content }: Readonly<{ content: string }>) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            urlTransform={defaultUrlTransform}
            components={{
                h1: ({ children }) => <h1 className="mt-1 mb-3 text-xl font-bold leading-tight">{children}</h1>,
                h2: ({ children }) => <h2 className="mt-5 mb-2 text-lg font-bold leading-tight">{children}</h2>,
                h3: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold leading-tight">{children}</h3>,
                p: ({ children }) => <p className="my-2 wrap-anywhere leading-[1.7]">{children}</p>,
                ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
                li: ({ children }) => <li className="pl-1 leading-[1.65]">{children}</li>,
                blockquote: ({ children }) => (
                    <blockquote className="my-3 border-l-3 border-brand/50 pl-4 text-text-soft">
                        {children}
                    </blockquote>
                ),
                pre: ({ children }) => (
                    <pre className="my-3 max-w-full overflow-x-auto rounded-xl bg-[#17201a] p-4 text-[13px] leading-6 text-[#eef7f0]">
                        {children}
                    </pre>
                ),
                code: ({ children, className }) => (
                    <code className={className ?? "rounded bg-surface-soft px-1.5 py-0.5 text-[0.92em] text-brand-dark"}>
                        {children}
                    </code>
                ),
                table: ({ children }) => (
                    <div className="my-4 max-w-full overflow-x-auto rounded-xl border border-border-default">
                        <table className="w-full min-w-120 border-collapse text-left text-[13px]">
                            {children}
                        </table>
                    </div>
                ),
                thead: ({ children }) => <thead className="bg-surface-soft">{children}</thead>,
                th: ({ children }) => <th className="border-b border-border-default px-3 py-2.5 font-semibold">{children}</th>,
                td: ({ children }) => <td className="border-b border-border-default px-3 py-2.5 align-top last:border-b-0">{children}</td>,
                a: ({ children, href }) => (
                    <a
                        className="font-medium text-brand-dark underline decoration-brand/40 underline-offset-3"
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        {children}
                    </a>
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
