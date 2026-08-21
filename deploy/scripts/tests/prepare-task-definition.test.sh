#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "${temporary}"' EXIT
mkdir -p "${temporary}/bin"

cat > "${temporary}/bin/aws" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "${1:-} ${2:-}" == "ecs describe-task-definition" ]] || exit 1
cat "${TASK_DEFINITION_FIXTURE}"
EOF
chmod +x "${temporary}/bin/aws"

cat > "${temporary}/bin/jq" <<'EOF'
#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const values = new Map();
let filter;
let inputPath;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--arg") {
    values.set(args[index + 1], args[index + 2]);
    index += 2;
  } else if (args[index].startsWith("-")) {
    continue;
  } else if (filter === undefined) {
    filter = args[index];
  } else {
    inputPath = args[index];
  }
}
if (filter === undefined || inputPath === undefined) process.exit(2);
const input = JSON.parse(readFileSync(inputPath, "utf8"));
const container = values.get("container");

if (filter.includes("[.containerDefinitions[]") && filter.includes("| length")) {
  console.log(input.containerDefinitions.filter((entry) => entry.name === container).length);
} else if (filter.includes("(.containerDefinitions[]") && filter.includes(".image) = $image")) {
  const entry = input.containerDefinitions.find((candidate) => candidate.name === container);
  entry.image = values.get("image");
  for (const key of ["compatibilities", "registeredAt", "registeredBy", "requiresAttributes", "revision", "status", "taskDefinitionArn"]) delete input[key];
  writeFileSync(1, `${JSON.stringify(input)}\n`);
} else if (filter.includes(".containerDefinitions[]") && filter.includes(".image")) {
  const entry = input.containerDefinitions.find((candidate) => candidate.name === container);
  if (entry === undefined) process.exit(4);
  console.log(entry.image);
} else {
  process.exit(2);
}
EOF
chmod +x "${temporary}/bin/jq"
export PATH="${temporary}/bin:${PATH}"
export AWS_REGION="test-region"

cat > "${temporary}/one-container.json" <<'JSON'
{"containerDefinitions":[{"name":"api","image":"old"},{"name":"sidecar","image":"sidecar"}]}
JSON
export TASK_DEFINITION_FIXTURE="${temporary}/one-container.json"
"${root}/deploy/scripts/prepare-task-definition.sh" family api repo@example "${temporary}/prepared.json"
node -e 'const value=require(process.argv[1]); if(value.containerDefinitions.find((entry)=>entry.name==="api")?.image!=="repo@example") process.exit(1)' "${temporary}/prepared.json"

if "${root}/deploy/scripts/prepare-task-definition.sh" family missing repo@example "${temporary}/missing.json" 2>/dev/null; then
  echo "Task preparation accepted a missing container." >&2
  exit 1
fi

cat > "${temporary}/duplicate-container.json" <<'JSON'
{"containerDefinitions":[{"name":"api","image":"old"},{"name":"api","image":"older"}]}
JSON
export TASK_DEFINITION_FIXTURE="${temporary}/duplicate-container.json"
if "${root}/deploy/scripts/prepare-task-definition.sh" family api repo@example "${temporary}/duplicate.json" 2>/dev/null; then
  echo "Task preparation accepted duplicate container names." >&2
  exit 1
fi

echo "PASS task definition image preparation"
