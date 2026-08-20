# Redis Unavailable Incident Runbook

## Symptom

`GET /health/ready` reports Redis down,
`proxiai_dependency_ready{dependency="redis"}` is `0`, or safe logs report
`REDIS_CONNECTION_ERROR`, `REDIS_CONNECTION_FAILED`, or BullMQ connection
failures. Chat idempotency and rate limiting fail closed; workers and provider
health coordination may stop.

## Trigger

- Redis readiness remains unavailable across the configured alert duration.
- Repeated `IDEMPOTENCY_UNAVAILABLE`, dependency-unavailable, or BullMQ
  connection failures affect requests or workers.

## Severity

**SEV-2** when idempotency-protected chat or queues are blocked. Raise to
**SEV-1** if the outage contributes to a wider authentication or complete
service outage.

## Likely Causes

- Managed Redis outage, exhausted connection quota, or provider maintenance.
- TLS/authentication/DNS configuration failure.
- Invalid `REDIS_URL` secret version.
- Network egress failure or intentionally removed NAT in demo deep-stop mode.

## Immediate Checks

1. Confirm this is not an intentional demo `soft-stop`/`deep-stop`. Deep stop
   intentionally removes the ECS NAT path; do not alert as production failure
   until deep start should have restored it.
2. Check API readiness and the Redis dependency gauge.
3. Check API and worker redacted logs for Redis/BullMQ error categories.
4. Check worker running/healthy gauges and queue depth.

## Investigation Sequence

1. Record deployment SHA, first failure time, and whether API, worker, or both
   are affected.
2. Confirm the runtime secret contains `REDIS_URL` in `AWSCURRENT` without
   printing its value.
3. From the deployed runtime, execute the existing connection/health path; do
   not paste credentials into shell history or incident notes.
4. Verify the provider endpoint status, TLS/auth requirements, connection
   limits, and approved eviction-policy capability.
5. Check `proxiai_idempotency_operations_total` for `unavailable` outcomes and
   queue metrics for failed/retried jobs.
6. Verify the worker reconnect behavior and that no second ad-hoc Redis client
   or alternate fail-open store has been introduced.
7. If ECS deep start was expected, validate the restored NAT route against the
   saved recovery snapshot before changing networking.

## Safe Recovery

- Restore the approved Redis endpoint, secret, or network path.
- Allow the managed clients to reconnect; restart API/worker containers only if
  reconnection does not recover after Redis is confirmed healthy.
- Verify readiness, one idempotent chat request, queue processing, provider
  health state, and worker heartbeat.
- Keep idempotency fail closed. Do not substitute in-memory coordination or
  delete unknown `PROCESSING`/`COMPLETED` records to force retries.

## Rollback Guidance

Rollback the application only when the release changed Redis configuration or
client behavior. Do not restore Redis from an unrelated snapshot, flush keys,
or replay queue jobs manually. Existing BullMQ ledgers and durable enqueue
recovery own safe duplicate prevention.

## Escalation

Escalate to the Redis provider after TLS/auth/network configuration and runtime
reachability are verified. Escalate internally if there is evidence of
duplicate paid provider execution or lost billing/analytics coordination.

## False Positives

- Planned demo deep stop or service scale-to-zero.
- Brief reconnects within the configured retry window with readiness restored.
- Prompt-cache expectations: executable prompt caching is deferred and is not
  a Redis incident signal.
