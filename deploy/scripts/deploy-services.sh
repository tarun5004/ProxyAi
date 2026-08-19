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

aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${FRONTEND_SERVICE}" --task-definition "${frontend_task}" \
  --force-new-deployment --output json > /dev/null
aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${API_SERVICE}" --task-definition "${api_task}" \
  --force-new-deployment --output json > /dev/null
aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${WORKER_SERVICE}" --task-definition "${worker_task}" \
  --force-new-deployment --output json > /dev/null

aws ecs wait services-stable --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --services "${FRONTEND_SERVICE}" "${API_SERVICE}" "${WORKER_SERVICE}"

printf 'frontend=%s\napi=%s\nworker=%s\n' \
  "${frontend_task}" "${api_task}" "${worker_task}"
