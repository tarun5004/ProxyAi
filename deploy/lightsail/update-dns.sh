#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:?action apply or restore is required}"
hosted_zone_id="${2:?hosted zone ID is required}"
record_name="${3:?record name is required}"
backup_file="${4:?backup file is required}"
static_ip="${5:-}"

record_name="${record_name%.}."

case "${action}" in
  apply)
    [[ "${static_ip}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
    aws route53 list-resource-record-sets \
      --hosted-zone-id "${hosted_zone_id}" \
      --query "ResourceRecordSets[?Name=='${record_name}' && Type=='A'] | [0]" \
      --output json > "${backup_file}"

    change_file="$(mktemp)"
    trap 'rm -f "${change_file}"' EXIT
    jq -n --arg name "${record_name}" --arg ip "${static_ip}" '{
      Comment: "ProxiAI Lightsail cutover",
      Changes: [{
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $name,
          Type: "A",
          TTL: 60,
          ResourceRecords: [{Value: $ip}]
        }
      }]
    }' > "${change_file}"
    aws route53 change-resource-record-sets \
      --hosted-zone-id "${hosted_zone_id}" \
      --change-batch "file://${change_file}" >/dev/null
    ;;
  restore)
    test -f "${backup_file}"
    current_file="$(mktemp)"
    change_file="$(mktemp)"
    trap 'rm -f "${current_file}" "${change_file}"' EXIT
    aws route53 list-resource-record-sets \
      --hosted-zone-id "${hosted_zone_id}" \
      --query "ResourceRecordSets[?Name=='${record_name}' && Type=='A'] | [0]" \
      --output json > "${current_file}"

    if jq -e 'type == "object" and length > 0' "${backup_file}" >/dev/null; then
      jq -n --slurpfile previous "${backup_file}" '{
        Comment: "Restore ProxiAI pre-cutover DNS",
        Changes: [{Action: "UPSERT", ResourceRecordSet: $previous[0]}]
      }' > "${change_file}"
    elif jq -e 'type == "object" and length > 0' "${current_file}" >/dev/null; then
      jq -n --slurpfile current "${current_file}" '{
        Comment: "Remove failed ProxiAI canary DNS",
        Changes: [{Action: "DELETE", ResourceRecordSet: $current[0]}]
      }' > "${change_file}"
    else
      echo "No DNS record requires restoration."
      exit 0
    fi

    aws route53 change-resource-record-sets \
      --hosted-zone-id "${hosted_zone_id}" \
      --change-batch "file://${change_file}" >/dev/null
    ;;
  *)
    echo "Action must be apply or restore." >&2
    exit 2
    ;;
esac
