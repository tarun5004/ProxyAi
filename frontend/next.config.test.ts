import { describe, expect, it } from "vitest";

import { createNextConfig } from "./next.config";

describe("frontend deployment output", () => {
    it("uses Vercel-managed Next.js output during Vercel builds", () => {
        const config = createNextConfig({
            NODE_ENV: "production",
            VERCEL: "1",
        });

        expect(config.output).toBeUndefined();
    });

    it("preserves standalone output for Docker and AWS builds", () => {
        const config = createNextConfig({
            NODE_ENV: "production",
        });

        expect(config.output).toBe("standalone");
    });
});
