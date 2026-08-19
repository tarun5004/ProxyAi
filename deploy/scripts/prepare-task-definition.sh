#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"

family="${1:?task family is required}"
container="${2:?container name is required}"
image="${3:?image URI is required}"
output="${4:?output path is required}"
temporary="${output}.raw"

aws ecs describe-task-definition \
  --region "${AWS_REGION}" \
  --task-definition "${family}" \
  --query taskDefinition \
  --output json > "${temporary}"

jq --arg container "${container}" --arg image "${image}" '
  (.containerDefinitions[] | select(.name == $container) | .image) = $image
  | del(
      .compatibilities,
      .registeredAt,
      .registeredBy,
      .requiresAttributes,
      .revision,
      .status,
      .taskDefinitionArn
    )
' "${temporary}" > "${output}"

rm -f "${temporary}"
