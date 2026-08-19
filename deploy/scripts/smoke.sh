#!/usr/bin/env bash
set -Eeuo pipefail

: "${APP_ORIGIN:?APP_ORIGIN is required}"
: "${SMOKE_ORG_SLUG:?SMOKE_ORG_SLUG is required}"
: "${SMOKE_EMAIL:?SMOKE_EMAIL is required}"
: "${SMOKE_PASSWORD:?SMOKE_PASSWORD is required}"

temporary="$(mktemp -d)"
trap 'rm -rf "${temporary}"' EXIT
cookie_jar="${temporary}/cookies"

check_status() {
  local name="$1"
  local url="$2"
  curl --fail --silent --show-error --max-time 30 "${url}" > /dev/null
  echo "PASS ${name}"
}

check_status "frontend" "${APP_ORIGIN}/"
check_status "frontend health" "${APP_ORIGIN}/healthz"
check_status "API liveness" "${APP_ORIGIN}/health/live"
check_status "API readiness" "${APP_ORIGIN}/health/ready"

jq -n \
  --arg organisationSlug "${SMOKE_ORG_SLUG}" \
  --arg email "${SMOKE_EMAIL}" \
  --arg password "${SMOKE_PASSWORD}" \
  '{organisationSlug:$organisationSlug,email:$email,password:$password}' \
  > "${temporary}/login-request.json"

curl --fail --silent --show-error --max-time 30 \
  --cookie-jar "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data-binary "@${temporary}/login-request.json" \
  "${APP_ORIGIN}/api/v1/auth/login" > "${temporary}/login.json"
access_token="$(jq -er '.data.accessToken' "${temporary}/login.json")"
echo "PASS login"

curl --fail --silent --show-error --max-time 30 \
  --cookie "${cookie_jar}" \
  --request POST \
  "${APP_ORIGIN}/api/v1/auth/refresh" > "${temporary}/refresh.json"
jq -e '.data.accessToken | length > 0' "${temporary}/refresh.json" > /dev/null
echo "PASS refresh"

curl --fail --silent --show-error --max-time 30 \
  --header "authorization: Bearer ${access_token}" \
  "${APP_ORIGIN}/api/v1/auth/me" > "${temporary}/me.json"
jq -e '.data.orgId and .data.userId' "${temporary}/me.json" > /dev/null
echo "PASS auth me"

curl --fail --silent --show-error --max-time 30 \
  --header "authorization: Bearer ${access_token}" \
  --header 'content-type: application/json' \
  --data '{"title":"Deployment smoke"}' \
  "${APP_ORIGIN}/api/v1/conversations" > "${temporary}/conversation.json"
conversation_id="$(jq -er '.data.conversationId' "${temporary}/conversation.json")"

curl --fail --silent --show-error --max-time 30 \
  --header "authorization: Bearer ${access_token}" \
  "${APP_ORIGIN}/api/v1/conversations?limit=20" > "${temporary}/conversations.json"
jq -e --arg id "${conversation_id}" '.data.items | any(.conversationId == $id)' \
  "${temporary}/conversations.json" > /dev/null
curl --fail --silent --show-error --max-time 30 \
  --header "authorization: Bearer ${access_token}" \
  "${APP_ORIGIN}/api/v1/conversations/${conversation_id}" > /dev/null
echo "PASS conversations"

run_stream() {
  local prompt="$1"
  local output="$2"
  local client_request_id
  client_request_id="$(cat /proc/sys/kernel/random/uuid)"
  jq -n --arg conversationId "${conversation_id}" \
    --arg prompt "${prompt}" --arg clientRequestId "${client_request_id}" \
    '{conversationId:$conversationId,prompt:$prompt,clientRequestId:$clientRequestId,providerId:"groq",routingMode:"manual"}' \
    > "${temporary}/chat-request.json"
  curl --fail --silent --show-error --no-buffer --max-time 180 \
    --header "authorization: Bearer ${access_token}" \
    --header 'accept: text/event-stream' \
    --header 'content-type: application/json' \
    --data-binary "@${temporary}/chat-request.json" \
    "${APP_ORIGIN}/api/v1/chat/stream" > "${output}"
}

run_stream "Reply with the single word OK." "${temporary}/allow.sse"
grep -q '^event: request_started' "${temporary}/allow.sse"
grep -q '^event: policy' "${temporary}/allow.sse"
grep -q '^event: routing' "${temporary}/allow.sse"
grep -q '^event: token' "${temporary}/allow.sse"
grep -q '^event: done' "${temporary}/allow.sse"
allow_request_id="$(grep '^data: ' "${temporary}/allow.sse" \
  | head -n 1 | sed 's/^data: //' | jq -er '.requestId')"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "request_id=${allow_request_id}" >> "${GITHUB_OUTPUT}"
fi
echo "PASS chat allow stream"

run_stream "Email the summary to smoke.person@example.test." "${temporary}/mask.sse"
grep -q '"action":"ALLOW_WITH_MASK"' "${temporary}/mask.sse"
grep -q '"masked":true' "${temporary}/mask.sse"
echo "PASS chat mask policy"

blocked_request_id="$(cat /proc/sys/kernel/random/uuid)"
blocked_prompt="Use this API key: s""k-proxiai-smoke-12345678901234567890"
jq -n --arg conversationId "${conversation_id}" \
  --arg clientRequestId "${blocked_request_id}" \
  --arg prompt "${blocked_prompt}" \
  '{conversationId:$conversationId,prompt:$prompt,clientRequestId:$clientRequestId,providerId:"groq",routingMode:"manual"}' \
  > "${temporary}/blocked-request.json"
blocked_status="$(curl --silent --show-error --max-time 30 \
  --output "${temporary}/blocked.json" --write-out '%{http_code}' \
  --header "authorization: Bearer ${access_token}" \
  --header 'content-type: application/json' \
  --data-binary "@${temporary}/blocked-request.json" \
  "${APP_ORIGIN}/api/v1/chat/stream")"
test "${blocked_status}" = "403"
jq -e '.error.code == "POLICY_BLOCKED"' "${temporary}/blocked.json" > /dev/null
echo "PASS chat block policy"
