import { ShieldCheck } from "@phosphor-icons/react";

import type { RetentionMode } from "@/features/auth/auth.types";

const retentionCopy = {
    METADATA_ONLY: {
        label: "Metadata only",
        description: "Prompt and response content are not stored.",
    },
    ENCRYPTED_STORAGE: {
        label: "Encrypted history",
        description: "Completed messages are encrypted for your authorized history.",
    },
} satisfies Record<RetentionMode, {
    readonly label: string;
    readonly description: string;
}>;

export function RetentionIndicator({ mode }: Readonly<{ mode: RetentionMode }>) {
    const copy = retentionCopy[mode];

    return (
        <div
            className="inline-flex min-w-0 items-center gap-2 text-[11px] text-text-faint"
            role="note"
            aria-label="Message retention"
        >
            <ShieldCheck className="shrink-0" size={18} />
            <span className="min-w-0">
                <strong className="font-semibold text-text-soft">{copy.label}</strong>
                <span aria-hidden="true"> · </span>
                {copy.description}
            </span>
        </div>
    );
}
