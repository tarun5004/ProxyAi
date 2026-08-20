#!/usr/bin/env bash
set -Eeuo pipefail

root="/opt/proxiai"
current_file="${root}/current-release"
previous_file="${root}/previous-release"

test -f "${current_file}"
test -f "${previous_file}"
current_release="$(cat "${current_file}")"
target_release="$(cat "${previous_file}")"
target_dir="${root}/releases/${target_release}"
test -f "${target_dir}/compose.yml"
test -f "${target_dir}/release.env"

cd "${target_dir}"
docker compose --env-file release.env config --quiet
docker compose --env-file release.env up --detach --remove-orphans

for _attempt in {1..60}; do
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' proxiai-live-frontend-1 2>/dev/null || true)"
  api_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' proxiai-live-api-1 2>/dev/null || true)"
  worker_state="$(docker inspect --format '{{.State.Status}}' proxiai-live-worker-1 2>/dev/null || true)"
  if [[ "${frontend_health}" == "healthy" \
    && "${api_health}" == "healthy" \
    && "${worker_state}" == "running" ]]; then
    printf '%s\n' "${target_release}" > "${current_file}"
    printf '%s\n' "${current_release}" > "${previous_file}"
    echo "PASS rollback containers healthy"
    exit 0
  fi
  sleep 5
done

echo "Rollback target did not become healthy." >&2
exit 1
