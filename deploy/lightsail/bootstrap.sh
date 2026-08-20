#!/usr/bin/env bash
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install --yes ca-certificates curl gnupg jq
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes --output /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Ubuntu supplies this file at runtime.
# shellcheck disable=SC1091
. /etc/os-release
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install --yes docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

install -d -m 0755 -o ubuntu -g ubuntu /opt/proxiai
install -d -m 0755 -o ubuntu -g ubuntu /opt/proxiai/releases
install -d -m 0700 -o ubuntu -g ubuntu /opt/proxiai/shared
usermod -aG docker ubuntu

docker version >/dev/null
docker compose version >/dev/null
touch /var/lib/proxiai-bootstrap-complete
