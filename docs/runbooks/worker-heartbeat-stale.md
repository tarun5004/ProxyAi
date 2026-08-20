# Worker Heartbeat Stale Incident Runbook

## Symptom

`proxiai_worker_healthy{worker}` is `0`,
`proxiai_worker_heartbeat_age_seconds{worker}` exceeds 120 seconds, or safe logs
report `BULLMQ_WORKER_HEARTBEAT_FAILED`. Queue depth may rise and billing,
analytics, anomaly, provider-health, or enqueue-recovery processing may stop.

## Trigger

- A managed worker heartbeat remains stale for more than 120 seconds.
- Worker running state is `0` when its service is expected to be active.

## Severity

**SEV-2** for billing or broadly stalled worker processing. Use **SEV-3** for a
single non-critical worker with no growing backlog or user-facing impact.

## Likely Causes

- Worker container/process stopped, restarting, or out of memory.
- Redis/BullMQ connectivity failure.
- Event-loop starvation or a job that does not return control.
- Intentional demo soft/deep stop or staging scale-to-zero.

## Immediate Checks

1. Confirm the worker is expected to run. A deliberate demo `soft-stop`,
   `deep-stop`, or staging desired count `0` makes stale/absent heartbeat
   expected and must be maintenance-suppressed.
2. Check `proxiai_worker_running`, `proxiai_worker_healthy`, heartbeat age, and
   queue depth for the same allowlisted worker/queue.
3. Check the runtime container/service state and last redacted worker logs.
4. Check Redis readiness before restarting anything.

## Investigation Sequence

1. Identify the exact bounded worker label: `billing`, `analytics`, `anomaly`,
   `provider_health`, or `enqueue_recovery`.
2. Confirm whether all workers or only one lifecycle are unhealthy.
3. Inspect `queue.worker.started`, `queue.worker.heartbeat_failed`,
   `queue.worker.error`, and `queue.worker.stopped` events around the stale time.
4. Compare queue `waiting`, `active`, `delayed`, and `failed` depth with the
   last successful-job age.
5. Check Redis/BullMQ connectivity and container CPU/memory/restart state.
6. Verify the deployed worker command is `npm run start:worker` and matches the
   current immutable backend image.
7. Determine whether an active job is retryable through BullMQ or has already
   reached the failed set. Do not manually replay it.

## Safe Recovery

- Restore Redis first when it is unavailable.
- Restart only the affected managed worker/container after recording its active
  and failed job state.
- Allow BullMQ bounded retries and the existing idempotency ledgers to resolve
  work. Confirm heartbeat freshness, queue drain, and exactly-once billing or
  analytics effects.
- For an intentional stopped demo, use the reviewed `soft-start` or
  `deep-start -Apply` workflow instead of treating it as a crash restart.

## Rollback Guidance

If the current worker image caused the failure, roll back all worker-managed
lifecycles to the previous backend image digest. Do not alter queue payloads,
ledgers, or MongoDB accounting records during rollback.

## Escalation

Escalate when heartbeat remains stale after process and Redis recovery, failed
queue depth grows, or billing/accounting effects cannot be proven idempotent.

## False Positives

- Intentional soft/deep stop or staging scale-to-zero.
- The heartbeat-age series is absent before the first successful heartbeat;
  correlate with `worker_running` and deployment time.
- A worker with no recent jobs may have no last-successful-job age; this alone
  is not a heartbeat incident.
