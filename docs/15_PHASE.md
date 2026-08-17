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
Current Phase: Phase 5 — Chat, Conversations, and Streaming
Current Task: Awaiting approval before P5-07 — Login and Chat Frontend
Current Status: P5-06 Completed; Phase 4 provider-call integration gates passed
Current Blocker: None
Last Completed Task: P5-06 — Authenticated Chat Stream
Last Completed Commit: feat(chat): add authenticated policy-aware streaming
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
| Phase 6 | Redis cache and idempotency | ⭐ Ultra | No duplicate paid calls |
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
- [ ] Cross-tenant UPDATE and DELETE runtime gates remain deferred until those endpoints exist.
- [x] Secrets do not appear in logs.

**Mandatory Gate:** User from Org A cannot read, update, or delete Org B data.

**Runtime Verification:** Cross-tenant and cross-user Conversation reads return the same generic `404` as missing records. Mandatory UPDATE and DELETE verification must run when the first tenant-owned update/delete endpoints are implemented.

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
**Status:** In Progress

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
- [ ] P5-07 — Build login and chat frontend.
- [ ] Show mask, block, fallback, and interruption messages.

## Exit Criteria

- [ ] User can log in, create conversation, and stream a safe response.
- [x] User sees only their conversations.
- [x] Cross-tenant conversation tests pass.
- [x] Mid-stream provider splice is not implemented.

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

- [ ] Key includes `orgId` and client request ID.
- [ ] Use `SET NX`.
- [ ] Add processing and completed states.
- [ ] Add five-minute TTL.
- [ ] Fail closed when Redis is unavailable.
- [ ] Test 10 duplicate concurrent requests create exactly one provider call.

## Prompt Cache

- [ ] Normalize and hash prompt.
- [ ] Include `orgId` in key.
- [ ] Check retention eligibility.
- [ ] Never cache PII prompts.
- [ ] Add TTL.
- [ ] Mark cache hits.
- [ ] Fail open when cache is unavailable.

## Exit Criteria

- [ ] Duplicate paid calls are prevented.
- [ ] Cache and idempotency are tenant-scoped.
- [ ] PII prompts are not cached.
- [ ] Cache failure does not bypass policy.

---

# 13. Phase 7 — Background Jobs, Billing, and Alerts

**Effort:** High

- [ ] Create BullMQ connection and typed payloads.
- [ ] Propagate trace ID.
- [ ] Add bounded retries and backoff.
- [ ] Add worker entrypoint and graceful shutdown.
- [ ] Add worker heartbeat.
- [ ] Create idempotent billing worker.
- [ ] Create monthly rollups.
- [ ] Prevent replay from double charging.
- [ ] Create basic analytics worker.
- [ ] Create simple anomaly worker.
- [ ] Create email worker with safe templates.
- [ ] Keep raw prompts out of job payloads.

## Exit Criteria

- [ ] Chat response does not wait for workers.
- [ ] Billing replay does not double charge.
- [ ] Worker heartbeat works.
- [ ] Failed jobs are visible.
- [ ] Queue payloads contain no raw prompts.

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

- [ ] Multi-stage backend Dockerfile.
- [ ] Non-root runtime.
- [ ] Production dependencies only.
- [ ] API and worker commands.
- [ ] Docker Compose local stack.
- [ ] CI: lint, typecheck, tests, builds, Docker build, smoke test.
- [ ] Push SHA-tagged image.
- [ ] Deploy staging API.
- [ ] Deploy always-on worker.
- [ ] Run migrations.
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
| Phase 5 | Not Started | |
| Phase 6 | Not Started | |
| Phase 7 | Not Started | |
| Phase 8 | Not Started | |
| Phase 9 | Not Started | |
| Phase 10 | Not Started | |
| Phase 11 | Not Started | |
| Phase 12 | Not Started | |
| Phase 13 | Not Started | |

---

# 26. Immediate Next Task

## P1-06 — Health Endpoints

**Effort:** Medium

Do only this next:

1. Read the approved health endpoint contracts.
2. Keep liveness dependency-free.
3. Add readiness using MongoDB and Redis state.
4. Add service version.
5. Add commit SHA when available.
6. Add focused endpoint tests.
7. Run tests, typecheck, and build.

Do not begin API foundation work until P1-06 is complete.

---

# 27. Self-Audit

- **Scope:** PASS — no new feature added.
- **Beginner suitability:** PASS — sequential tasks and clear gates.
- **Security:** PASS — critical tasks marked Ultra.
- **Distraction control:** PASS — one phase at a time and parking lot included.
- **Implementation readiness:** PASS — every phase has tasks and exit criteria.

> **Final Status: Active execution roadmap for the ProxiAI beginner solo-developer MVP.**
