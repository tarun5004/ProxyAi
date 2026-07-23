import { createRequire } from "node:module";

import { z } from "zod";

import { env } from "./env.js";

const require = createRequire(import.meta.url);
const packageJson: unknown = require("../../package.json");
const packageMetadata = z
    .object({
        version: z.string().trim().min(1),
    })
    .parse(packageJson);

export const serviceMetadata = Object.freeze({
    name: "proxiai-api",
    version: packageMetadata.version,
    ...(env.COMMIT_SHA ? { commitSha: env.COMMIT_SHA } : {}),
});
