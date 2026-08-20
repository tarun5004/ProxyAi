# API Error Rate Incident Runbook

## Symptom

`proxiai_http_requests_total` shows a sustained increase in `5xx` responses, or
clients receive repeated standard error envelopes from multiple API routes.

## Trigger

- Alert when the five-minute `5xx` ratio exceeds the configured Phase 10
  threshold (the approved baseline is 5%).
- Treat a single isolated `5xx` as investigation data, not an incident.

## Severity

- **SEV-2:** sustained elevated `5xx` rate affecting multiple users or routes.
- **SEV-1:** authentication is unavailable for most users, all API instances
  are unavailable, or a security boundary is failing.

## Likely Causes

- A recent API image or configuration deployment.
- MongoDB or Redis unavailability.
- Provider unavailability on chat routes.
- Audit or encryption failures correctly causing sensitive operations to fail
  closed.
- Exhausted process resources or repeated container restarts.

## Immediate Checks

1. Confirm whether this is an intentional demo power state. `soft-stop` scales
   ECS services to zero; `deep-stop` additionally removes the ALB and NAT
   Gateway. Those states are expected unavailability, not production incidents.
2. Check `GET /health/live` and `GET /health/ready` without sending credentials.
3. Identify affected normalized route templates and status classes in metrics.
4. Correlate the first increase with deployment SHA and safe structured logs.

## Investigation Sequence

1. Run the repository smoke suite from an approved deployment environment:
   `APP_ORIGIN=https://proxiai.me deploy/scripts/smoke.sh`. Supply smoke
   credentials only through protected environment variables.
2. Query `proxiai_http_requests_total` and
   `proxiai_http_request_duration_seconds` by normalized `route`, `method`, and
   `status_class`; never query or create labels from raw URLs or identifiers.
3. Use the response `requestId` to inspect redacted application logs. Record the
   stable `errorCode`, service, route, deployment SHA, and first failure time.
4. Check `proxiai_dependency_ready{dependency="mongodb"}` and
   `proxiai_dependency_ready{dependency="redis"}`.
5. For chat-only failures, check provider request/error, health, and circuit
   metrics before assuming an API regression.
6. For admin or policy-write failures, check
   `proxiai_audit_writes_total{outcome="failure"}` and MongoDB readiness.
7. Compare the failure start with the current task definition or Lightsail
   release SHA. Confirm the previous immutable revision remains available.

## Safe Recovery

- Restore the failed dependency or correct the validated runtime configuration.
- If the active release caused the spike, roll back to the last verified image
  digest using `deploy/scripts/rollback-services.sh` for ECS or
  `/opt/proxiai/releases/$(cat /opt/proxiai/current-release)/rollback.sh` on
  Lightsail.
- After recovery, rerun liveness, readiness, authentication, conversation, and
  chat smoke checks. Confirm the `5xx` ratio returns to baseline.
- Do not convert dependency, audit, encryption, or policy failures into success.

## Rollback Guidance

Rollback changes application image revisions only. Do not roll back MongoDB
documents, Redis data, secrets, or DNS as part of this runbook. If the incident
is unrelated to the current release, preserve the active release and recover
the dependency instead.

## Escalation

Escalate to SEV-1 immediately for tenant-isolation, authentication-wide,
plaintext-persistence, or complete API outage evidence. Escalate managed
MongoDB, Redis, or provider incidents to the relevant vendor with timestamps
and safe error categories only.

## False Positives

- Intentional ECS `soft-stop` or validated `deep-stop` maintenance.
- A single failed health probe during deployment convergence.
- A low-traffic denominator where one `5xx` temporarily exceeds the percentage
  threshold; confirm sustained absolute failures and user impact.
