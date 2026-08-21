#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${FRONTEND_SERVICE:?FRONTEND_SERVICE is required}"
: "${API_SERVICE:?API_SERVICE is required}"
: "${WORKER_SERVICE:?WORKER_SERVICE is required}"

frontend_file="${1:?frontend task definition file is required}"
api_file="${2:?api task definition file is required}"
worker_file="${3:?worker task definition file is required}"

aws ecs describe-services \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --services "${FRONTEND_SERVICE}" "${API_SERVICE}" "${WORKER_SERVICE}" \
  --query 'services[].{service:serviceName,taskDefinition:taskDefinition}' \
  --output json > previous-task-definitions.json

for service in "${FRONTEND_SERVICE}" "${API_SERVICE}" "${WORKER_SERVICE}"; do
  match_count="$(jq --arg service "${service}" '[.[] | select(.service == $service)] | length' previous-task-definitions.json)"
  if [[ "${match_count}" != "1" ]]; then
    echo "Expected exactly one existing ECS service named '${service}', found ${match_count}." >&2
    exit 1
  fi
done

frontend_task="$(aws ecs register-task-definition \
  --region "${AWS_REGION}" \
  --cli-input-json "file://${frontend_file}" \
  --query taskDefinition.taskDefinitionArn \
  --output text)"
api_task="$(aws ecs register-task-definition \
  --region "${AWS_REGION}" \
  --cli-input-json "file://${api_file}" \
  --query taskDefinition.taskDefinitionArn \
  --output text)"
worker_task="$(aws ecs register-task-definition \
  --region "${AWS_REGION}" \
  --cli-input-json "file://${worker_file}" \
  --query taskDefinition.taskDefinitionArn \
  --output text)"

"$(dirname "$0")/run-index-task.sh" "${api_task}"

deploy_service() {
  local service="$1"
  local task_definition="$2"

  aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
    --service "${service}" --task-definition "${task_definition}" \
    --force-new-deployment --output json > /dev/null
  aws ecs wait services-stable --region "${AWS_REGION}" \
    --cluster "${ECS_CLUSTER}" --services "${service}"
}

deploy_service "${API_SERVICE}" "${api_task}"
deploy_service "${WORKER_SERVICE}" "${worker_task}"
deploy_service "${FRONTEND_SERVICE}" "${frontend_task}"

printf 'frontend=%s\napi=%s\nworker=%s\n' \
  "${frontend_task}" "${api_task}" "${worker_task}"
