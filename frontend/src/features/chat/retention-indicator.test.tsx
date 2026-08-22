import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RetentionIndicator } from "./retention-indicator";

afterEach(cleanup);

describe("pre-send retention indicator", () => {
    it.each([
        [
            "METADATA_ONLY" as const,
            "Metadata only",
            "Prompt and response content are not stored.",
        ],
        [
            "ENCRYPTED_STORAGE" as const,
            "Encrypted history",
            "Completed messages are encrypted for your authorized history.",
        ],
    ])("renders truthful %s copy without encryption internals", (mode, label, description) => {
        const { container } = render(<RetentionIndicator mode={mode} />);

        expect(screen.getByRole("note", { name: "Message retention" })).toHaveTextContent(label);
        expect(screen.getByRole("note", { name: "Message retention" })).toHaveTextContent(description);
        expect(container.textContent).not.toMatch(/cipher|key version|initialization vector|tag/iu);
    });
});
