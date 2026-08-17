import { describe, expect, it } from "vitest";

import { loginInputSchema } from "./auth.types";

describe("login input", () => {
    it("normalizes identifiers without trimming password spaces", () => {
        const result = loginInputSchema.parse({
            organisationSlug: "  acme-corp  ",
            email: "  user@example.com  ",
            password: "  preserved password  ",
        });

        expect(result).toEqual({
            organisationSlug: "acme-corp",
            email: "user@example.com",
            password: "  preserved password  ",
        });
    });
});
