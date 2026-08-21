# MongoDB Unavailable Incident Runbook

## Symptom

`GET /health/ready` returns `503` with MongoDB down, or
`proxiai_dependency_ready{dependency="mongodb"}` is `0`. Authentication,
tenant reads, accounting, encrypted persistence, and audited mutations may fail
closed.

## Trigger

- MongoDB readiness remains unavailable across the alert duration.
- Safe logs repeatedly report `MONGODB_CONNECTION_FAILED` or an approved
  MongoDB operation error category.

## Severity

**SEV-2** because critical tenant reads and durable writes cannot be guaranteed.
Raise to **SEV-1** if a security boundary, tenant isolation, or data integrity is
affected.

## Likely Causes

- Atlas service degradation or exhausted connection capacity.
- Network, DNS, TLS, authentication, or Atlas allowlist failure.
- NAT/ECS egress unavailable in the fallback architecture.
- Invalid secret version or an application rollout using incompatible config.

## Immediate Checks

1. Confirm the environment is not intentionally in demo `soft-stop` or
   `deep-stop`. During deep stop the preserved ECS private path has no NAT, so
   MongoDB failure is expected until `deep-start -Apply` completes.
2. Check `GET /health/live`; liveness may remain `200` while readiness is `503`.
3. Check the MongoDB dependency gauge and redacted startup/connection logs.
4. Check Atlas service health and network-access configuration without printing
   `MONGO_URI`.

## Investigation Sequence

1. Record deployment SHA, first failure time, and affected service (`api` or
   `worker`).
2. Confirm the `proxiai/production` secret has an `AWSCURRENT` version and the
   `MONGO_URI` key exists; do not retrieve or print its value in incident notes.
3. From the actual runtime network, run the existing readiness check rather than
   a workstation-only connectivity test.
4. For ECS fallback, verify private route/NAT state against
   `deploy/aws/.runtime/demo-power-state.json`. Do not recreate networking from
   memory or release the preserved NAT EIP.
5. Check Atlas cluster availability, connection limits, TLS, and the approved
   source-IP allowlist.
6. If only one release fails, compare its validated environment contract with
   the previous immutable release.

## Safe Recovery

- Restore the approved network path, Atlas availability, or validated secret.
- Restart the affected API/worker process only after the dependency is reachable
  and configuration is valid.
- Verify readiness, login, tenant-scoped conversation reads, one audited admin
  operation in a controlled account, and worker processing.
- Do not write plaintext when encryption or MongoDB persistence fails.

## Rollback Guidance

Use the existing immutable application rollback only when the current release
introduced the failure. Database rollback or destructive document repair is not
part of this runbook. Preserve append-only `RequestLog` and `AuditLog` records.

## Escalation

Escalate to Atlas support for sustained platform/TLS/auth failures after the
runtime network and secret contract are verified. Escalate internally to SEV-1
for suspected cross-tenant access, missing audited mutations, or persistence
integrity loss.

## False Positives

- Planned demo deep stop before NAT restoration.
- Short readiness transitions during a controlled restart.
- A workstation connection failure while the runtime network remains healthy.
