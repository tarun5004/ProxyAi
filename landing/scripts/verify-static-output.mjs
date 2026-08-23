import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../out/", import.meta.url));

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }));

    return nestedFiles.flat();
}

const files = await listFiles(outputDirectory);
const textFiles = files.filter((file) => /\.(?:css|html|js|json|txt)$/u.test(file));
const combinedOutput = (await Promise.all(textFiles.map((file) => readFile(file, "utf8")))).join("\n");

const requiredText = [
    "Govern enterprise AI before sensitive data reaches a provider.",
    "https://app.proxiai.me/demo-admin",
    "https://github.com/tarun5004/ProxyAi",
    "VERIFIED RELEASE EVIDENCE",
];

const prohibitedText = [
    "Certified release evidence",
    "SOC 2 certified",
    "SOC2 certified",
    "HIPAA certified",
    "ISO certified",
    "GDPR certified",
    "Trusted by",
    "automatic key rotation",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "GROQ_API_KEY",
    "JWT_ACCESS_SECRET",
    "MONGO_URI",
    "REDIS_URL",
    "localhost:8080",
    "/api/v1/",
];

for (const expected of requiredText) {
    if (!combinedOutput.includes(expected)) {
        throw new Error(`Static landing output is missing required text: ${expected}`);
    }
}

for (const prohibited of prohibitedText) {
    if (combinedOutput.includes(prohibited)) {
        throw new Error(`Static landing output contains prohibited text: ${prohibited}`);
    }
}

console.log(`Static landing output verified across ${textFiles.length} text files.`);
console.log(`Output root: ${relative(process.cwd(), outputDirectory) || "out"}`);
