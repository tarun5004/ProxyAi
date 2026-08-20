#!/usr/bin/env bash
set -Eeuo pipefail

release_sha="${1:?release SHA is required}"
frontend_image="${2:?frontend image digest is required}"
backend_image="${3:?backend image digest is required}"
app_origin="${4:?application origin is required}"
primary_domain="${5:?primary domain is required}"
canary_domain="${6:?canary domain is required}"

[[ "${release_sha}" =~ ^[0-9a-f]{40}$ ]]
[[ "${frontend_image}" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]]
[[ "${backend_image}" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]]
[[ "${app_origin}" == "https://${primary_domain}" || "${app_origin}" == "https://${canary_domain}" ]]

root="/opt/proxiai"
release_dir="${root}/releases/${release_sha}"
runtime_env="${root}/shared/runtime.env"
current_file="${root}/current-release"
previous_file="${root}/previous-release"

test -f "${runtime_env}"
test "$(stat -c '%a' "${runtime_env}")" = "600"
install -d -m 0755 "${release_dir}"

cat > "${release_dir}/release.env" <<EOF
APP_ORIGIN=${app_origin}
BACKEND_IMAGE=${backend_image}
CANARY_DOMAIN=${canary_domain}
COMMIT_SHA=${release_sha}
FRONTEND_IMAGE=${frontend_image}
PRIMARY_DOMAIN=${primary_domain}
EOF
chmod 0644 "${release_dir}/release.env"

cd "${release_dir}"
docker compose --env-file release.env config --quiet
docker compose --env-file release.env pull --quiet
docker compose --env-file release.env run --rm --no-deps api \
  /usr/local/bin/node dist/scripts/deploy-indexes.js

if [[ -f "${current_file}" ]]; then
  current_release="$(cat "${current_file}")"
  if [[ "${current_release}" != "${release_sha}" ]]; then
    printf '%s\n' "${current_release}" > "${previous_file}"
  fi
fi

docker compose --env-file release.env up --detach --remove-orphans

for _attempt in {1..60}; do
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' proxiai-live-frontend-1 2>/dev/null || true)"
  api_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' proxiai-live-api-1 2>/dev/null || true)"
  worker_state="$(docker inspect --format '{{.State.Status}}' proxiai-live-worker-1 2>/dev/null || true)"
  caddy_state="$(docker inspect --format '{{.State.Status}}' proxiai-live-caddy-1 2>/dev/null || true)"
  if [[ "${frontend_health}" == "healthy" \
    && "${api_health}" == "healthy" \
    && "${worker_state}" == "running" \
    && "${caddy_state}" == "running" ]]; then
    printf '%s\n' "${release_sha}" > "${current_file}"
    echo "PASS Lightsail containers healthy"
    exit 0
  fi
  sleep 5
done

docker compose --env-file release.env ps
echo "Lightsail containers did not become healthy." >&2
exit 1
