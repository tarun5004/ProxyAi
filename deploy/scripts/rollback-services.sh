#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${FRONTEND_SERVICE:?FRONTEND_SERVICE is required}"
: "${API_SERVICE:?API_SERVICE is required}"
: "${WORKER_SERVICE:?WORKER_SERVICE is required}"
: "${FRONTEND_TASK_DEFINITION:?FRONTEND_TASK_DEFINITION is required}"
: "${API_TASK_DEFINITION:?API_TASK_DEFINITION is required}"
: "${WORKER_TASK_DEFINITION:?WORKER_TASK_DEFINITION is required}"

aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${FRONTEND_SERVICE}" \
  --task-definition "${FRONTEND_TASK_DEFINITION}" --output json > /dev/null
aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${API_SERVICE}" \
  --task-definition "${API_TASK_DEFINITION}" --output json > /dev/null
aws ecs update-service --region "${AWS_REGION}" --cluster "${ECS_CLUSTER}" \
  --service "${WORKER_SERVICE}" \
  --task-definition "${WORKER_TASK_DEFINITION}" --output json > /dev/null

aws ecs wait services-stable --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --services "${FRONTEND_SERVICE}" "${API_SERVICE}" "${WORKER_SERVICE}"
