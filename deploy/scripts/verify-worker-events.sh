#!/usr/bin/env bash
set -Eeuo pipefail

: "${AWS_REGION:?AWS_REGION is required}"
: "${WORKER_LOG_GROUP:?WORKER_LOG_GROUP is required}"

request_id="${1:?request ID is required}"
start_time="$(( ($(date +%s) - 900) * 1000 ))"
temporary="$(mktemp)"
trap 'rm -f "${temporary}"' EXIT

for _attempt in {1..24}; do
  aws logs filter-log-events \
    --region "${AWS_REGION}" \
    --log-group-name "${WORKER_LOG_GROUP}" \
    --start-time "${start_time}" \
    --filter-pattern "${request_id}" \
    --query 'events[].message' \
    --output text > "${temporary}"

  if grep -q '"event":"billing.job.completed"' "${temporary}" \
    && grep -q '"outcome":"APPLIED"' "${temporary}" \
    && grep -q '"event":"analytics.job.completed"' "${temporary}"; then
    echo "PASS worker billing and analytics events"
    exit 0
  fi

  sleep 5
done

echo "Timed out waiting for correlated worker accounting events." >&2
exit 1
