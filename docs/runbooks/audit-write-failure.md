# Audit Write Failure Incident Runbook

## Symptom

`proxiai_audit_writes_total{outcome="failure"}` increases, safe logs report
`AUDIT_UNAVAILABLE`, or audited admin/policy operations return `503`. Sensitive
mutations correctly fail closed and provider execution must not proceed when the
required policy audit cannot be appended.

## Trigger

- Any durable audit write failure is an actionable **SEV-3** alert.
- Escalate immediately when failures affect many audited operations or suggest
  append-only/tenant-isolation integrity loss.

## Severity

- **SEV-3:** isolated or bounded audit-write failures with fail-closed behavior.
- **SEV-1:** audit records can be modified/deleted, written across tenants, or a
  security-relevant mutation succeeds without its audit record.

## Likely Causes

- MongoDB unavailable, transaction/session failure, or write permission issue.
- Audit schema/index validation failure.
- Incompatible application release.
- Database capacity or storage incident.

## Immediate Checks

1. Confirm this is not intentional demo `soft-stop` or `deep-stop`. During
   either planned state the API is unavailable by design; this is not a
   production audit incident and no audited mutation should be attempted.
2. Check MongoDB readiness and the audit success/failure counter.
3. Confirm affected clients receive the safe standard `AUDIT_UNAVAILABLE` error
   without stack traces or sensitive metadata.
4. Do not retry the admin mutation manually until transaction outcome is known.

## Investigation Sequence

1. Record deployment SHA, safe `requestId`, action category, and failure time
   from redacted logs. Do not copy mutation bodies or exported audit content.
2. Check MongoDB readiness, transaction support, connection errors, and storage
   capacity.
3. Verify the AuditLog collection/indexes exist and application credentials have
   append/read permissions required by the approved service.
4. Confirm the audited transaction rolled back the paired admin mutation. Query
   the tenant-scoped resource and audit history through approved admin APIs or
   repository tooling; never issue an unscoped MongoDB query.
5. For policy/chat audit failure, verify provider request metrics did not
   increment after the failed audit boundary.
6. Compare the deployed audit schema and migration/index revision with the
   previous immutable release.
7. Check for any evidence of update/delete paths against AuditLog; treat that as
   a security incident, not a normal write outage.

## Safe Recovery

- Restore MongoDB or correct the validated schema/index/permission issue.
- Roll back an incompatible application release if necessary.
- Re-attempt the user/admin operation only after proving the original
  transaction did not commit. Do not synthesize or backdate an audit event to
  hide uncertainty.
- Verify one controlled audited mutation, its tenant-scoped append-only record,
  and audit export after recovery.

## Rollback Guidance

Rollback application code and indexes only through the reviewed deployment
process. Never delete, edit, or rewrite existing AuditLog entries. If mutation
commit state is ambiguous, preserve evidence and escalate instead of retrying.

## Escalation

Escalate immediately for mutation-without-audit, cross-tenant audit access,
AuditLog update/delete, or missing append-only evidence. Escalate sustained
MongoDB transaction failures to the database provider.

## False Positives

- Expected `503` while the demo environment is intentionally stopped.
- A client validation or authorization failure before an audit write is
  attempted; it must not increment the audit failure counter.
- An audit export request rejected before the export audit transaction begins.
