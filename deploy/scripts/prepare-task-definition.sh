#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"

family="${1:?task family is required}"
container="${2:?container name is required}"
image="${3:?image URI is required}"
output="${4:?output path is required}"
temporary="${output}.raw"
trap 'rm -f "${temporary}"' EXIT

aws ecs describe-task-definition \
  --region "${AWS_REGION}" \
  --task-definition "${family}" \
  --query taskDefinition \
  --output json > "${temporary}"

match_count="$(jq --arg container "${container}" '
  [.containerDefinitions[] | select(.name == $container)] | length
' "${temporary}")"
if [[ "${match_count}" != "1" ]]; then
  echo "Expected exactly one container named '${container}', found ${match_count}." >&2
  exit 1
fi

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

prepared_image="$(jq -er --arg container "${container}" '
  .containerDefinitions[] | select(.name == $container) | .image
' "${output}")"
if [[ "${prepared_image}" != "${image}" ]]; then
  echo "Prepared task definition did not contain the requested immutable image." >&2
  exit 1
fi
