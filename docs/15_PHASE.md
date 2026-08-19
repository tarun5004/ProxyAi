# ProxiAI Development Phases

**Document ID:** PHASE-001  
**Project:** ProxiAI — Enterprise AI Gateway & Audit Platform  
**Version:** 1.0  
**Status:** Active Development Plan  
**Audience:** Solo Developer  
**Last Updated:** July 2026

---

# 1. Purpose

This is the day-to-day execution plan for building the ProxiAI MVP.

Use this file to decide:

- what to build now;
- what not to build now;
- which tasks require higher effort;
- when a phase is complete;
- what must be tested before moving forward;
- how to avoid distraction and rework.

Before starting work:

1. Open this file.
2. Identify the current phase.
3. Select the next unchecked task.
4. Complete only that task.
5. Run its acceptance checks.
6. Commit the work.
7. Update this file.

---

# 2. Effort Levels

| Effort | Meaning | Working Style |
|---|---|---|
| ⭐ **Ultra** | Security-critical, architecture-critical, or expensive to change later | Read related docs first, design carefully, add tests, self-review before commit |
| **High** | Important implementation with multiple dependencies | Break into small tasks and test success and failure paths |
| **Medium** | Normal feature implementation | Implement, test, and document |
| **Low** | Small configuration, UI, or documentation work | Keep simple and avoid over-engineering |

A task can be small but still **Ultra** when one mistake could expose another organisation’s data or leak a secret.

---

# 3. Non-Negotiable Development Rules

## Rule 1 — One Phase at a Time

Do not start a later phase while the current phase exit criteria are incomplete.

## Rule 2 — One Vertical Slice at a Time

Prefer:

```text
route
→ validation
→ service
→ database
→ tests
```

Avoid creating many empty modules without working behavior.

## Rule 3 — No New Features

The MVP excludes:

- BYOK;
- SSO/SAML;
- MFA;
- approval workflow;
- Kafka;
- microservices;
- Kubernetes;
- ML-based PII;
- ML-based routing;
- multi-region deployment;
- full-text search over encrypted prompts;
- seamless mid-stream provider switching.

## Rule 4 — Security Order Must Not Change

For every chat request:

```text
Authentication
→ organisation and permission resolution
→ validation
→ idempotency
→ rate limit
→ PII detection
→ risk scoring
→ policy
→ cache
→ routing
→ provider
→ persistence
→ background jobs
```

## Rule 5 — Stop and Fix Before Continuing

Stop the phase when:

- TypeScript build fails;
- existing tests fail;
- cross-tenant access is possible;
- a blocked prompt reaches a provider;
- plaintext is stored after encryption failure;
- duplicate requests create duplicate provider calls;
- secrets appear in logs.

## Rule 6 — Commit Small Completed Units

Examples:

```text
chore: initialize backend foundation
feat(config): add validated environment configuration
feat(auth): add login and token issuance
test(security): add cross-tenant conversation tests
```

---

# 4. Current Progress

Update this block at the end of every work session.

```text
Current Phase: Phase 12 — Docker, CI/CD, and Deployment (Accelerated)
Current Task: P12-01 — Align AWS ECS and CI/CD release contracts
Current Status: Phase 8 product work explicitly deferred until after first live deployment
Current Blocker: None
Last Completed Task: P7-11 — Durable Enqueue Recovery
Last Completed Commit: feat(async): add durable enqueue recovery
```

---

# 5. Master Phase Overview

| Phase | Focus | Effort | Result |
|---|---|---:|---|
| Phase 0 | Planning and repository baseline | Medium | Documentation and base server |
| Phase 1 | Foundation and dependency readiness | High | Stable API foundation |
| Phase 2 | Authentication and tenant isolation | ⭐ Ultra | Trusted user and organisation context |
| Phase 3 | Provider abstraction and resilience | ⭐ Ultra | Reliable provider calls |
| Phase 4 | PII and policy enforcement | ⭐ Ultra | Safe outbound prompts |
| Phase 5 | Chat, conversations, and streaming | High | Main employee workflow |
| Phase 6 | Redis cache and idempotency | ⭐ Ultra | Bounded tenant-scoped duplicate coordination; cache/replay deferred |
| Phase 7 | Background jobs, billing, and alerts | High | Durable async processing |
| Phase 8 | Admin dashboard and RBAC | High | Organisation management |
| Phase 9 | Retention, encryption, and audit | ⭐ Ultra | Safe storage and audit trail |
| Phase 10 | Observability and operations | High | Diagnosable system |
| Phase 11 | Testing and hardening | ⭐ Ultra | Release confidence |
| Phase 12 | Docker, CI/CD, and deployment | High | Deployed MVP |
| Phase 13 | Final demo and documentation verification | Medium | Portfolio-ready project |

---

# 6. Phase 0 — Planning and Repository Baseline

**Effort:** Medium  
**Status:** Completed

## Completed

- [x] All 14 architecture and project documents created.
- [x] Project folders created.
- [x] Git initialized.
- [x] Basic Express TypeScript server created.
- [x] `/health/live` working.
- [x] Initial project commit completed.

---

# 7. Phase 1 — Foundation and Dependency Readiness

**Effort:** High  
**Status:** Completed  
**Goal:** Build a stable foundation before business features.

## Read First

- `02_SDD.md`
- `03_TDD.md`
- `07_DEPLOYMENT_ARCHITECTURE.md`
- `09_README.md`

## P1-01 — Verify TypeScript Foundation

**Effort:** Medium

- [x] Enable strict mode.
- [x] Set `rootDir` to `src`.
- [x] Set `outDir` to `dist`.
- [x] Add `dev`, `build`, `start`, and `typecheck` scripts.
- [x] Confirm `npm run typecheck` passes.
- [x] Confirm `npm run build` creates `dist`.

## P1-02 — Environment Validation

**Effort:** High

- [x] Create `src/config/env.ts`.
- [x] Validate `NODE_ENV` with Zod.
- [x] Validate `PORT`.
- [x] Validate `MONGO_URI`.
- [x] Validate `REDIS_URL`.
- [x] Fail startup safely when configuration is invalid.
- [x] Keep `.env` excluded from Git.
- [x] Keep `.env.example` updated.

### Acceptance Checks

- [x] Missing `MONGO_URI` stops startup.
- [x] Invalid port stops startup.
- [x] No secret value appears in the startup error.
- [x] Valid environment starts successfully.

## P1-03 — Structured Logger

**Effort:** High
**Status:** Completed

- [x] Create Pino logger.
- [x] Add environment and service fields.
- [x] Redact authorization header.
- [x] Redact cookie.
- [x] Redact passwords and API keys.
- [x] Redact prompts and responses.
- [x] Replace server `console.log` usage.

## P1-04 — MongoDB Connection

**Effort:** High
**Status:** Completed

- [x] Create shared connection module.
- [x] Add connection timeout.
- [x] Add safe connection logs.
- [x] Add graceful disconnect.
- [x] Prevent readiness until MongoDB is connected.

## P1-05 — Redis Connection

**Effort:** High
**Status:** Completed

- [x] Create shared Redis client.
- [x] Add safe connection logs.
- [x] Add reconnect behavior.
- [x] Add graceful disconnect.
- [x] Do not start BullMQ yet.

## P1-06 — Health Endpoints

**Effort:** Medium
**Status:** Completed

- [x] Keep `/health/live` dependency-free.
- [x] Add `/health/ready`.
- [x] Check MongoDB readiness.
- [x] Check Redis readiness.
- [x] Add service version.
- [x] Add commit SHA when available.

## P1-07 — API Foundation

**Effort:** High
**Status:** Completed

- [x] Add request ID middleware.
- [x] Add standard success envelope.
- [x] Add standard error envelope.
- [x] Add typed `AppError`.
- [x] Add global error middleware.
- [x] Add 404 handler.
- [x] Add request-size limit.
- [x] Configure Helmet.
- [x] Configure CORS from environment.

## Phase 1 Exit Criteria

- [x] TypeScript strict build passes.
- [x] Environment validation works.
- [x] Pino redaction works.
- [x] MongoDB connects.
- [x] Redis connects.
- [x] Liveness and readiness work.
- [x] Standard API envelope works.
- [x] Graceful shutdown works.
- [x] Code committed.

---

# 8. Phase 2 — Authentication and Tenant Isolation

**Effort:** ⭐ Ultra
**Status:** Completed
**Goal:** Every request has a trusted user, organisation, role, and permission context.

## P2-01 — Organisation Model

**Status:** Completed

- [x] Unique organisation ID.
- [x] Active state.
- [x] Plan.
- [x] Retention mode.
- [x] Policy thresholds.
- [x] Monthly budget.
- [x] Feature flags.
- [x] Required indexes.

## P2-02 — User and Team Models

**Effort:** ⭐ Ultra
**Status:** Completed

- [x] Mandatory `orgId`.
- [x] Normalized email.
- [x] Password hash.
- [x] Role and permissions.
- [x] Active state.
- [x] Optional team ID.
- [x] Team schema.
- [x] Compound indexes.
- [x] No query by `_id` alone for tenant-owned data.

## P2-03 — Password Security

**Status:** Completed

- [x] Hash before storage.
- [x] Compare safely.
- [x] Never log password.
- [x] Add minimum password validation.

## P2-04 — Login

**Effort:** ⭐ Ultra
**Status:** Completed

- [x] Validate login request.
- [x] Find active user.
- [x] Verify active organisation.
- [x] Compare password.
- [x] Issue access token.
- [x] Create refresh token family.
- [x] Store refresh-token hash.
- [x] Set secure HTTP-only cookie.
- [x] Audit success and failure.

## P2-05 — Refresh Token Rotation

**Effort:** ⭐ Ultra
**Status:** Completed

- [x] Token hash.
- [x] Family ID.
- [x] Expiry.
- [x] Used timestamp.
- [x] Revoked state.
- [x] Rotate on refresh.
- [x] Detect reuse.
- [x] Revoke family on reuse.
- [x] TTL index.

## P2-06 — Authentication Middleware

**Status:** Completed

- [x] Verify bearer token.
- [x] Load active user.
- [x] Load active organisation.
- [x] Attach safe context.
- [x] Never trust request `orgId` as identity source.

## P2-07 — Permission-Based RBAC

**Effort:** ⭐ Ultra
**Status:** Completed

- [x] Define roles.
- [x] Define permissions.
- [x] Map roles to permissions.
- [x] Create `requirePermission`.
- [x] Add team scope.
- [x] Add organisation scope.
- [x] Add negative authorization manual checks.

## P2-08 — Logout

- [x] Revoke session.
- [x] Clear cookie.
- [x] Audit logout.

## Phase 2 Exit Criteria

- [x] Login, refresh, reuse detection, and logout work.
- [x] Auth middleware resolves trusted user and organisation.
- [x] Permission middleware works.
- [x] Cross-tenant Conversation READ gate passes with trusted `orgId`, `userId`, and `conversationId` scope.
- [x] Cross-tenant Conversation UPDATE gate passes through the owner-scoped title PATCH endpoint.
- [ ] Cross-tenant DELETE runtime gate remains deferred until a delete endpoint exists.
- [x] Secrets do not appear in logs.

**Mandatory Gate:** User from Org A cannot read, update, or delete Org B data.

**Runtime Verification:** Cross-tenant and cross-user Conversation reads and title updates return the same generic `404` as missing records. The UPDATE path is verified not to mutate the foreign record. Mandatory DELETE verification must run when the first tenant-owned delete endpoint is implemented.

---

# 9. Phase 3 — Provider Abstraction and Resilience

**Effort:** ⭐ Ultra

## Tasks

- [x] Define provider request, response, stream, capability, health, and error types.
- [x] Create `ProviderAdapter` interface.
- [x] Build fake provider adapter first.
- [x] Simulate success, timeout, 429, 500, and mid-stream failure.
- [x] Add one real provider adapter.
- [x] Keep SDK code inside adapter.
- [x] Add capability registry.
- [x] Add retry with exponential backoff and jitter.
- [x] Retry only approved errors.
- [x] Add CLOSED, OPEN, and HALF_OPEN circuit states.
- [x] Add ordered fallback before first token.
- [x] Return typed all-providers-unavailable error.

## Exit Criteria

- [x] Fake provider supports all tests.
- [x] One real provider works.
- [x] Retry is bounded.
- [x] Circuit-breaker tests pass.
- [x] Fallback works before first token.
- [x] Provider secrets are redacted.

---

# 10. Phase 4 — PII and Policy Enforcement

**Effort:** ⭐ Ultra
**Status:** Completed

## Tasks

- [x] P4-01 — Detect email, phone, card-like numbers, government IDs, API keys, and connection strings.
- [x] P4-02 — Classify contact, financial, government ID, credential, internal secret, and business-confidential data.
- [x] P4-03 — Calculate explainable 0–100 risk score.
- [x] P4-04 — Mask spans safely.
- [x] P4-05 — Never mutate the original prompt object.
- [x] P4-06 — Implement `ALLOW`.
- [x] P4-07 — Implement `ALLOW_WITH_MASK`.
- [x] P4-08 — Implement `BLOCK`.
- [x] P4-09 — Add budget-exhausted block.
- [x] P4-10 — Audit decisions without raw values.

## Mandatory Security Test

```text
API key in prompt
→ credential detected
→ high risk
→ BLOCK
→ provider call count = 0
→ safe audit event
→ raw key absent from logs
```

## Exit Criteria

- [x] Detection, classification, score, mask, and block focused tests pass.
- [x] Integrated `BLOCK` causes zero provider calls.
- [x] Integrated `ALLOW_WITH_MASK` sends only masked `providerPrompt` to the provider.
- [x] Structured policy decision events contain no raw sensitive values.

P5-06 proves both integration gates through the production chat orchestration
boundary. Durable append-only audit persistence remains owned by Phase 9.

---

# 11. Phase 5 — Chat, Conversations, and Streaming

**Effort:** High
**Status:** Completed

## Tasks

- [x] P5-01 — Create Conversation model with `orgId`, user ID, title, message count, and indexes.
- [x] P5-02 — Create Message model with encrypted-content structure.
- [x] P5-03 — Add create-conversation API.
- [x] P5-04 — Add Conversation list/read APIs using tenant scope and cursor pagination.
- [x] P5-05 — Add retained Message-list API using tenant-scoped Conversation ownership.
- [x] P5-06 prerequisite — Add minimal authoritative RequestLog and BillingRollup accounting required for fail-closed policy budget checks.
- [x] P5-06 — Add authenticated `POST /api/v1/chat/stream`.
- [x] Send canonical `request_started`, `policy`, `routing`, `fallback`, `token`, `done`, and `error` events where applicable.
- [x] Handle client disconnect.
- [x] P5-07 — Build login and chat frontend.
- [x] Show mask, block, fallback, and interruption messages.
- [x] P5-07 addendum — Add a public ProxiAI landing page while preserving `/login` and `/chat`.
- [x] P5-07 addendum — Add development-only idempotent organisation-admin provisioning for fresh local databases.
- [x] P5-07 addendum — Re-verify landing reference fidelity and the existing login, Conversation, chat-stream, and policy-panel flow.

## Approved Contract Addendum

- [x] Resolve Phase 5 history as metadata-only: `contentAvailable: false` omits content and `contentEnc` is never exposed.
- [x] Keep AES-256-GCM message persistence/decryption and successful-stream persistence in Phase 9; never persist partial/interrupted assistant output.
- [x] Approve manual owner-scoped `PATCH /api/v1/conversations/:conversationId` with `chat:send`, strict `{ title }`, trim, and 1–120 characters.
- [x] Prohibit prompt-derived and LLM-generated titles.
- [x] Defer attachments: no upload endpoint, multipart contract, or paperclip/upload UI in the current MVP.
- [x] P5-08 — Implement the approved title PATCH and Chat Workspace UX corrections without encrypted history or attachments.

## Exit Criteria

- [x] User can log in, create conversation, and stream a safe response.
- [x] User sees only their conversations.
- [x] Cross-tenant conversation tests pass.
- [x] Mid-stream provider splice is not implemented.
- [x] Manual title updates are owner-scoped, permission-protected, and return generic `404` for foreign scope.
- [x] Existing Conversation routes restore real list/read state and show metadata-only history without inventing content.
- [x] Assistant Markdown/GFM renders without raw HTML injection; user prompts remain escaped plain text.
- [x] Enter sends, Shift+Enter inserts a newline, duplicate streaming sends are blocked, and route changes abort the active stream.

The P5-06 accounting prerequisite was explicitly pulled forward because policy
cannot safely evaluate budget state without persisted usage. It is limited to
append-only provider usage records, an organisation-month rollup derived from
those records, and a fail-closed budget reader. Redis is not a budget source of
truth. Generalised asynchronous billing, replay protection, workers, alerts,
costs, and dashboard rollups remain Phase 7 responsibilities.

---

# 12. Phase 6 — Redis Cache and Idempotency

**Effort:** ⭐ Ultra

## Idempotency

- [x] P6-01 — Generalize tenant-scoped idempotency reservations.
- [x] Key uses an opaque HMAC over trusted `orgId`, `userId`, and client request ID.
- [x] Use `SET NX`.
- [x] Add `PROCESSING` and `COMPLETED` states.
- [x] Use validated 300-second processing and 3600-second completed TTLs.
- [x] Fail closed with `IDEMPOTENCY_UNAVAILABLE` when Redis is unavailable.
- [x] Test 10 duplicate concurrent requests create exactly one provider-call winner.
- [x] P6-03 — Define `COMPLETED` as a non-replayable tombstone that always returns `409 DUPLICATE_REQUEST`.
- [x] Store only an opaque request fingerprint derived from canonical request metadata and an HMAC of exact prompt bytes.
- [x] Reject one client request ID reused with a different fingerprint without exposing changed fields.
- [x] Document the 300-second crash-after-provider expiry limitation without unsafe automatic reconciliation.
- [x] Keep response storage/replay deferred to Phase 9 safe encrypted/reference storage.
- [x] P6-04 — Harden processing expiry, Redis failure, and provider-boundary recovery semantics.
- [x] Reject `releaseBeforeExecution` after the provider-execution marker instead of deleting coordination state.
- [x] Attempt `COMPLETED` tombstone finalization even when post-provider usage accounting or reconciliation fails.
- [x] Keep Redis/idempotency fail closed without an in-memory fallback.
- [x] Verify expired pre-provider state can be safely reserved again while preserving tenant/fingerprint isolation.

## Prompt Cache

- [x] P6-02 — Resolve the secure prompt-cache contract.
- [x] Restrict eligibility to `ALLOW`, risk score `0`, zero detected spans, and response-content-compatible retention.
- [x] Define trusted organisation scope and opaque HMAC key inputs without prompt normalization.
- [x] Define `PROMPT_CACHE_TTL_SECONDS=3600`, fail-open cache behavior, SSE sequence, and zero synthetic provider usage.
- [ ] **DEFERRED —** Implement encrypted payload or access-checked safe-reference response storage after the Phase 9 prerequisite exists.
- [ ] **DEFERRED —** Implement cache lookup/write, hit delivery, and accounting after policy/config fingerprint and non-billable cache accounting semantics are approved.

## Exit Criteria

- **PASSED —** Atomic tenant/user-scoped reservation admits one concurrent winner while Redis state exists.
- **PASSED —** Opaque keys, request fingerprints, fail-closed Redis behavior, `PROCESSING=300s`, and `COMPLETED=3600s` are verified.
- **PASSED —** Completed requests remain non-replayable tombstones and return `409 DUPLICATE_REQUEST`.
- **DEFERRED —** Prompt-cache storage, lookup/write, cache-hit delivery, and cache accounting require Phase 9 safe-storage prerequisites.
- **DEFERRED —** Safe response replay and durable post-provider crash reconciliation require Phase 9.
- **ACCEPTED LIMITATION —** A process crash after provider execution may have started can be followed by `PROCESSING` expiry and a later duplicate paid call; zero duplicate paid calls is not claimed as fully proven.

---

# 13. Phase 7 — Background Jobs, Billing, and Alerts

**Effort:** High

- [x] P7-01 — Resolve safe async job, usage, correlation, billing-idempotency, rollup, retry, and failure contracts.
- [x] P7-02 — Create BullMQ connection, typed payloads, validated billing queue producer, and reusable worker lifecycle foundation.
- [x] P7-03 — Append the authoritative RequestLog before publishing one safe `request.completed` billing job.
- [x] P7-04 — Process billing jobs through a durable tenant-scoped idempotency ledger and deterministic rollup reconciliation.
- [x] P7-06 prerequisite — Define explicit safe `request.completed` and `request.blocked` outcome event contracts.
- [x] Propagate canonical request ID across jobs and workers; map a separate trace ID only after a future approved tracing migration.
- [x] Add bounded retries and backoff.
- [x] Add worker entrypoint and graceful shutdown.
- [x] Add worker heartbeat.
- [x] Create idempotent billing worker.
- [x] Create monthly rollups.
- [x] Prevent replay from double charging.
- [x] P7-06 — Create a tenant-scoped idempotent basic analytics worker.
- [x] P7-07 prerequisite — Define the tenant-scoped daily anomaly rule, feature gate, baseline, severity, and deduplication contract.
- [x] P7-07 — Create tenant-scoped daily token anomaly worker.
- [x] P7-08 — Define the safe `alert.created` email notification contract.
- [x] P7-09 — Resolve provider-health, failed-enqueue recovery, failure-visibility, email-waiver, and Phase 7 exit contracts.
- [x] Approve a Phase 7 email implementation waiver; move delivery to Phase 8 after provider, configuration, sender, error mapping, and template approval.
- [x] P7-10 — Implement the scheduled Redis provider-health worker and conservative routing health gate.
- [x] P7-11 — Implement tenant-scoped bounded failed-enqueue recovery.
- [x] Keep raw prompts out of job payloads.

P7-03 keeps the current synchronous budget reconciliation until the billing
worker exists. Queue publication is attempted only after append-only RequestLog
persistence. A publication failure emits safe operational metadata, does not
mutate the authoritative record, and does not reverse an already delivered
provider response; the persisted record remains available for later recovery.

P7-04 uses the unique `{ orgId, requestId, jobType }` billing ledger to guard
`PROCESSING` and `COMPLETED` work. Rollups are recomputed from tenant-scoped
RequestLog records and written with `$set`, so duplicate or retried jobs cannot
increment usage twice. Unknown usage completes with `USAGE_UNAVAILABLE` and
never creates a synthetic zero-token rollup.

P7-05 runs one lifecycle-owned billing-worker heartbeat every 30 seconds through
the worker's existing BullMQ Redis connection. A heartbeat is stale after 120
seconds. The internal status exposes only fixed worker identity/type, running
and healthy flags, and safe heartbeat/job timestamps. Failed probes are logged
with safe operational metadata and do not block chat traffic.

Before P7-06 implementation, the canonical event contract was corrected so
workers never infer outcomes. Provider-path `request.completed` events carry
explicit `COMPLETED`, `FAILED`, or `INTERRUPTED` status plus `ALLOW` or
`ALLOW_WITH_MASK`. Policy blocks emit analytics-only `request.blocked` with
`BLOCKED` plus `BLOCK` and no provider/model/usage fields. Both event paths
append immutable RequestLog metadata before queue publication.

P7-06 publishes those safe request outcomes to a dedicated analytics queue and
recomputes tenant-scoped UTC-day organisation and user projections from the
append-only RequestLog source. A separate `{ orgId, requestId, jobType }`
ledger makes duplicate and retried jobs idempotent. Aggregates track approved
outcome counters, provider/model request counts, known provider token totals,
and an explicit unknown-usage request count; unknown usage is never converted
to zero. Analytics does not mutate RequestLog or BillingRollup and is not a
second budget-accounting source of truth.

The approved P7-07 contract evaluates only the user's current UTC-day known
token total against twice the previous seven-day active-day average. Baseline
days must have fully known usage, unknown days are excluded rather than treated
as zero, and at least three prior active days are required. Detection is gated
by trusted `Organisation.featureFlags.anomalyDetection`, consumes only
analytics `usage.updated`, and creates or updates one `HIGH`, initially `OPEN`,
tenant-scoped alert per user and observed day. Request-level, volume,
blocked-rate, provider-error, email, and notification behavior are excluded.

P7-07 extends the strict async contract with a safe `usage.updated` event that
contains only trusted identifiers and the observed UTC day. The analytics
worker publishes it after the tenant/user aggregate is persisted. The anomaly
worker reuses the shared BullMQ lifecycle, loads the trusted organisation
feature flag and scoped user-day projections, excludes unknown-usage days,
requires three qualifying prior active days, and compares the current total
against the approved strict greater-than-two-times baseline using integer-safe
arithmetic. A deterministic opaque job ID and an atomic unique tenant/user/day
Alert upsert prevent duplicate unresolved anomalies without a separate ledger.
Detected alerts contain only approved aggregate metadata and emit a safe
structured event; no email or notification job is created.

P7-08 permits only `alert.created` email events. The email job carries trusted
IDs and an allowlisted template identifier; it never carries recipient email,
rendered content, prompts, responses, PII, or secrets. Recipients are
`ORG_ADMIN` users loaded from tenant-scoped storage using trusted `orgId`, and
client input cannot select recipients. Delivery is idempotent by
`{ orgId, alertId, templateId }` and uses the existing three-attempt bounded
retry/failed-set contract. Reminders, escalations, and resolution emails are
deferred. Email implementation remains blocked because no provider, runtime
configuration, sender, provider-specific error mapping, template allowlist, or
rendered template content is approved.

P7-09 closes the remaining contract ambiguity without closing Phase 7. Provider
health is platform-scoped, scheduled every 60 seconds from the approved enabled-
provider registry, and stored only as `HEALTHY`, `UNHEALTHY`, or `UNKNOWN` at
`health:{providerId}` with a 120-second TTL. Routing may skip only
`UNHEALTHY`; missing, stale, or unavailable Redis state becomes `UNKNOWN` and
preserves existing capability, circuit-breaker, retry, and fallback behavior.
MongoDB provider-health history is deferred to Phase 10.
Adapter states map as `healthy -> HEALTHY`, `degraded -> UNKNOWN`, and
`unhealthy -> UNHEALTHY` so transient degradation remains observable without
blocking normal routing.

P7-10 adds one idempotently upserted BullMQ schedule per enabled production
provider, currently Groq only. The lifecycle-managed worker reuses the shared
BullMQ/Redis infrastructure, calls `ProviderAdapter.checkHealth()`, applies the
approved adapter-state mapping, and writes only `{ state, checkedAt }` with the
120-second TTL. Chat routing reads this state after policy evaluation and skips
only `UNHEALTHY`; missing, malformed, expired, or unreadable state remains
`UNKNOWN`. Focused tests and the full backend regression suite prove the TTL,
mapping, missing-state, and conservative routing behavior without adding Mongo
history, Bull Board, or new routing intelligence.

Failed billing or analytics publication after RequestLog persistence uses a
separate safe recovery ledger and a bounded startup/60-second backfill scan.
The scan processes trusted organisations separately, reconstructs allowlisted
jobs from append-only RequestLog records, uses deterministic queue IDs, and
relies on existing worker ledgers for side-effect idempotency. Three failed
publication attempts or a terminal BullMQ failed job stops automatic recovery.
BullMQ's failed set and safe logs are the Phase 7 visibility source; Bull Board
is deferred to optional controlled Phase 10 tooling. Alert listing/resolution
and email delivery remain Phase 8 responsibilities.

P7-11 implements that contract through the strict `async_enqueue_recovery`
MongoDB ledger with `PENDING`, `ENQUEUED`, `COMPLETED`, and `FAILED` states.
Immediate billing/analytics publication failures create durable tenant-scoped
records, while the startup and idempotently scheduled 60-second scan also
reconstructs missing records from append-only RequestLog data. Atomic claims,
deterministic BullMQ job IDs, and the existing billing/analytics ledgers guard
concurrent and repeated scans from duplicate effects. Publication retries stop
after three attempts, terminal failed jobs remain visible, and no raw prompt,
response, PII, credential, or secret is stored or logged.

## Exit Criteria

- [x] Chat response does not wait for workers.
- [x] Billing replay does not double charge.
- [x] Worker heartbeat works.
- [x] Failed jobs remain visible in BullMQ's failed set with safe structured logs; Bull Board is explicitly deferred to Phase 10.
- [x] Queue payloads contain no raw prompts.
- [x] Basic analytics jobs are tenant-scoped and idempotent.
- [x] Daily token anomalies are feature-gated, tenant/user scoped, and atomically deduplicated.
- [x] Provider-health jobs refresh safe Redis state every 60 seconds with a 120-second TTL, and routing applies only the approved conservative gate.
- [x] Missed billing/analytics enqueues are recovered through the bounded tenant-scoped ledger/backfill contract without duplicate effects.
- [x] P7-10 and P7-11 focused tests, typecheck, build, lifecycle checks, and sensitive-data scans pass.

---

# 14. Phase 8 — Admin Dashboard and RBAC

**Effort:** High

- [ ] Dashboard summary: requests, tokens, cost, provider use, fallback rate, cache hit ratio, alerts, budget, health.
- [ ] Request-log filters by employee, provider, date, and PII flag.
- [ ] Stable cursor pagination.
- [ ] Metadata-only admin results.
- [ ] User listing, role assignment, team assignment, activation, and deactivation.
- [ ] Revoke sessions when deactivating user.
- [ ] Policy and retention settings UI.
- [ ] Alert listing and resolution.
- [ ] Implement `alert.created` ORG_ADMIN email delivery only after provider, validated configuration, sender, error mapping, and template content are approved.
- [ ] Audit all admin changes.

## Exit Criteria

- [ ] Admin sees only their organisation.
- [ ] Team lead sees only their team.
- [ ] Admin does not automatically receive decrypted employee prompts.
- [ ] Dashboard values are correct.

---

# 15. Phase 9 — Retention, Encryption, and Audit

**Effort:** ⭐ Ultra

- [ ] Central AES-256-GCM service.
- [ ] Random IV and authentication tag.
- [ ] Key versioning.
- [ ] No key stored in MongoDB.
- [ ] No plaintext fallback.
- [ ] Metadata-only mode stores no prompt or response content.
- [ ] Encrypted mode encrypts user and assistant messages.
- [ ] Decrypt only in authorized user flow.
- [ ] Append-only audit schema.
- [ ] No audit update or delete API.
- [ ] Audit CSV export with bounded date range.
- [ ] Prevent CSV formula injection.
- [ ] Audit the export itself.

## Exit Criteria

- [ ] Modified ciphertext fails authentication.
- [ ] Metadata-only mode writes no content.
- [ ] Encryption failure stores no plaintext.
- [ ] Audit records cannot be modified through API.
- [ ] Export is tenant-scoped.

---

# 16. Phase 10 — Observability and Operations

**Effort:** High

- [ ] HTTP request and duration metrics.
- [ ] Chat completion and time-to-first-token metrics.
- [ ] Provider latency, error, retry, fallback, and circuit metrics.
- [ ] PII and policy metrics.
- [ ] Cache and idempotency metrics.
- [ ] Queue depth and worker heartbeat.
- [ ] Trace ID propagation to workers.
- [ ] One Grafana dashboard.
- [ ] Alerts for API error rate, MongoDB, Redis, worker heartbeat, queue failures, provider circuit, and audit-write failures.
- [ ] No high-cardinality user or organisation labels.

## Exit Criteria

- [ ] Logs are structured and redacted.
- [ ] Metrics endpoint works.
- [ ] Dashboard works.
- [ ] Critical alerts have runbooks.

---

# 17. Phase 11 — Testing and Hardening

**Effort:** ⭐ Ultra

## Required Test Areas

- [ ] PII.
- [ ] Policy.
- [ ] Routing.
- [ ] Retry.
- [ ] Circuit breaker.
- [ ] Encryption.
- [ ] Cursor pagination.
- [ ] Permissions.
- [ ] Login and refresh rotation.
- [ ] Idempotency.
- [ ] Cache.
- [ ] Billing replay.
- [ ] BullMQ.
- [ ] Audit.

## Release-Blocking Security Tests

- [ ] Cross-tenant conversations denied.
- [ ] Cross-tenant request logs denied.
- [ ] Cross-tenant billing denied.
- [ ] Cross-team access denied.
- [ ] Blocked prompt provider calls = 0.
- [ ] Masked prompt excludes original secret.
- [ ] PII prompt not cached.
- [ ] Duplicate request provider calls = 1.
- [ ] Encryption failure stores no plaintext.
- [ ] Logs contain no secret fixture.

## Exit Criteria

- [ ] All release-blocking tests pass.
- [ ] No critical defect remains open.
- [ ] Typecheck and build pass.
- [ ] Coverage is acceptable.

---

# 18. Phase 12 — Docker, CI/CD, and Deployment

**Effort:** High

Phase 12 is explicitly accelerated after Phase 7 for first-live-deployment
readiness. Phases 8–11 remain planned and are not cancelled.

- [x] P12-01 — Align AWS ECS/Fargate deployment and CI/CD contracts.
- [x] P12-02 — Make frontend configuration immutable across environments.
- [x] P12-03 — Separate API and BullMQ worker production entrypoints.
- [x] P12-04 — Add production frontend/backend Docker images.
- [x] P12-05 — Add a production-like local Compose stack.
- [x] P12-06 — Add an idempotent production index deployment command.
- [x] P12-07 — Add parameterized AWS infrastructure definitions.
- [x] P12-08 — Add GitHub Actions validation, deployment, smoke, and rollback.
- [ ] P12-09 — Verify staging/production-like release smoke and rollback.

- [x] Multi-stage backend Dockerfile.
- [x] Non-root runtime.
- [x] Production dependencies only.
- [x] API and worker commands.
- [x] Docker Compose local stack.
- [ ] CI: lint, typecheck, tests, builds, Docker build, smoke test.
- [ ] Push SHA-tagged image.
- [ ] Deploy staging API.
- [ ] Deploy always-on worker.
- [x] Run create-only index deployment in a dedicated verification database.
- [ ] Run staging smoke tests.
- [ ] Promote same tested image to production.
- [ ] Manual production approval.
- [ ] Record previous SHA.
- [ ] Run production smoke tests.
- [ ] Monitor 15–30 minutes.
- [ ] Keep rollback command ready.

## Exit Criteria

- [ ] CI is green.
- [ ] Staging and production are healthy.
- [ ] Worker processes jobs continuously.
- [ ] Rollback is tested.
- [ ] Deployment SHA is visible.

---

# 19. Phase 13 — Final Demo and Documentation Verification

**Effort:** Medium

## Demo Scenarios

- [ ] Safe prompt allowed.
- [ ] Email masked.
- [ ] API key blocked.
- [ ] Primary provider fails and fallback succeeds.
- [ ] Duplicate send creates one provider call.
- [ ] Admin sees usage and fallback rate.
- [ ] Team lead sees only their team.
- [ ] Cross-tenant request is denied.
- [ ] Budget warning appears.
- [ ] Audit export works.

## Documentation Checks

- [ ] README commands match repository.
- [ ] API paths match implementation.
- [ ] Schemas match database design.
- [ ] Deferred features remain labelled deferred.
- [ ] Demo data is non-sensitive.
- [ ] Known limitations are honest.
- [ ] No certification claim is made.

## Exit Criteria

- [ ] Demo works from a clean environment.
- [ ] Documentation is accurate.
- [ ] Known limitations can be explained.
- [ ] Project is portfolio-ready.

---

# 20. Daily Work Template

```md
## Date: YYYY-MM-DD

### Current Phase
Phase X

### Selected Task
PX-XX Task name

### Today’s Goal
One clear outcome.

### Effort
Ultra / High / Medium / Low

### Files Expected to Change
- file 1
- file 2
- test file

### Acceptance Checks
- [ ] Check 1
- [ ] Check 2
- [ ] Check 3

### Result
Completed / Partial / Blocked

### Blocker
None or exact blocker.

### Commit
Commit message or SHA.

### Next Task
PX-XX
```

---

# 21. Task Start Checklist

- [ ] I know the current phase.
- [ ] I selected only one task.
- [ ] I read the relevant design section.
- [ ] I know the expected files.
- [ ] I know the acceptance checks.
- [ ] I am not adding a deferred feature.
- [ ] I planned the test.

# 22. Task Completion Checklist

- [ ] Typecheck passes.
- [ ] Relevant tests pass.
- [ ] Failure path is handled.
- [ ] Sensitive data is not logged.
- [ ] Tenant scope is preserved.
- [ ] Documentation remains correct.
- [ ] Code is committed.
- [ ] This file is updated.

---

# 23. Distraction Control — Parking Lot

When a new idea appears, add it here instead of implementing it.

- [ ] Future idea:
- [ ] UI improvement:
- [ ] Performance improvement:
- [ ] Roadmap feature:

Review this list only after Phase 13.

---

# 24. Blocker Handling

When blocked for more than 30–45 minutes:

1. Write the exact error.
2. Write expected behavior.
3. Isolate the smallest failing case.
4. Check safe logs.
5. Review the related document section.
6. Create a minimal reproduction.
7. Ask for help with the exact task and error.

Do not randomly change several files.

---

# 25. Phase Progress Tracker

| Phase | Status | Notes |
|---|---|---|
| Phase 0 | Completed | Documentation and base server completed |
| Phase 1 | In Progress | Foundation work |
| Phase 2 | Not Started | |
| Phase 3 | Not Started | |
| Phase 4 | Not Started | |
| Phase 5 | Completed | Login, tenant-scoped conversations, policy-aware streaming, responsive frontend, and P5-08 contract-aligned UX verified |
| Phase 6 | Completed | P6-01/P6-03/P6-04 idempotency proven; P6-02 cache contract resolved; P6-05 records cache/replay/recovery deferrals and accepted crash risk |
| Phase 7 | Completed | Provider health and durable billing/analytics enqueue recovery verified; email delivery waived to Phase 8 |
| Phase 8 | Deferred | Planned after first live deployment; not cancelled |
| Phase 9 | Not Started | |
| Phase 10 | Not Started | |
| Phase 11 | Not Started | |
| Phase 12 | In Progress | P12-01 through P12-08 implementation complete; live AWS rollout/rollback gates remain P12-09 |
| Phase 13 | Not Started | |

---

# 26. Immediate Next Task

## P12-09 — Staging and Production-Like Release Verification

**Effort:** Medium

Provision approved environment parameters/secrets, run the complete CI/CD
workflow against staging, verify authenticated application/worker/accounting
smoke, promote the same digests after approval, and execute rollback proof.
Do not start Phase 8 product work.

---

# 27. Self-Audit

- **Scope:** PASS — no new feature added.
- **Beginner suitability:** PASS — sequential tasks and clear gates.
- **Security:** PASS — critical tasks marked Ultra.
- **Distraction control:** PASS — one phase at a time and parking lot included.
- **Implementation readiness:** PASS — every phase has tasks and exit criteria.

> **Final Status: Active execution roadmap for the ProxiAI beginner solo-developer MVP.**
