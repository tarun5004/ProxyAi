# Demo Access Operations

This runbook covers the shared public employee demo and the private interview-only admin identity for the existing `novastack` organisation.

## Safety boundary

- The public identity remains `demo@novastack.demo`, `EMPLOYEE`, `ACTIVE`, with exactly `chat:send` and `chat:view_own`.
- The public organisation must already be `ACTIVE` and use `METADATA_ONLY`; the reset refuses any other retention mode.
- The private identity is exactly `admin-demo@novastack.demo`, `ORG_ADMIN`, `ACTIVE`, with the canonical `ORG_ADMIN` permission mapping.
- Both operations resolve the organisation by the fixed trusted slug and then scope every user/session write by the resolved `orgId`.
- Passwords come only from protected process environment input. Passwords and hashes are never command arguments or output.
- Both commands default to dry-run. Apply requires a second explicit environment switch.
- There is no registration endpoint and no cross-user conversation access.

## Cleanup decision

The approved operation re-provisions only the intended identity and revokes its active refresh sessions. It does **not** delete any data.

Deletion remains deferred because a safe disposable-data boundary is not yet proven across conversation metadata, encrypted messages, RequestLog, BillingRollup, analytics, alerts, and append-only AuditLog. In particular:

- RequestLog and AuditLog must remain append-only.
- Accounting and analytics truth must not be erased or rewritten.
- Conversation/message deletion needs an explicit retention, ownership, and audit contract.
- No foreign organisation or other `novastack` user may be affected.

## Public employee reset

Required protected environment names:

- `MONGO_URI`
- `DEMO_PUBLIC_PASSWORD`
- `ALLOW_PUBLIC_DEMO_RESET=true`
- `PUBLIC_DEMO_RESET_APPLY=false` for review, then `true` for the approved apply

Run from `backend/`:

```powershell
npm run demo:reset-public
```

Review the dry-run safe fields, then apply in a separately authorised process. Apply restores exact employee role/permissions, clears lock counters, resets the password only when needed, and revokes all active refresh sessions. Repeating apply is state-idempotent; already-revoked sessions remain revoked.

Existing FREE-plan user/organisation request limits and monthly token budget remain authoritative. No new session count, conversation count, provider-spend, or deletion threshold is invented by this operation.

Operators should use existing safe auth/rate-limit, provider usage, unknown-usage, queue recovery, and session-count evidence to monitor the shared identity. No prompt, email, user ID, or other high-cardinality tenant identifier should be added to metrics or logs for demo monitoring.

## Private admin provisioning

Required protected environment names:

- `MONGO_URI`
- `PROXIAI_DEMO_ADMIN_PASSWORD`
- `ALLOW_DEMO_ADMIN_PROVISIONING=true`
- `DEMO_ADMIN_PROVISION_APPLY=false` for review, then `true` only after Integration Lead approval

Run from `backend/`:

```powershell
npm run demo:provision-admin
```

The dry run prints only the logical database name, fixed slug/email/role, mode, planned action, and safe reset status. Apply creates or corrects only the fixed private identity. A credential or security-state correction revokes that user's prior refresh sessions in the same MongoDB transaction.

## Verification after an authorised apply

1. Confirm exactly one scoped user exists for the fixed email.
2. Confirm `ACTIVE`, expected role, exact canonical permissions, and no team assignment.
3. Verify the protected password using the existing password verifier without printing either value.
4. Verify prior refresh sessions are revoked.
5. Verify private admin login, `/auth/me`, approved admin routes, logout, and refresh revocation.
6. Verify the public employee remains denied from admin routes.
7. Verify each identity can read only its own conversations; never inspect public-user chat as the admin.

No live Atlas mutation is part of normal repository verification. Live apply requires explicit Integration Lead authorisation and protected runtime inputs.
