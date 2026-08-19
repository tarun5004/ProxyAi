#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${PRIVATE_SUBNET_IDS:?PRIVATE_SUBNET_IDS is required}"
: "${TASK_SECURITY_GROUP_ID:?TASK_SECURITY_GROUP_ID is required}"

task_definition="${1:?task definition ARN is required}"
network="awsvpcConfiguration={subnets=[${PRIVATE_SUBNET_IDS}],securityGroups=[${TASK_SECURITY_GROUP_ID}],assignPublicIp=DISABLED}"
overrides='{"containerOverrides":[{"name":"api","command":["node","dist/scripts/deploy-indexes.js"]}]}'

task_arn="$(aws ecs run-task \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --task-definition "${task_definition}" \
  --launch-type FARGATE \
  --network-configuration "${network}" \
  --overrides "${overrides}" \
  --query 'tasks[0].taskArn' \
  --output text)"

if [[ -z "${task_arn}" || "${task_arn}" == "None" ]]; then
  echo "Index task could not be started." >&2
  exit 1
fi

aws ecs wait tasks-stopped \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --tasks "${task_arn}"

# The JMESPath backticks are literals, not shell command substitution.
# shellcheck disable=SC2016
exit_code="$(aws ecs describe-tasks \
  --region "${AWS_REGION}" \
  --cluster "${ECS_CLUSTER}" \
  --tasks "${task_arn}" \
  --query 'tasks[0].containers[?name==`api`].exitCode | [0]' \
  --output text)"

if [[ "${exit_code}" != "0" ]]; then
  echo "Index task failed with exit code ${exit_code}." >&2
  exit 1
fi

echo "Index task completed: ${task_arn}"
