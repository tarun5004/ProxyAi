#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "${temporary}"' EXIT
mkdir -p "${temporary}/bin"

cat > "${temporary}/bin/aws" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

case "${1:-} ${2:-}" in
  "ecs describe-services")
    cat <<JSON
[
  {"service":"${FRONTEND_SERVICE}","taskDefinition":"arn:previous:frontend"},
  {"service":"${API_SERVICE}","taskDefinition":"arn:previous:api"},
  {"service":"${WORKER_SERVICE}","taskDefinition":"arn:previous:worker"}
]
JSON
    ;;
  "ecs register-task-definition")
    case "$*" in
      *frontend-task.json*) echo "arn:new:frontend" ;;
      *api-task.json*) echo "arn:new:api" ;;
      *worker-task.json*) echo "arn:new:worker" ;;
      *) exit 1 ;;
    esac
    ;;
  "ecs run-task") echo "arn:index-task" ;;
  "ecs describe-tasks") echo "0" ;;
  "ecs update-service")
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "--service" ]]; then
        echo "update:$2" >> "${AWS_EVENT_LOG}"
        break
      fi
      shift
    done
    echo '{}'
    ;;
  "ecs wait")
    if [[ "${3:-}" == "services-stable" ]]; then
      while [[ $# -gt 0 ]]; do
        if [[ "$1" == "--services" ]]; then
          echo "wait:$2" >> "${AWS_EVENT_LOG}"
          break
        fi
        shift
      done
    fi
    ;;
  *) exit 1 ;;
esac
EOF
chmod +x "${temporary}/bin/aws"

cat > "${temporary}/bin/jq" <<'EOF'
#!/usr/bin/env node
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const serviceIndex = args.indexOf("service");
const service = args[serviceIndex + 1];
const input = JSON.parse(readFileSync(args.at(-1), "utf8"));
console.log(input.filter((entry) => entry.service === service).length);
EOF
chmod +x "${temporary}/bin/jq"

export PATH="${temporary}/bin:${PATH}"
export AWS_REGION="test-region"
export AWS_EVENT_LOG="${temporary}/events.log"
export FRONTEND_SERVICE="frontend-service"
export API_SERVICE="api-service"
export WORKER_SERVICE="worker-service"
export ECS_CLUSTER="test-cluster"
export PRIVATE_SUBNET_IDS="subnet-a,subnet-b"
export TASK_SECURITY_GROUP_ID="sg-test"

for file in frontend-task.json api-task.json worker-task.json; do
  printf '{}\n' > "${temporary}/${file}"
done
: > "${AWS_EVENT_LOG}"
(
  cd "${temporary}"
  "${root}/deploy/scripts/deploy-services.sh" frontend-task.json api-task.json worker-task.json > /dev/null
)
expected=$'update:api-service\nwait:api-service\nupdate:worker-service\nwait:worker-service\nupdate:frontend-service\nwait:frontend-service'
actual="$(cat "${AWS_EVENT_LOG}")"
[[ "${actual}" == "${expected}" ]] || {
  echo "Unexpected deployment order:" >&2
  printf '%s\n' "${actual}" >&2
  exit 1
}

: > "${AWS_EVENT_LOG}"
export FRONTEND_TASK_DEFINITION="arn:previous:frontend"
export API_TASK_DEFINITION="arn:previous:api"
export WORKER_TASK_DEFINITION="arn:previous:worker"
"${root}/deploy/scripts/rollback-services.sh" > /dev/null
actual="$(cat "${AWS_EVENT_LOG}")"
[[ "${actual}" == "${expected}" ]] || {
  echo "Unexpected rollback order:" >&2
  printf '%s\n' "${actual}" >&2
  exit 1
}

echo "PASS backend-first service rollout and rollback"
