import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        coverage: {
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/**/*.test.{ts,tsx}",
                "src/**/*.d.ts",
            ],
            reporter: ["text", "json-summary", "lcov"],
            reportsDirectory: "coverage",
            thresholds: {
                lines: 60,
            },
        },
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
    },
});
