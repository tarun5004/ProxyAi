# Queue Job Failure Incident Runbook

## Symptom

`proxiai_queue_jobs_total{outcome="failed"}` increases, failed queue depth is
non-zero, or safe logs report `queue.job.failed`, `queue.worker.error`, or
`BULLMQ_ENQUEUE_FAILED`. Billing, analytics, anomaly detection, provider health,
or enqueue recovery may be delayed.

## Trigger

- Terminal queue failures occur after the approved three-attempt retry policy.
- Failed depth grows or processing success falls below the approved baseline.

## Severity

- **SEV-2:** billing queue is not processing or multiple queues are stalled.
- **SEV-3:** isolated terminal failures retained in the BullMQ failed set.

## Likely Causes

- Redis/BullMQ unavailability.
- Malformed/unsupported job payload rejected by schema validation.
- MongoDB unavailable during an idempotent worker side effect.
- Worker crash, resource exhaustion, or a terminal domain error.
- Producer enqueue failure pending durable enqueue recovery.

## Immediate Checks

1. Confirm workers were not intentionally stopped by demo `soft-stop` or
   `deep-stop`, or by staging scale-to-zero. Those are planned states, not
   production queue incidents.
2. Check worker heartbeat, Redis readiness, and queue depth by approved queue.
3. Identify whether the outcome is `retried`, `failed`, or `invalid_payload`.
4. Preserve failed jobs in BullMQ; do not remove or replay them manually.

## Investigation Sequence

1. Identify the affected queue: `billing-queue`, `analytics-queue`,
   `anomaly-queue`, `health-check-queue`, or `enqueue-recovery-queue`.
2. Correlate `queue.job.started`, `queue.job.processing_failed`, retried, and
   terminal-failed events using safe `requestId`/job metadata from protected
   logs. Never copy the whole payload into incident notes.
3. Check Redis and MongoDB readiness and the affected worker heartbeat.
4. For `invalid_payload`, compare the deployed producer and worker image SHA;
   do not transform or bypass validation on the failed job.
5. For enqueue failures after a persisted `RequestLog`, inspect the durable
   enqueue-recovery record and scheduler outcome rather than mutating the log.
6. For billing/analytics duplicates, verify the existing tenant-scoped ledger
   state before considering any operator action.
7. Confirm whether bounded retries are exhausted and record the safe error
   category and affected time window.

## Safe Recovery

- Recover Redis/MongoDB or deploy the compatible producer/worker revision.
- Let BullMQ bounded retries and durable enqueue recovery perform approved
  retries.
- If a terminal failed job requires intervention, preserve it and escalate for
  a reviewed idempotent recovery procedure; no public/manual replay contract is
  approved.
- Verify queue depth decreases, worker heartbeat remains fresh, and no duplicate
  billing/analytics effect occurs.

## Rollback Guidance

Rollback producer and worker compatibility together when a release changed the
job schema. Do not mutate append-only `RequestLog`, clear queue storage, or
re-enqueue non-idempotent work by hand.

## Escalation

Escalate immediately when billing is stalled, failed depth grows continuously,
or ledger state cannot prove duplicate safety. Retain the failed set as the MVP
DLQ evidence.

## False Positives

- Intentional worker scale-to-zero during demo maintenance.
- A retryable attempt followed by successful completion; alert on terminal
  failure, not every processing exception.
- Old retained failed jobs with no new increase; separate historical evidence
  from an active incident.
