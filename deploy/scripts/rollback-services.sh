#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${FRONTEND_SERVICE:?FRONTEND_SERVICE is required}"
: "${API_SERVICE:?API_SERVICE is required}"
: "${WORKER_SERVICE:?WORKER_SERVICE is required}"

if [[ $# -gt 0 ]]; then
  previous_definitions_file="${1}"
  FRONTEND_TASK_DEFINITION="$(jq -er --arg service "${FRONTEND_SERVICE}" '.[] | select(.service == $service) | .taskDefinition' "${previous_definitions_file}")"
  API_TASK_DEFINITION="$(jq -er --arg service "${API_SERVICE}" '.[] | select(.service == $service) | .taskDefinition' "${previous_definitions_file}")"
  WORKER_TASK_DEFINITION="$(jq -er --arg service "${WORKER_SERVICE}" '.[] | select(.service == $service) | .taskDefinition' "${previous_definitions_file}")"
fi

: "${FRONTEND_TASK_DEFINITION:?FRONTEND_TASK_DEFINITION is required}"
: "${API_TASK_DEFINITION:?API_TASK_DEFINITION is required}"
: "${WORKER_TASK_DEFINITION:?WORKER_TASK_DEFINITION is required}"

rollback_service() {
  local service="$1"
  local task_definition="$2"

  aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
    --service "${service}" --task-definition "${task_definition}" \
    --output json > /dev/null
  aws ecs wait services-stable --region "${AWS_REGION}" \
    --cluster "${ECS_CLUSTER}" --services "${service}"
}

rollback_service "${API_SERVICE}" "${API_TASK_DEFINITION}"
rollback_service "${WORKER_SERVICE}" "${WORKER_TASK_DEFINITION}"
rollback_service "${FRONTEND_SERVICE}" "${FRONTEND_TASK_DEFINITION}"
