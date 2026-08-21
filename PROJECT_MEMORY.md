# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 12 in progress; contract/readiness audit complete.
- **Task:** P12-09.1 — Protected Runtime and Release Prerequisites.
- **Status:** P12-01 through P12-08 remain implemented. Current live execution
  is blocked on Phase 9 encryption secret selectors, protected smoke identity,
  green remote CI/current image digests, restored ECS rollback infrastructure,
  and deployed staging/Lightsail evidence. Phase 13 has not started.

## Latest Task — Phase 12 Contract and Readiness Audit

- **Scope:** Documentation-only reconciliation of all 32 Phase 12 roadmap
  checks: 10 tasks, 17 delivery checks, and 5 exits. No application behavior,
  model, index, API, queue, frontend screen, or migration was added.
- **Classification:** Fourteen checks are already complete, eleven are partial,
  and seven live release/exit checks are blocked. P12-01 through P12-08 are
  regression baselines; remaining work is P12-09 ECS release proof, P12-09A
  Lightsail public cutover, and P12-10 certification.
- **Read-only AWS evidence (2026-08-21):** the non-root deployment role and
  immutable scan-on-push ECR repositories are available. Three 256/512 staging
  task definitions/services exist, but all service desired/running counts are
  zero. No ProxiAI ALB, NAT Gateway, Lightsail instance, or apex A/alias record
  is active. `proxiai.me` is not serving the application.
- **Recovery boundary:** the ignored deep-stop snapshot exists with VPC,
  public/private subnets, ALB, target groups, HTTPS/rules, Route 53, NAT/EIP,
  route table, and desired-count data. It must be validated and used through
  the approved reconstruction path before ECS is called a rollback baseline.
- **Runtime inputs:** `proxiai/production` exists, but
  `MESSAGE_ENCRYPTION_KEYS_JSON` and
  `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION` are absent. Redis connectivity passes.
  Local Atlas connectivity is blocked by network allowlisting as expected;
  restored NAT and future Lightsail static IPs require approved Atlas entries.
  `SMOKE_ORG_SLUG`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` are not available in
  the local environment and must remain protected.
- **CI evidence:** before this audit commit, the local branch contained 44
  commits not present on `origin/main`. Recent public CI runs failed before
  deployment, so green current-SHA CI, image push, staging, promotion, monitor,
  and rollback cannot be claimed.
- **Canonical rollout:** protected inputs and GitHub/OIDC readiness -> restore
  ECS baseline -> current-SHA immutable staging smoke -> same-digest promotion
  and rollback proof -> provision one 2 GB `small_3_1` Lightsail host -> canary
  HTTPS -> explicit apex cutover -> public smoke/host rollback -> 15–30 minute
  observation -> separately approved ECS cost cleanup.
- **Migration:** no data migration. The existing create-only index step remains
  mandatory and destructive schema/data rollback remains prohibited.
- **Security:** Phase 11 thresholds and ten gates remain release blocking.
  Deployment additionally proves secret/image integrity, private worker and
  metrics, Atlas/Redis TLS/auth, serialized release/DNS changes, deployed SHA,
  rollback, cost bounds, and absence of secret/content leakage.
- **Agents planned:** A1 runtime prerequisites, A2 CI/immutable images, A3 ECS
  staging/rollback, A4 Lightsail canary/public cutover, and A5 final integration
  certification. A1/A2 may run in parallel; A3 -> A4 -> A5 is sequential.
- **Next:** P12-09.1 only. Do not provision or deploy until protected runtime
  inputs and recovery prerequisites pass. Do not start Phase 13.

## Latest Task — P11-08 Integration and Release Certification

- **Coverage:** Backend 78.12% lines / 83.65% branches; frontend 77.20%
  lines / 69.65% branches. Critical branch results: policy 93.75%, risk 100%,
  provider fallback 90.74%, retry 93.18%, circuit breaker 92.45%, AES-GCM
  91.67%, permissions 90%, and admin/conversation/message cursors 100%.
- **Tests:** Backend unit/coverage 264/264; frontend 27/27 across 12 files;
  isolated real integration 63/63 with zero failures and zero skips.
- **Real infrastructure proof:** The release harness creates disposable
  `mongo:8.0.12` replica-set and `redis:7.4.2-bookworm` containers, unique
  test databases/namespaces, and cleans them without touching production,
  demo, or developer data.
- **Security:** Tenant and billing isolation, authentication, RBAC, IDOR,
  prompt egress, encryption/plaintext denial, AuditLog atomicity/immutability,
  async/accounting replay safety, and pagination/bounded-query gates pass.
- **Reliability:** Refresh concurrency, provider/BullMQ/billing recovery,
  Mongo transaction rollback, and Redis idempotency groups passed three
  consecutive runs each with no unexplained flakiness.
- **Release:** `node scripts/verify-release.mjs` passed all 20 steps, including
  dependency audits, lint, typecheck, suites, coverage, integration, builds,
  security/diff scans, index/deployment script checks, Docker builds, non-root
  image users, required runtime files, and absence of embedded secret envs.
- **Defects fixed:** Canonical invalid-cursor error behavior, AuditLog mutation
  and CSV formula-injection gaps, nondeterministic encrypted message-pair
  ordering, and Windows npm child-process execution in the release harness.
- **Environment classification:** An ignored malformed local Redis assignment
  caused an initial worker-heartbeat run failure; verification used an explicit
  process-only local Redis URL. Initial repeat wrappers used database names that
  intentionally violated the `*_test` safety guard; corrected isolated names
  passed. Neither issue required product weakening.
- **Deferrals:** Prompt-cache/replay runtime evidence, cross-team resource
  isolation without a team-owned resource, external penetration testing,
  internet-scale claims, and destructive production tests remain explicit.
- **Next:** Phase 12 contract/readiness audit only; do not infer new Phase 12
  implementation from Phase 11 closure.

## Latest Task — P11-00 Phase 11 Contract and Readiness Audit

- **Scope:** Documentation-only audit of the 14 required test areas, 10
  release-blocking security checks, and 4 exit criteria in `docs/15_PHASE.md`.
- **Already evidenced:** PII, policy, routing, retry, circuit breaker,
  encryption, login/refresh, idempotency, billing replay, BullMQ, AuditLog,
  conversation/request-log tenant isolation, zero-provider BLOCK, masked-only
  provider egress, one-provider duplicate handling, plaintext-fallback denial,
  and secret-log exclusion.
- **Implementation gaps:** Coverage tooling/enforcement is absent; admin cursor
  boundary coverage, the complete route/permission matrix, explicit
  cross-tenant billing evidence, and one deterministic release-gate command
  remain Phase 11 work.
- **Approved deferrals:** Prompt cache/replay execution tests remain deferred
  because no cache implementation exists. Cross-team resource isolation remains
  deferred because no team-owned read resource exists; the first such resource
  inherits the mandatory `{ orgId, teamId }` negative gate.
- **Coverage contract:** Backend overall 75% line, frontend overall 60% line,
  and 90% branch targets for policy, risk scoring, routing, retry, circuit
  breaker, encryption, and permission pure modules. Explicit workflow tests
  remain mandatory even when percentages pass.
- **Data contract:** Phase 11 adds no model, index, API, queue, encryption
  format, audit action, or migration. Isolated test databases/Redis namespaces
  must never target production, demo, or developer data.
- **Security closure:** Any open Critical/High defect, unexplained critical-test
  flakiness, tenant leak, auth/budget bypass, duplicate paid effect, plaintext
  persistence, audit loss, or secret leak blocks completion.
- **Implementation order:** P11-01 coverage/release harness; P11-02 tenant and
  billing isolation; P11-03 auth/RBAC; P11-04 prompt egress/encryption;
  P11-05 provider/idempotency/billing/BullMQ; P11-06 pagination/API boundaries;
  P11-07 frontend coverage; P11-08 integrated release gate and closure.
- **Next task:** P11-01 — Coverage and Release Harness. Phase 12 must not start.

## Completed Tasks

- P10-01 through P10-10 — Bounded Prometheus metrics, private API/worker scrape
  listeners, HTTP/chat/provider/policy/PII/idempotency/dependency/queue/worker/
  audit instrumentation, Grafana dashboard, alerts, and dedicated incident
  runbooks completed on 2026-08-21.
- Phase 10 — Observability and Operations completed on 2026-08-21 after
  `241/241` backend tests, `30/30` focused observability fixtures, runtime
  readiness/scrape verification, operations-config validation, and security
  scans passed.
- P9-01 through P9-11 — Versioned AES-256-GCM, retention-aware encrypted
  Message storage/read, encrypted Conversation titles and migration,
  append-only AuditLog, audited admin/session/policy/budget/retention/alert
  mutations, safe CSV export, frontend workflows, and closure gates completed
  on 2026-08-21.
- Phase 9 — Retention, Encryption, and Audit completed on 2026-08-21.
- P9-00 — Phase 9 encryption, retention, audit, migration, export, session, and
  admin-mutation contracts resolved on 2026-08-21; no production code added.
- Phase 8 — Read-only organisation dashboard APIs and permission-aware admin
  frontend completed on 2026-08-21. Real Mongo verification proves request-log,
  user, team, and alert queries cannot return another organisation's records.

- Phase 0 — Planning and repository baseline
- P1-01 — TypeScript foundation verified against the repository on 2026-07-24
- P1-02 — Environment validation completed on 2026-07-24
- P1-03 — Structured logger completed on 2026-07-24
- P1-04 — MongoDB connection completed on 2026-07-24
- P1-05 — Redis connection completed on 2026-07-24
- P1-06 — Health endpoints completed on 2026-07-24
- P1-07 — API foundation completed on 2026-07-24
- P2-01 — Organisation model completed on 2026-07-25
- P2-02 — User and Team models completed on 2026-07-27
- P2-03 — Password security completed on 2026-07-27
- P2-04 — Tenant-aware login completed on 2026-07-28
- P2-05 — Refresh token rotation completed on 2026-08-03
- P2-06 — Authentication middleware completed on 2026-08-03
- P2-07 — Permission-based RBAC completed on 2026-08-03
- P2-08 — Logout completed on 2026-08-07
- P3-01 — Provider types and interface completed on 2026-08-07
- P3-02 — Fake provider adapter completed on 2026-08-07
- P3-03 — First real provider adapter completed on 2026-08-07
- P3-04 — Provider capability registry completed on 2026-08-08
- P3-05 — Retry policy completed on 2026-08-08
- P3-06 — Provider circuit breaker completed on 2026-08-08
- P3-07 — Ordered provider fallback completed on 2026-08-08
- Phase 2 + Phase 3 closure audit completed on 2026-08-08
- Phase 2 implementation marked complete with mandatory cross-tenant CRUD runtime gate explicitly deferred on 2026-08-08
- P4-01 — PII detection completed on 2026-08-08
- P4-02 — PII classification completed on 2026-08-12
- P4-03 — Explainable risk scoring completed on 2026-08-12
- P4-04 — Safe span masking completed on 2026-08-17
- P4-05 — Original prompt immutability completed on 2026-08-17
- P4-06 — `ALLOW` policy decision completed on 2026-08-17
- P4-07 — `ALLOW_WITH_MASK` policy decision completed on 2026-08-17
- P4-08 — `BLOCK` policy decision and budget-exhausted BLOCK criterion completed on 2026-08-17
- P4-10 — Safe structured policy decision events completed on 2026-08-17
- Phase 4 — PII and policy implementation closed on 2026-08-17; integration gates remain deferred
- P5-01 — Tenant-scoped Conversation model completed on 2026-08-17
- P5-02 — Tenant-scoped Message model completed on 2026-08-17
- P5-03 — Authenticated Create Conversation API completed on 2026-08-17
- P5-04 — Scoped Conversation list/read APIs and cursor pagination completed on 2026-08-17
- Phase 2 deferred cross-tenant Conversation READ gate passed with real MongoDB on 2026-08-17; UPDATE/DELETE gates remain deferred
- P5-05 — Scoped Conversation Message listing completed on 2026-08-18
- P5-06 prerequisite — Minimal authoritative token accounting completed on 2026-08-18
- P5-06 — Authenticated policy-aware chat streaming completed on 2026-08-18
- Phase 4 deferred BLOCK and masked-providerPrompt integration gates passed through P5-06 on 2026-08-18
- P5-07 — Login and Chat Frontend completed on 2026-08-18
- P5-07 addendum — Public Landing Page completed on 2026-08-18
- P5-07 addendum — Local Development Admin Provisioning completed on 2026-08-18
- Phase 5 — Chat, Conversations, and Streaming completed on 2026-08-18
- P5-08 prerequisite — Chat history, manual title, and attachment contracts resolved on 2026-08-19
- P5-08 — Chat Workspace Contract Corrections completed on 2026-08-19
- Phase 2 deferred cross-tenant Conversation UPDATE gate passed through the owner-scoped title PATCH on 2026-08-19; DELETE remains deferred
- P6-01 — Generalized tenant-scoped idempotency reservations completed on 2026-08-18
- P6-02 — Secure prompt-cache contract resolved on 2026-08-19; implementation remains deferred
- P6-03 — Completed idempotency tombstone and opaque request fingerprint protection completed on 2026-08-19
- P6-04 — Idempotency failure/recovery hardening completed on 2026-08-19
- P6-05 — Phase 6 closure and deferred cache/recovery gates recorded on 2026-08-19
- Phase 6 — Redis idempotency implementation and secure cache contract completed on 2026-08-19; cache/replay/recovery implementation remains deferred
- P7-01 — Safe async job and billing processing contract resolved on 2026-08-19; no BullMQ code added
- P7-02 — BullMQ queue, typed job validation, producer helper, and reusable worker lifecycle foundation completed on 2026-08-19
- P7-03 — Request-completed billing producer integration completed on 2026-08-19
- P7-04 — Idempotent async billing worker completed on 2026-08-19
- P7-05 — Billing worker heartbeat completed on 2026-08-19
- P7-06 — Tenant-scoped async request analytics completed on 2026-08-19
- P7-07 prerequisite — Tenant-scoped daily anomaly contract resolved on 2026-08-19; no worker code added
- P7-07 — Tenant-scoped daily token anomaly worker completed on 2026-08-19
- P7-08 — Safe alert email notification contract resolved on 2026-08-19; no worker or provider code added
- P7-09 — Phase 7 closure contract resolved on 2026-08-19; no production code added
- P7-10 — Scheduled Redis provider-health worker and conservative routing gate completed on 2026-08-19
- P7-11 — Durable tenant-scoped billing/analytics enqueue recovery completed on 2026-08-19
- Phase 7 — Background jobs, billing, analytics, anomaly detection, provider health, and bounded enqueue recovery completed on 2026-08-19; email delivery remains explicitly waived to Phase 8
- P12-01 through P12-08 — AWS contracts, immutable frontend configuration, split API/worker runtimes, production images, local Compose, create-only indexes, parameterized AWS infrastructure, and GitHub Actions release/rollback automation completed on 2026-08-19

## Important Decisions

- Phase 10 implements the P10-01 inventory without aliases: one process-local
  registry per API/worker runtime, bounded instruments at owning boundaries,
  one Grafana dashboard, eight alerts, and eight dedicated runbooks.
- Phase 10 metrics use process-local API and worker registries with private-only
  scrape endpoints. ALB, Caddy, public security groups, and the Lightsail
  firewall must not expose them.
- The canonical Phase 10 inventory and histogram buckets are fixed in the TDD.
  Labels are allowlisted domain/platform dimensions only. Tenant, user,
  request, resource, model, raw route/query, job, provider-request, prompt,
  response, PII, credential, error-message, and stack values are prohibited.
- Existing `requestId` remains the canonical HTTP/job correlation ID and never
  becomes a metric label. A second ad hoc trace ID is prohibited; full
  W3C/OpenTelemetry tracing remains deferred until collector, sampling,
  retention, and access-control contracts are approved.
- Prompt-cache and completed-response replay metrics remain truthfully deferred.
  Their metric series must not be registered as constant zero while the
  execution paths remain unimplemented.
- Existing Redis provider health, worker heartbeat state, structured redacted
  Pino logs, liveness/readiness, and seven-day CloudWatch logs are reused by the
  completed Prometheus instrumentation.
- API `/metrics` and worker port `9464` are private runtime endpoints. The API
  excludes its own scrape from HTTP metrics; the worker listener serves no
  application routes and closes before dependency shutdown. ALB and Caddy route
  neither endpoint.
- MongoDB provider-health history and public Bull Board/manual replay tooling
  are approved-deferred for the MVP; bounded metrics and safe failed-set/log
  visibility avoid duplicate storage and unsafe operational payload exposure.

- Phase 9 was completed in the approved order: P9-01 encryption keyring/service,
  P9-02 append-only AuditLog, P9-03 auth/policy durable events, P9-04 retained
  Message writes, P9-05 owner decryption, P9-06 title encryption/migration,
  P9-07 user/session mutations, P9-08 policy/budget/retention, P9-09 alert
  state, P9-10 export, and P9-11 closure verification.
- Encryption uses AES-256-GCM with fresh 12-byte IVs, 16-byte tags, unpadded
  base64url fields, and versioned tenant/resource-bound AAD. Plaintext fallback
  is forbidden.
- The MVP keyring uses `MESSAGE_ENCRYPTION_KEYS_JSON` and
  `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION`. Keys decode to exactly 32 bytes,
  remain outside MongoDB/frontend/logs/images, and old versions remain until a
  verified re-encryption migration finishes.
- `METADATA_ONLY` and `ENCRYPTED_STORAGE` are the only MVP retention modes.
  Changes are prospective. Custom TTL, no-storage mode, automated deletion,
  automatic rotation, per-organisation keys, and BYOK remain deferred.
- Successful streams may persist one idempotent user/assistant Message pair.
  Metadata-only stores no content; encrypted mode encrypts the original user
  message and assistant response. Blocked, failed, and interrupted streams
  persist no message content.
- Owner reads prove trusted Conversation ownership before selecting encrypted
  Messages. They return decrypted `content` only as `contentAvailable=true` and
  never expose the envelope. Admin dashboard paths never decrypt content.
- Manual custom Conversation titles become encrypted at rest in Phase 9; only
  the fixed `New conversation` fallback remains plaintext. Existing custom
  titles require an idempotent encrypt-verify-replace migration.
- AuditLog is tenant-scoped, append-only, action-allowlisted, and stores only
  bounded action-specific safe metadata. All update/replace/delete operations
  are rejected; historical structured logs are not backfilled.
- Every admin mutation and its AuditLog append must commit in one MongoDB
  transaction. Audit failure returns `503 AUDIT_UNAVAILABLE` and leaves no
  partial mutation.
- Role changes derive exact canonical permissions: EMPLOYEE chat permissions,
  TEAM_LEAD plus `team:view_logs`, and ORG_ADMIN all current tenant permissions.
  Clients never submit permissions or trusted `orgId`.
- User deactivation and explicit session revocation target trusted
  `{ orgId, userId }`. Disabling revokes all active refresh sessions; the last
  active ORG_ADMIN cannot be disabled or demoted.
- Audit export requires `admin:export_audit`, the `auditExport` feature flag,
  a maximum 90-day range and 10,000 rows, formula neutralization, and a durable
  `audit.exported` record before response headers.
- RequestLog remains append-only and is never used to reconstruct historical
  prompt/response content or historical audit events.

- Phase 8 admin APIs use trusted authenticated `orgId` only and expose no
  client-controlled tenant scope.
- Phase 8 implements read-only summary, request logs, billing usage, anomaly
  alerts, users, and teams. Cost, latency, cache, fallback, routing, and
  PII-risk metrics are omitted because current persistence does not support
  them authoritatively.
- Team-lead logs are deferred because `RequestLog` has no trusted team
  ownership field. Role/team/status, policy/budget/retention, alert resolution,
  and audit export are blocked by the Phase 9 durable append-only audit
  prerequisite.
- `ENCRYPTED_STORAGE` requires the validated Phase 9 keyring and readiness
  checks. `CUSTOM_RETENTION` is not an MVP mode, and alert email delivery
  remains deferred pending an approved provider/configuration/template contract.

- `docs/15_PHASE.md` is the official PHASE document; no duplicate root `PHASE.md` will be created.
- P1-02 is limited to `NODE_ENV`, `PORT`, `MONGO_URI`, and `REDIS_URL`.
- Startup errors must identify invalid variable names without printing their values.
- Environment variables are parsed once at startup and exposed through an immutable typed config object.
- Missing `PORT` uses the documented default `8080`; explicit ports must be integers from 1 to 65535.
- Pino is the single shared application logger.
- Logging uses validated `LOG_LEVEL`, `service: "proxiai-api"`, and the validated environment.
- Operational events use stable dotted names such as `app.started`.
- Sensitive configured paths are censored as `[REDACTED]` before JSON serialization.
- MongoDB uses one shared Mongoose connection with a five-second server-selection timeout.
- MongoDB readiness is derived from the actual Mongoose connection state.
- The API process may stay live while MongoDB is unavailable; readiness remains false.
- Graceful shutdown closes HTTP traffic before disconnecting MongoDB.
- Redis uses one shared lazy ioredis client with offline queuing disabled.
- Redis reconnect delay is capped at one second and stops after five attempts.
- Redis readiness is true only when the client status is `ready`.
- Real Redis success was verified with an authenticated temporary `redis:7-alpine` container bound to localhost.
- Redis returned `PONG`, readiness reported both MongoDB and Redis as `up`, and application shutdown closed both clients cleanly.
- BullMQ was not started and will require a separate future connection configuration.
- Liveness is dependency-free and reports only process/deployment metadata.
- Readiness uses in-memory MongoDB and Redis client states and returns `503` unless both are ready.
- Service version is read from `backend/package.json`; optional `COMMIT_SHA` is validated once through the environment config.
- Public health responses remain minimal and never expose connection strings, topology, or raw dependency errors.
- `FRONTEND_ORIGIN` is the single canonical CORS variable. `APP_ORIGIN` has no alias or fallback.
- The configured frontend value must be an exact URL origin without a path, query, fragment, or trailing slash.
- Browser requests are allowed only from the exact configured origin with credentials; requests without `Origin` remain available to health checks, server clients, and local tooling.
- Every request receives a server-generated UUID request ID. Client-provided request IDs are replaced because Phase 1 has no trusted-internal-caller mechanism.
- Request ID middleware runs before Helmet, CORS, body parsing, routes, 404 handling, and global errors.
- Normal JSON APIs use shared success/error envelope builders; health success responses keep their separately approved raw contract.
- `AppError` represents known operational failures. Unknown failures return a generic `500` response and are logged without the raw error, body, headers, or stack.
- JSON request bodies are limited to 1 MB and oversized payloads use the standard `413` error envelope.
- Helmet defaults are enabled and Express branding is disabled.
- Organisation is the tenant root and may be queried using a trusted backend-derived `orgId`.
- Future child tenant records must be queried with trusted `orgId` together with their resource identifier; ordinary client-supplied `orgId` is never authoritative.
- Organisation `orgId` is a backend-generated immutable UUID v4. The MVP `slug` is also immutable, while `name` may change.
- Organisation enums are uppercase and use fail-closed defaults: `SUSPENDED`, `FREE`, zero monthly token budget, `METADATA_ONLY`, and all four approved feature flags disabled.
- Organisation retention, policy, and feature-flag objects use strict throw behavior, so unknown nested fields fail instead of being silently stored.
- Organisation policy requires integer thresholds from 0 to 100 and enforces `blockThreshold > maskThreshold` during document validation.
- Future partial policy updates must validate the complete resulting policy object, not only the fields present in the patch.
- Organisation uniqueness is enforced by real MongoDB indexes on `orgId` and `slug`; `unique` is an index constraint, not a normal Mongoose validator.
- P2-01 uses schema-declared indexes only. A separate index migration framework remains outside this task.
- Deferred organisation fields such as custom retention, routing configuration, current billing period, and advanced PII flags are intentionally rejected.
- Tenant User roles are limited to `EMPLOYEE`, `TEAM_LEAD`, and `ORG_ADMIN`; `SUPER_ADMIN` is excluded from tenant-owned User records.
- User permissions are stored only from the approved tenant permission allowlist. `platform:view_health` is excluded and role-to-permission mapping remains deferred to P2-07.
- User and Team records require immutable UUID v4 `orgId` values. Public `userId` and `teamId` values are backend-generated immutable UUID v4 strings.
- User email uniqueness is per organisation through `{ orgId, emailNormalized }`. Email normalization is deterministic `trim()` plus lowercase.
- Future login must resolve an immutable organisation slug first, derive trusted `orgId` from the Organisation record, and then query `{ orgId, emailNormalized }`.
- `User.teamId` is the single membership source. Team records do not store `memberIds`.
- The User model validates only `teamId` UUID shape. Future assignment services must load Team with `{ orgId, teamId }` and reject missing or cross-organisation membership.
- An `ACTIVE` `TEAM_LEAD` requires `teamId`; a `DISABLED` `TEAM_LEAD` may temporarily have no team during provisioning.
- User status defaults to `DISABLED`; Team `isActive` defaults to `false`.
- Team display names are retained in `name`; internal `nameNormalized` uses trim plus lowercase and is unique per organisation.
- `passwordHash` remains required but is not generated or verified in P2-02. It is excluded from normal projections and JSON/object serialization.
- `emailNormalized`, `failedLoginCount`, and `lockedUntil` are excluded from normal projections and serialization. `lastLoginAt` remains normally selectable.
- P2-02 does not add generic tenant query middleware. Future repositories and services must require trusted `orgId` and must not query User or Team by `_id` or public ID alone.
- New passwords use Argon2id only with explicit `memoryCost: 19_456`, `timeCost: 2`, `parallelism: 1`, and `hashLength: 32`.
- New-password validation accepts 15–128 Unicode code points after NFC normalization. Spaces and Unicode are allowed; passwords are never trimmed, case-folded, or truncated.
- Password verification applies NFC normalization and only the defensive 128-code-point maximum, so future increases to the new-password minimum do not invalidate existing hashes.
- Malformed or unsupported stored hashes raise a safe internal `PASSWORD_VERIFICATION_FAILED` operational error instead of being treated as ordinary mismatches.
- Password helpers do not log. Pino redacts known top-level and one-level nested `passwordHash` paths in addition to existing password paths.
- The documented password policy follows current NIST length, Unicode, and composition guidance, but full verifier alignment is not claimed.
- Login accepts only `organisationSlug`, `email`, and `password`; it resolves the Organisation first and derives trusted `orgId` from the database.
- Organisation-not-found, suspended Organisation, user-not-found, disabled User, and incorrect-password paths return the same public `401 INVALID_CREDENTIALS` response.
- Missing Organisation/User paths perform dummy Argon2 verification. Malformed real hashes emit a safe operational event, increment known-user failure metadata best-effort, and then perform dummy verification.
- Known-user authentication failures increment `failedLoginCount` best-effort. Successful login resets it and updates `lastLoginAt` best-effort after critical token work succeeds.
- Login has no account lockout. Redis enforces fixed-window IP and account limits of 10 attempts per 15 minutes and fails closed with generic `503` when unavailable.
- Redis rate-limit identifiers are HMAC-SHA-256 digests using dedicated `AUTH_RATE_LIMIT_SECRET`; raw IP, organisation slug, and email never enter Redis keys.
- Express trusts forwarded client IP only from loopback, link-local, and
  private-network reverse-proxy peers; public direct peers cannot forge the
  login rate-limit identity through `X-Forwarded-For`.
- Access tokens use `jose`, HS256, protected-header `typ: at+jwt`, issuer `proxiai`, audience `proxiai-api`, type `access`, and validated `ACCESS_TOKEN_TTL_MINUTES`.
- JWT role claims serialize uppercase `UserRole` values. Permission claims serialize canonical lowercase namespaced `UserPermission` values without transformation.
- P2-06 must allow only HS256, validate the complete token contract, reload current User and Organisation state, and validate every current permission against the existing allowlist.
- Initial login creates separate backend UUID v4 `tokenId`, `sessionId`, and `familyId` values. The access token uses `sessionId`, not `familyId`.
- Refresh tokens are 32 random bytes, only SHA-256 hashes are persisted, and raw values exist only long enough to set the response cookie.
- The host-only `proxiai_refresh` cookie is HttpOnly, Secure only in production, SameSite Lax, scoped to `/api/v1/auth`, and has no Domain attribute.
- SameSite Lax assumes the frontend and API are deployed same-site. Cross-site cookie design is not part of P2-04.
- Initial refresh-token persistence is critical and occurs before access-token signing or cookie response. Login metadata updates and structured security-event logging are best-effort.
- P2-04 introduced safe structured authentication events; Phase 9 now appends
  approved durable tenant audit events after trusted organisation resolution.
- P2-05 exclusively owns refresh rotation, reuse detection, family revocation, and the refresh endpoint.
- Refresh-token lookup may start with unique `tokenHash` because trusted `orgId` is not known until the database record is loaded.
- Refresh rotation uses a conditional MongoDB `findOneAndUpdate` gate scoped by old token `_id`, trusted `orgId`, `usedAt: null`, `revokedAt: null`, and future `expiresAt`.
- Successful refresh preserves `orgId`, `userId`, `sessionId`, and `familyId`; it changes `tokenId`, raw token, token hash, and expiry.
- Refresh access tokens are signed from current active User and Organisation state, not from stale JWT claims.
- Refresh failures for absent, unknown, expired, used, revoked, disabled-User, and suspended-Organisation states return the same public `401 INVALID_REFRESH_TOKEN` response.
- Confirmed used-token replay outside the five-second concurrency grace revokes
  the trusted token family and emits `auth.refresh_reuse_detected`; a recent
  predecessor or concurrent atomic-gate loser returns the same safe public
  failure without revoking the winning family.
- Refresh operational failures emit `auth.refresh_operational_error` and return
  generic `503 AUTH_TEMPORARILY_UNAVAILABLE` without clearing the refresh
  cookie. Terminal invalid-token `401` responses may clear it.
- P2-05 introduced safe refresh events; Phase 9 now durably audits trusted
  refresh-reuse and session/logout actions without token material.
- P2-06 verifies bearer access tokens with `jose`, HS256, protected-header `typ: at+jwt`, issuer `proxiai`, audience `proxiai-api`, valid signature, expiry, and `type: access`.
- P2-06 treats JWT claims as identity hints only. It reloads the current User with `{ orgId, userId }` and the current Organisation with `{ orgId }` before attaching context.
- Authenticated request context contains only `userId`, `orgId`, current database `role`, current database `permissions`, and `sessionId`.
- Missing, malformed, expired, disabled-User, suspended-Organisation, invalid-claim, and stale-token cases return the same public `401 UNAUTHORIZED` response.
- `GET /api/v1/auth/me` is the minimal protected route integration for validating attached auth context; RBAC remains P2-07.
- P2-07 authorization checks use current `request.auth.permissions` only. Roles are not trusted alone for authorization decisions.
- `requirePermission(permission)` validates the configured permission against the canonical lowercase `UserPermission` allowlist before checking the current auth context.
- Missing auth context returns `401 UNAUTHORIZED`; missing required permission returns `403 FORBIDDEN`.
- Organisation and team scope helpers accept trusted resource scope values only and compare them against server-derived auth context.
- P2-07 adds no new feature route because no currently implemented documented route requires a permission guard without starting a later phase.
- Provider contracts use canonical `ProviderId` values: `groq`, `gemini`, and `third`.
- P3-01 keeps provider SDK-specific request, response, stream, and error objects outside shared/domain contracts.
- Provider messages are readonly canonical role/content objects, and provider calls accept an optional `AbortSignal` for future cancellation.
- Provider results normalize usage, latency, finish reason, estimated cost, provider identity, and model identity.
- Temperature is omitted until approved documentation explicitly adds it.
- Fake provider uses deterministic configuration only: success, timeout, rate-limit, server-error, and mid-stream-failure modes.
- Fake provider increments a call counter for completion and stream attempts, including failed calls, so later idempotency/routing checks can verify provider-call counts.
- Fake provider failures use normalized `ProviderError` shapes and do not include raw prompts, raw responses, headers, keys, or SDK objects.
- Groq is the approved first real provider adapter.
- Groq configuration is validated through `GROQ_API_KEY`, `GROQ_MODEL`, and `PROVIDER_REQUEST_TIMEOUT_MS`.
- `GROQ_MODEL` has no hidden production default; deployments must configure it explicitly.
- `llama-3.1-8b-instant` is deprecated/shut down for the current developer tier and is not an active project model.
- `openai/gpt-oss-20b` is the current Groq production model for this project; selection remains explicit through `GROQ_MODEL` and is not hardcoded in the adapter.
- Groq SDK retries are disabled in the adapter because retry/fallback/circuit breaker work is deferred.
- Provider pricing is not approved yet, so Groq results leave `estimatedCostUsd` undefined.
- Provider capabilities are centralized in a read-only registry instead of duplicated across adapters.
- Registry entries currently include Groq and the deterministic fake provider.
- Registry model metadata includes supported models, context/output limits, streaming support, and non-streaming support.
- Cost and latency metadata are omitted because exact approved pricing and latency seed values are not documented yet.
- Provider retry defaults are centralized at max 3 attempts, 500 ms exponential base delay, 4,000 ms delay cap, and up to 250 ms jitter.
- Provider retries apply only to normalized retryable provider errors for timeout, rate limit/429, unavailable, and approved transient 500/502/503/504 provider errors.
- Authentication, invalid request, validation/client errors, and non-normalized errors are not retried.
- Retry backoff respects `AbortSignal` and returns a normalized `ProviderRetryAbortedError` when aborted.
- Provider circuit breaker defaults are centralized at 5 consecutive availability failures, 30 seconds cooldown, and 1 half-open trial.
- Circuit state is in process memory and kept per provider for the MVP.
- Circuit failures count only normalized retryable provider availability errors; authentication and invalid-request errors do not open the circuit.
- OPEN circuits fail fast with normalized `ProviderCircuitOpenError`; after cooldown, one HALF_OPEN trial is allowed.
- Ordered provider fallback is deterministic and bounded by the supplied candidate list; it does not perform smart routing or pricing decisions.
- Streaming fallback is allowed only before the first streamed chunk; after any chunk is emitted, mid-stream errors are returned without switching providers.
- Fallback records only safe metadata: request ID, provider ID, model, attempt number, status, error category, and status code.
- Phase 3 live verification used the Groq adapter directly, not retry/fallback/circuit orchestration, to avoid unintended extra paid calls.
- Mandatory cross-tenant CRUD verification must run against the first implemented tenant-owned CRUD resource before that resource is considered complete.
- PII detection is deterministic regex/rule-based only for MVP; no ML/NLP, masking, risk scoring, policy decisions, or provider calls were added in P4-01.
- PII overlap precedence is credential/internal-secret first, then financial, government ID, and contact info; lower-priority overlapping spans are dropped.
- PII detection metadata contains only category, detector, offsets, confidence, length, and normalized length where useful; raw detected values are excluded.
- PII classification preserves the canonical `CONTACT_INFO`, `FINANCIAL`, `GOVERNMENT_ID`, `CREDENTIAL`, `INTERNAL_SECRET`, and `BUSINESS_CONFIDENTIAL` names from the approved PRD/TDD/ADR.
- Classification deterministically derives categories from detector IDs using a static map; it preserves offsets, confidence, detector identity, and safe metadata without accepting raw source values.
- PII risk weights follow the approved TDD exactly: contact 10, financial 25, government ID 30, credential 40, internal secret 40, and business confidential 20 per unique classified span.
- Risk scoring sums per-span category weights, ignores exact duplicate spans, exposes safe per-category contribution metadata, and caps the normalized score at 100.
- PII masking uses the documented email, phone, and credential placeholders; unspecified detectors and overlapping span clusters use the consistent `[PII_REDACTED]` fallback.
- Masking removes exact duplicates, merges overlapping ranges, applies replacements from the end, and returns safe source/masked offsets plus canonical categories without raw detected values.
- Immutable PII processing reads only the original root prompt and derives a separate frozen sanitized request containing the masked prompt.
- Arbitrary nested request fields are neither spread nor forwarded into the sanitized representation, preventing shallow-copy mutation and accidental raw-context propagation.
- The canonical policy action allowlist is `ALLOW`, `ALLOW_WITH_MASK`, and `BLOCK`; P4-06 implements only the `ALLOW` decision branch.
- `ALLOW` requires `budget.exceeded === false` and `risk.score < policy.maskThreshold`; exact threshold equality is not allowed and remains for P4-07.
- Policy evaluation uses the repository-canonical `maskThreshold`/`blockThreshold` Organisation fields and returns `risk_below_mask_threshold` with safe score/category/count metadata only.
- `ALLOW_WITH_MASK` requires an available budget and `maskThreshold <= risk.score < blockThreshold`; exact mask-threshold equality is included.
- Masked decisions use the P4-05 sanitized prompt as the TDD-defined `providerPrompt`, return `mask_threshold_reached`, and never include the original detected value.
- `BLOCK` uses the approved order: `budget_exceeded` takes precedence, otherwise `risk.score >= blockThreshold` returns `high_risk_pii`.
- BLOCK decisions intentionally have no `providerPrompt`; they contain only frozen safe reason, score, category, and detector-count metadata.
- `docs/02_SDD.md` now uses the TDD-canonical `providerPrompt` name, resolving the previous `effectivePrompt` naming mismatch.

## Commands That Work

```bash
cd backend
npm test
npm run typecheck
npm run build
npm ci
npm audit --omit=dev
node --test tests/organisation.model.integration.mjs
node --test tests/user-team.model.integration.mjs
node --test tests/refresh.integration.mjs
# After providing a valid .env:
npm run dev
npm start

cd frontend
npm test
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Known Blockers

- P12-09 live AWS verification requires approved region, VPC/private subnet IDs, domain/certificate values, task sizing/counts, OIDC deployment roles, GitHub Environment approvals/secrets, MongoDB Atlas and managed Redis connectivity, and staging/production smoke identities. These values are intentionally parameterized and were not guessed.
- CloudFormation service-side validation, ECR push, ECS rollout, CloudWatch worker proof, production promotion, and rollback cannot be executed until AWS credentials and the approved account inputs exist.

## Documentation Gaps

- The missing `docs/07_DEPLOYMENT_ARCHITECTURE.md` gap is resolved with the canonical AWS ECS/Fargate deployment contract.
- The origin-variable, authentication token-TTL, and Phase 9 encryption-key
  names are resolved. The canonical keyring variables are
  `MESSAGE_ENCRYPTION_KEYS_JSON` and
  `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION`.
- The OpenAPI readiness example includes `providerAvailable`, while P1-06 explicitly requires only MongoDB and Redis readiness. P1-06 follows the active phase scope; provider readiness remains deferred until provider abstraction exists.
- The tenant login contract is reconciled around organisation slug plus per-organisation email. Platform-level identity remains a separate future design and must not be represented as a tenant `SUPER_ADMIN` User.

## Known Technical Debt

- Logger redaction is path-based. Unknown, unexpected, or differently nested object shapes are not automatically safe; raw requests, provider errors, and environment objects must never be logged.
- Request-scoped child loggers are available, but full HTTP completion logging and `pino-http` integration were not added because they are outside the explicit P1-07 checklist; they remain deferred to the observability phase.
- Initial MongoDB connection failure is logged safely but is not retried automatically; the process remains live and not ready.
- Readiness currently reflects connection state only; it does not execute MongoDB or Redis probe commands.
- Future `AppError` callers must ensure optional `details` contain only safe client-correctable data.
- Unknown errors intentionally omit raw exceptions and stack traces from logs, improving data safety but reducing immediate diagnostic detail.
- Organisation policy invariants are enforced for document validation; future query-style partial updates need a service flow that reconstructs and validates the complete policy object.
- Organisation indexes remain schema-declared, while production deployment now uses the explicit create-only `npm run deploy:indexes` command with `autoIndex=false`; destructive index synchronization and general data migrations remain intentionally unimplemented.
- User/Team schemas cannot prove cross-collection organisation ownership by themselves. Team assignment and `createdBy` checks require future trusted service/repository lookups using `orgId`.
- Future user-creation services must call the password hashing helper before persistence; direct internal model writes can still bypass that service boundary.
- Compromised/common-password blocklisting remains deferred. Login rate limiting and missing-user timing equalization are now implemented.
- Argon2 is a native dependency; clean installation succeeded on the current Node 22 Windows environment, but deployment images must verify compatible native binaries.
- The approved local Argon2 profile averaged 31.78 ms across five manual samples. Production hardware and expected authentication concurrency still require benchmarking.
- The earlier development-only `brace-expansion` advisory was resolved during
  the Phase 10 release gate through a safe lockfile-only transitive update;
  full and production audits now report zero vulnerabilities.
- JWT claims are authentication assertions, not the final authorization source. P2-06 must reload active User and Organisation state before protected access.
- Role-to-permission policy mapping remains deferred to P2-07; P2-04 serializes only allowlisted permissions already stored on the User.
- The fixed-window limiter evaluates IP and account keys independently. A partial Redis write can increment one dimension before another evaluation fails, but login still fails closed.
- If access-token signing fails after critical refresh-token persistence, the unissued refresh record is unusable because its raw token is never returned; it remains until TTL cleanup.
- Successful-login metadata updates are best-effort, so a valid issued session can exist even if `failedLoginCount` reset or `lastLoginAt` update temporarily fails.
- Logger redaction now covers known authentication paths, but it remains path-based and is never permission to log raw User objects, requests, tokens, or credentials.
- Logout, refresh-token rate limiting, durable audit persistence, session administration, feature-flag gates, and route-level integration on future business APIs remain unimplemented by design.
- Exact role-derived default permission grants are not encoded because approved docs do not define a complete role-to-permission matrix; authorization uses explicit stored permissions.
- Without MongoDB transactions, a process crash after old-token claim and before replacement response can force re-login; the flow fails closed and revokes family on known post-claim operational failures.
- Concurrent replay family revocation uses currently persisted family records; a full session-family state table remains deferred.
- P3-01 adds contracts only. Fake providers, real SDKs, retry, fallback, circuit breaker, routing, and capability registry remain deferred to later Phase 3 tasks.
- Normalized `ProviderError` objects are safe contracts, but adapters must still avoid logging raw SDK errors, raw prompts, raw responses, headers, keys, or provider secrets.
- P3-02 is deterministic test infrastructure, not a real provider. Real SDK integration, retry, fallback, circuit breaker, routing, and capability registry remain deferred.
- P3-03 has no live Groq network verification in automated tests. Tests inject a no-network mock client and verify mapping, timeout options, streaming, error normalization, health, and capabilities.
- P3-04 does not choose providers or models for requests. Routing, retry, fallback, circuit breaker, and dynamic provider-health overlay remain later Phase 3 work.
- P3-05 adds only the generic retry helper/policy. It is not wired into routing, fallback, or circuit breaker behavior yet.
- P3-07 fallback is reusable provider orchestration only; it is not wired into chat endpoints because Phase 5 chat is not started.
- Circuit breaker state remains in-memory only; distributed provider resilience state is deferred.
- Cross-tenant Conversation READ and UPDATE gates are proven through scoped list/read and manual title PATCH routes. The DELETE gate remains deferred until a tenant-owned delete endpoint exists.
- P4-01 regex detectors can produce false positives/negatives and are not a complete DLP system.
- `BUSINESS_CONFIDENTIAL` remains an approved category but is not emitted until an approved organisation-configured confidential-term detector exists.
- Risk accuracy depends on P4-01 detection accuracy; P4-03 intentionally adds no confidence weighting, masking, thresholds, or policy decisions.
- Masking protects only spans found by P4-01; regex false negatives remain unmasked, and unspecified categories intentionally use the generic placeholder.
- The sanitized prompt representation is not yet wired from policy into provider execution; Phase 5 must prove that only masked `providerPrompt` reaches a provider for `ALLOW_WITH_MASK`.
- Policy evaluation trusts the separately computed `BudgetStatus.exceeded` flag; billing-rollup calculation and strict in-flight budget reservation remain later work.
- Zero provider calls are structurally guaranteed inside the policy module because it has no provider dependency; end-to-end blocked-chat proof remains deferred until chat integration exists.
- Policy decisions emit only allowlisted metadata: request ID, action, risk score, approved reason code, category names, detector count, and trusted auth-derived organisation/user IDs when available.
- Stable policy event names are `policy.allow`, `policy.mask`, `policy.block`, and `policy.budget_block`; budget exhaustion remains distinguishable without exposing budget details or prompt content.
- Policy event creation never spreads the decision or auth objects, so `providerPrompt`, role, permissions, session ID, and unexpected fields are not forwarded to logs.
- P4-10 originally emitted structured application events only; Phase 9 now
  persists approved policy decisions in the append-only AuditLog.
- Phase 4 implementation is complete, but two runtime gates remain explicitly deferred: `BLOCK` must cause zero provider calls, and `ALLOW_WITH_MASK` must send only masked `providerPrompt`.
- Both deferred gates must be proven when the first Phase 5 chat pipeline wires policy decisions to provider execution; no temporary provider/chat route will be created merely to mark them passed.
- P5-01 resolves the Conversation documentation conflict in favour of the approved task contract: plain `title`, default `"New conversation"`, nullable `lastMessageAt`, and no `status`, `titleEnc`, or `titlePreview` fields.
- Phase 9 now encrypts approved manual custom titles; the PATCH still stores
  only the explicitly supplied title and never derives it from prompt or
  provider content.
- Conversation ownership identifiers `conversationId`, `orgId`, and `userId` are immutable UUID v4 values; `conversationId` is generated only by the backend.
- Conversation declares only the approved unique `{ conversationId: 1 }` index and owner-list `{ orgId: 1, userId: 1, lastMessageAt: -1 }` index.
- Future tenant-owned Conversation queries must use trusted `orgId` plus authenticated `userId` and the resource identifier where applicable; ordinary client input never establishes tenant scope.
- Phase 5 UI reference: light/white theme, ProxyAI green accent, minimal Claude-style layout, left conversation sidebar, center chat workspace, right policy/risk panel, subtle borders/shadows, clean whitespace, and no generic AI-dashboard styling.
- P5-02 resolves Message persistence conflicts with immutable UUID v4 `messageId`, `orgId`, `conversationId`, and `userId`, plus uppercase `USER`, `ASSISTANT`, and `SYSTEM` roles.
- Message documents have no plaintext content field. Optional `contentEnc` uses a strict encrypted shape and is excluded from normal selection and serialization; `contentStored` defaults to `false` and must match encrypted-content presence on creation.
- Message is append-oriented and uses `createdAt` only. `tokenCount` is optional but must be a non-negative safe integer.
- Message declares only unique `{ messageId: 1 }` and tenant-conversation `{ orgId: 1, conversationId: 1, createdAt: 1 }` indexes.
- Phase 9 adds immutable `requestId` pair correlation and the encryption
  service. Provider/model message metadata and `expiresAt`/TTL remain deferred.
- Future Message reads must first establish Conversation ownership and query with trusted tenant/owner scope; client-supplied `orgId`, `userId`, or conversation ownership is never authoritative.
- `POST /api/v1/conversations` requires a valid access token and current `chat:send` permission before request validation or persistence.
- Create-conversation input is a strict Zod object containing only optional `title`; client-supplied `orgId`, `userId`, or unknown fields are rejected.
- Conversation ownership is copied only from trusted `request.auth.orgId` and `request.auth.userId`; the repository receives no client-selected ownership fields.
- The create response uses the standard `201` success envelope with request ID and a safe Conversation summary that excludes tenant IDs and MongoDB internals.
- P5-03 could not prove cross-tenant reads because it exposed creation only; P5-04 now proves cross-tenant and cross-user Conversation read denial.
- `GET /api/v1/conversations` and `GET /api/v1/conversations/:conversationId` require authentication and current `chat:view_own` permission.
- Conversation list/read repository methods always query using trusted `orgId` and `userId`; single-resource reads additionally require `conversationId` in the same database filter.
- Foreign-organisation, foreign-user, and nonexistent Conversation identifiers share the same generic `404 NOT_FOUND` response.
- Conversation pagination sorts by descending `lastMessageAt` with descending public `conversationId` as the stable tie-breaker, fetches `limit + 1`, and returns an opaque base64url cursor.
- Cursor data is treated as untrusted and validated before use. It contains no tenant identity and cannot override auth-derived scope; cursor HMAC remains unimplemented because no dedicated signing key is approved.
- Real MongoDB HTTP tests prove cross-tenant and cross-user Conversation READ and UPDATE denial. DELETE remains deferred because no delete endpoint exists.
- `GET /api/v1/conversations/:conversationId/messages` requires authentication and current `chat:view_own` permission, then verifies Conversation ownership through trusted `orgId`, `userId`, and `conversationId` before reading Messages.
- Message listing queries always include trusted `orgId` and `conversationId`, use chronological `createdAt` ordering with `messageId` as the public tie-breaker, and return an opaque validated cursor.
- Message API responses expose `messageId`, lowercase API `role`, optional
  `tokenCount`, `createdAt`, and `contentAvailable`. Phase 9 may add authorised
  owner-only `content`; it never exposes `contentEnc`, ciphertext, IV,
  authentication tag, key version, or other encryption metadata.
- Message reads prove owner scope before selecting encrypted fields and decrypt
  only for that owner. Metadata-only rows continue to omit content.
- Phase 5 history is metadata-only: `contentAvailable: false` omits `content`, and `contentEnc` is never exposed. `METADATA_ONLY` never stores content.
- Phase 9 implements AES-256-GCM user/assistant persistence and authorised
  decryption for `ENCRYPTED_STORAGE`. Only successful stream completion is
  persisted; partial or interrupted assistant output is never persisted.
- Conversation rename is manual only through authenticated owner-scoped `PATCH /api/v1/conversations/:conversationId` with current `chat:send`, trusted `{ orgId, userId, conversationId }`, and strict trimmed `title` of 1–120 characters. Foreign scope returns generic `404`.
- Prompt-derived and LLM-generated conversation titles are prohibited.
- Attachments are deferred from the current MVP. No upload endpoint, multipart contract, paperclip/upload UI, storage reference, or provider attachment forwarding is approved.
- Future attachment work must first define storage, MIME/size allowlists, malware scanning, tenant ownership, provider capability, retention, and deletion.
- The P5-06 budget prerequisite was explicitly pulled forward because policy evaluation must never assume that usage is zero or that budget is available.
- Minimal `RequestLog` records are tenant-scoped, append-only provider-usage records containing trusted request, organisation, and user IDs plus canonical provider/model metadata. Token fields are persisted only as a complete known input/output/total set.
- RequestLog persistence contains no prompt, response, PII value, credential, secret, pricing, or cost field. All persisted identifiers and usage fields are immutable, and normal update/delete operations are rejected.
- The current UTC-month BillingRollup is deterministically reconciled from persisted tenant-scoped RequestLog records before BudgetStatus is returned; Redis is never used as the budget source of truth.
- Persisted unknown provider usage remains immutable and never becomes zero. Budget reads apply a separate conservative liability equal to the approved provider/model maximum input plus output capability; actual `usedTokens` remains provider-reported only. Unsupported historical provider/model contracts still fail closed with `BUDGET_ACCOUNTING_UNAVAILABLE`.
- Budget status reads the current `Organisation.monthlyTokenBudget` and uses the approved boundary `usedTokens >= monthlyTokenBudget`; therefore a zero-token budget is exhausted even when persisted usage is zero.
- The synchronous reconciliation is intentionally minimal. Full idempotent workers, replay protection, user/provider rollups, pricing, invoices, alerts, and generalized billing infrastructure remain Phase 7 work.
- Phase 7 queue payloads use `requestId` as the canonical correlation ID and contain only allowlisted identifiers, optional complete provider-reported usage, optional approved cost, job type, schema version, and timestamp.
- Phase 7 request outcome events use an explicit discriminated contract. `request.completed` carries `COMPLETED`, `FAILED`, or `INTERRUPTED` with `ALLOW` or `ALLOW_WITH_MASK`; analytics-only `request.blocked` carries `BLOCKED` with `BLOCK` and forbids provider/model/usage/cost fields.
- RequestLog append happens before request outcome publication. Workers never infer status from missing usage and never mutate the append-only record.
- Unknown provider usage is terminal for that event and remains unknown; unavailable pricing omits cost. Neither value is synthesized as zero.
- Async billing idempotency uses a separate tenant-scoped `{ orgId, requestId, jobType }` ledger with `PROCESSING` and `COMPLETED` states. Append-only `RequestLog` records are never mutated by workers.
- The current organisation-month `{ usedTokens, sourceRequestCount }` rollup remains the authoritative budget projection and is deterministically recomputed from `RequestLog`. Richer user/provider/cost rollups are separate future reporting projections.
- Phase 7 retries are bounded to three exponential-backoff attempts for transient dependency failures. Invalid payloads, missing trusted scope, unknown usage, and unavailable pricing are terminal; exhausted jobs remain in BullMQ's failed set as the MVP dead-letter mechanism.
- P7-08 email jobs are triggered only by `alert.created` and carry trusted IDs,
  safe metadata, and one allowlisted template identifier. Recipient email,
  rendered subject/body, prompt, response, detected PII, credentials, secrets,
  and arbitrary content are prohibited from queue payloads.
- Email recipients are `ORG_ADMIN` users resolved through tenant-scoped storage
  using trusted `orgId`. Clients cannot provide or override recipients.
- Email delivery idempotency is `{ orgId, alertId, templateId }`. The existing
  bounded three-attempt exponential-backoff and BullMQ failed-set visibility
  contracts apply.
- Only alert creation may trigger email. Reminders, escalations, and resolution
  emails are deferred.
- The email provider, credential/config names, sender identity, timeout,
  provider-specific error mapping, exact template allowlist, and rendered
  template content remain unresolved. No delivery provider is selected, and
  email worker implementation must not begin until these items are explicitly
  approved.
- Phase 7 explicitly waives email delivery implementation. The safe
  `alert.created`/`ORG_ADMIN` contract remains approved, but provider-backed
  delivery remains deferred after Phase 8 until provider, configuration,
  sender, error mapping, template IDs, and rendered template content are
  approved.
- P7-09 provider health uses `provider.health_check` every 60 seconds for only
  approved enabled-provider registry IDs. Redis stores `HEALTHY`, `UNHEALTHY`,
  or `UNKNOWN` plus `checkedAt` at `health:{providerId}` for 120 seconds.
- Provider health is Redis-only in Phase 7. MongoDB history and incident
  timelines move to Phase 10 observability.
- Routing may skip only `UNHEALTHY`. `HEALTHY`, `UNKNOWN`, missing, expired, and
  Redis-error states preserve existing capability, circuit-breaker, retry, and
  ordered-fallback behavior; no new routing score is introduced.
- Provider-adapter health maps as `healthy -> HEALTHY`,
  `degraded -> UNKNOWN`, and `unhealthy -> UNHEALTHY`. Transient degradation is
  observable but does not block normal routing.
- Failed billing/analytics enqueue recovery uses append-only RequestLog as the
  source plus a separate unique
  `{ orgId, requestId, queueName, jobType }` recovery ledger. It stores only
  coordination state, bounded attempt count, and safe timestamps.
- The recovery scan runs at worker startup and every 60 seconds, enumerates
  trusted organisations, and includes `orgId` in every tenant-owned scan. It
  uses deterministic queue IDs and existing worker ledgers to prevent duplicate
  effects.
- Recovery stops after three failed publication attempts or a terminal BullMQ
  failed job. RequestLog is never mutated, and prompts, responses, PII,
  recipient data, credentials, provider payloads, and secrets are prohibited.
- BullMQ's failed set plus safe structured logs are the Phase 7 failure-
  visibility source. Bull Board and manual replay UI move to Phase 10 controlled
  observability tooling and must never be public.
- Alert listing is Phase 8 admin work; audited resolution and reopening are
  Phase 9 work.
- BullMQ producers reuse the shared fail-fast Redis client. Managed workers obtain dedicated clients through the same central Redis factory with `maxRetriesPerRequest: null`; Redis connection configuration is not duplicated.
- The initial `billing-queue` validates `request.completed` payloads before enqueue and uses three exponential-backoff attempts, 100 completed-job retention, and 500 failed-job retention.
- Runtime validation is repeated at the worker boundary. Malformed payloads become terminal `UnrecoverableError` failures without logging job data or validation input.
- P7-07 uses only the TDD daily anomaly rule: current UTC-day user known tokens
  must be greater than twice the average of qualifying active days in the
  previous seven UTC days.
- An anomaly baseline includes only prior days with fully known token usage.
  Unknown-usage days are excluded and never treated as zero; fewer than three
  prior active days produces no anomaly decision.
- Anomaly detection requires trusted
  `Organisation.featureFlags.anomalyDetection === true`. Analytics
  `usage.updated` is the only approved detection source; request-level,
  request-volume, blocked-rate, and provider-error anomaly signals are excluded.
- A detected anomaly is `HIGH` and starts `OPEN`. Only one unresolved
  `{ orgId, userId, observedDay, ANOMALY }` alert may exist; duplicate, retried,
  and re-evaluation paths update or resolve the same record without duplicates.
- P7-07 does not enqueue email or notification work. Anomaly records and jobs
  contain safe aggregate metadata only and never prompt, response, PII, or
  secrets.
- Analytics publishes one strict `usage.updated` event only after the trusted
  tenant/user daily aggregate is persisted. The event contains only
  `schemaVersion`, `jobType`, `requestId`, `orgId`, `userId`, `observedDay`, and
  `occurredAt`.
- Anomaly queue IDs are deterministic opaque SHA-256 values scoped by trusted
  organisation, user, and request identifiers; raw identifiers do not appear
  in Redis job IDs.
- P7-07 reuses the shared BullMQ connection, bounded retry, managed lifecycle,
  and heartbeat. It does not create another Redis connection or idempotency
  ledger.
- Detection queries trusted organisation state and tenant/user-scoped analytics
  projections. Integer-safe comparison enforces current tokens strictly greater
  than twice the qualifying baseline average without floating-point drift.
- Alert creation uses an atomic unique `{ orgId, userId, observedDay, type }`
  upsert. Duplicate and concurrent events produce one `HIGH`/`OPEN` alert with
  safe aggregate metadata; billing records and rollups remain untouched.
- BullMQ custom IDs use `billing-request-completed-{requestId}` because `:` is not permitted in custom BullMQ job IDs.
- Completed chat accounting now persists the append-only RequestLog before publishing exactly one validated `request.completed` billing job.
- Billing jobs carry canonical `requestId`, trusted tenant identifiers, provider/model, and only complete known usage; pricing remains unavailable, so `estimatedCostMicros` is omitted.
- Queue publication failure after RequestLog persistence emits safe operational metadata, leaves the authoritative record unchanged for later recovery, and does not reverse the completed provider response.
- Billing worker idempotency uses durable MongoDB `PROCESSING` and `COMPLETED` ledger states with a unique trusted `{ orgId, requestId, jobType }` scope.
- Duplicate completed or concurrent processing jobs skip billing side effects. Transient failures release the processing claim for BullMQ's bounded retry; retry attempts may safely rerun deterministic reconciliation.
- BillingRollup is recomputed from tenant-scoped append-only RequestLog records and written with `$set`; RequestLog is never mutated and unknown usage completes as `USAGE_UNAVAILABLE` without a zero rollup.
- The billing worker starts only after both MongoDB and Redis are connected and is closed through the existing managed BullMQ shutdown boundary.
- Chat finalization no longer performs duplicate synchronous rollup reconciliation after queue publication; the worker owns asynchronous reconciliation, while every later budget check still derives authoritative status directly from RequestLog.
- P7-02 adds no billing, analytics, anomaly, email, or provider-health business worker and does not change the chat request path.
- `POST /api/v1/chat/stream` requires current authentication plus `chat:send`, strictly validates the body, and verifies Conversation ownership with trusted `orgId`, `userId`, and `conversationId` before any Redis or provider work.
- P5-06 processing order is ownership, minimal tenant/user idempotency, both plan-selected Redis rate limits, authoritative persisted budget status, PII/classification/risk, policy, then provider routing and streaming.
- Chat idempotency and rate-limit Redis keys use domain-separated HMAC-SHA-256 digests of trusted identifiers. No prompt, email, raw identifier, token, or secret enters a key or log.
- Canonical per-minute limits are FREE `10/60`, PRO `30/300`, and ENTERPRISE `60/1200` for user/organisation respectively. All six values are required validated environment settings with no hidden defaults.
- P5-06 idempotency was generalized and concurrency-proven in Phase 6. Completed-response replay, response storage, and durable post-provider crash recovery are deferred to Phase 9 prerequisites.
- `BLOCK` completes before SSE headers with JSON `403 POLICY_BLOCKED` and zero provider calls. `ALLOW_WITH_MASK` constructs the provider request only from `decision.providerPrompt`; the original sensitive prompt is absent from provider, policy-event, and SSE metadata paths.
- OpenAPI event names are canonical: `request_started`, `policy`, `routing`, `fallback`, `token`, `done`, and `error`. The initial production candidate chain contains only configured Groq while retaining retry/circuit/fallback abstractions.
- Provider streaming starts before SSE commitment so pre-token provider exhaustion can still return a safe JSON error. After the first token, failures emit terminal `error` and never splice another provider response.
- Client disconnect aborts the provider signal, stops SSE writes, and finalizes safe accounting/idempotency state without logging request bodies, prompts, headers, cookies, SDK payloads, or raw provider errors.
- Known provider token usage is appended to RequestLog and immediately reconciles BillingRollup. Missing provider usage is persisted as unknown, never converted to zero, and makes the next budget check fail closed.
- Stream usage is optional in the canonical done chunk because the provider may not report it; pricing and `estimatedCostUsd` remain absent because pricing is not approved.
- The frontend uses Next.js 16 App Router, strict TypeScript, and Tailwind CSS v4 through the official `@tailwindcss/postcss` setup. No legacy Tailwind configuration file is required, and all CSS Modules were removed after equivalent utility migration.
- Frontend routes remain composition-only. Authentication, conversations, chat, and policy state live in feature modules; API, environment, error, and SSE boundaries live under `src/lib`.
- The access token remains in React memory only. The backend-owned HttpOnly refresh cookie is used with credentialed requests; no token, cookie, provider key, policy logic, billing logic, database state, or filesystem session state is persisted by the frontend.
- Direct browser-to-backend requests use validated `NEXT_PUBLIC_API_BASE_URL`; backend authentication, tenant scope, permissions, policy, provider routing, and accounting remain authoritative.
- Tailwind theme tokens preserve the approved true-white, dark-text, ProxyAi-green visual system. Desktop uses conversation/chat/policy columns; mobile uses mutually exclusive off-canvas conversation and policy drawers.
- React Strict Mode aborts are treated as expected cleanup so cancelled development-effect requests cannot show false errors or redirect valid owned Conversation reads.
- The policy inspector consumes only safe SSE metadata and presents ALLOW, ALLOW_WITH_MASK, BLOCK, risk score, category names, masking, routing, fallback, provider, model, latency, and token usage without raw prompt or response data.
- The public `/` route is a statically rendered marketing page composed from `features/marketing`; `/login` and `/chat` remain the unchanged authenticated product entry points.
- The landing page uses the supplied 2026-08-18 visual reference as its primary design specification: true white surfaces, dark typography, restrained ProxiAI green, thin borders, soft shadows, product-flow visuals, and responsive mobile composition.
- Marketing claims remain limited to capabilities already implemented or explicitly architectural; no fake customer logos, compliance certifications, provider pricing, or future-product promises are presented.
- The landing hero uses `Secure. Governed. Observable.` instead of an unsupported direct compliance claim; reference certification badges remain replaced by implementation-backed trust markers.
- `npm run dev:seed-admin` is a development-only local bootstrap for the fixed `proxiai-demo` organisation and `admin@proxiai.local` organisation administrator; it refuses every non-development environment.
- The dev administrator password comes only from validated `DEV_ADMIN_PASSWORD`, is hashed through the approved Argon2id helper, and is printed only to the invoking development terminal as explicitly required. Password hashes, tokens, database credentials, and provider keys are never printed.
- Re-running local admin provisioning uses scoped `{ orgId, emailNormalized }` lookup, preserves one organisation and one user, and reconciles active state, `ORG_ADMIN`, and the canonical permission allowlist without bypassing Mongoose validation.
- Local admin provisioning does not add registration routes, registration UI, authentication changes, or production bootstrap behavior.

## Latest Task Record

- **Task:** P6-05 — Phase 6 Closure and Deferred Gates
- **Status:** Completed; documentation only
- **Files changed:** `docs/01_PRD.md`, `docs/02_SDD.md`, `docs/03_TDD.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Proven idempotency gates:** Trusted tenant/user isolation, atomic `SET NX` reservation, opaque request fingerprint protection, fail-closed Redis behavior, `PROCESSING=300s`, and `COMPLETED=3600s`.
- **Terminal behavior:** Completed requests remain non-replayable tombstones. Matching completed requests and fingerprint mismatches return safe `409 DUPLICATE_REQUEST`; no response body is stored or replayed in Phase 6.
- **Deferred gates:** Prompt-cache implementation, safe response replay, cache-hit accounting/storage, and durable post-provider crash recovery require Phase 9 encrypted payload or access-checked safe-reference prerequisites.
- **Accepted limitation:** A process crash after provider execution may have started can be followed by `PROCESSING` expiry and a later duplicate paid call. Phase 6 does not claim zero duplicate paid calls as fully proven and adds no unsafe automatic reconciliation.
- **Verification:** Documentation consistency scans and `git diff --check` passed; no production code changed.
- **Commit:** `docs(progress): close Phase 6 with deferred cache and recovery gates`.
- **Next at closure:** Phase 7 planning, later superseded by the completed P7-01 async job contract resolution.

- **Task:** P6-04 — Idempotency Failure/Recovery Hardening
- **Status:** Completed
- **Files changed:** `backend/src/shared/idempotency/idempotency.service.ts`, `backend/src/features/chat/chat.service.ts`, `backend/tests/idempotency.test.mjs`, `backend/tests/chat.stream.test.mjs`, `docs/03_TDD.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Lifecycle guard:** Reservations now mark the provider-execution boundary before the first provider iterator attempt. `releaseBeforeExecution` returns fail-closed `503 IDEMPOTENCY_UNAVAILABLE` after that marker and cannot delete the Redis coordination record accidentally.
- **Post-provider failure:** Usage persistence and reconciliation remain authoritative, but their failure now still triggers a `finally` attempt to write the matching `COMPLETED` tombstone. Operational/accounting errors continue to propagate safely.
- **Expiry recovery:** An expired pre-provider `PROCESSING` key can be atomically reserved again with the same trusted scope and fingerprint. Completed tombstones remain non-replayable, fingerprint mismatch remains `409`, and Redis failure remains `503` with no local fallback.
- **Known limitation:** A process crash after provider execution may have started can still outlive the 300-second `PROCESSING` TTL and permit a later retry. No durable provider reconciliation, response replay, prompt cache, TTL change, or Phase 9 storage was added.
- **Tests and verification:** Four focused idempotency tests and four existing chat regression tests passed (8/8). Typecheck, build, diff check, and sensitive key/log scans passed.
- **Commit:** `feat(idempotency): harden failure recovery semantics`.
- **Next:** Await exact P6-05 scope approval; do not start automatically.

- **Task:** P6-03 — Completed Idempotency Tombstone and Request Fingerprint
- **Status:** Completed
- **Files changed:** Approved idempotency contract documents, `backend/src/shared/idempotency/idempotency.service.ts`, `backend/src/features/chat/chat.service.ts`, `backend/tests/idempotency.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Terminal state:** `COMPLETED` stores only status, server `requestId`, opaque `requestFingerprint`, and `completedAt`. It is a non-replayable tombstone; every completed duplicate returns safe `409 DUPLICATE_REQUEST`.
- **Fingerprint:** A domain-separated HMAC of exact prompt bytes is combined with conversation ID, routing mode, provider selection or null, and a version marker, then HMACed again. Redis stores only the final 64-character opaque digest; prompt, PII, response, usage, status body, token, and secret values are absent.
- **Mismatch behavior:** An existing `PROCESSING` or `COMPLETED` record with another fingerprint returns `409 DUPLICATE_REQUEST` without identifying which field changed. Matching `PROCESSING` remains `409 REQUEST_IN_PROGRESS`.
- **Recovery limitation:** Safe pre-provider failures still release the matching reservation. If the process crashes after provider execution may have started, `PROCESSING` can expire after 300 seconds and permit a later retry; no unsafe automatic reconciliation was introduced.
- **Deferred:** Response storage/replay, durable crash recovery, prompt cache, and Phase 9 encryption/reference storage remain out of P6-03.
- **Tests and verification:** Four focused real-Redis idempotency tests passed, including concurrent single-winner behavior, opaque fingerprint mismatch rejection, tenant/user isolation, safe release, and fail-closed Redis failure. `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Commits:** `docs(idempotency): define completed request semantics`; `feat(idempotency): add request fingerprint protection`.
- **Next:** Await exact P6-04 scope approval; do not start automatically.

- **Task:** P6-02 — Secure Prompt Cache Contract
- **Status:** Contract resolved; production implementation intentionally deferred
- **Files changed:** `docs/02_SDD.md`, `docs/03_TDD.md`, `docs/04_DATABASE_DESIGN.md`, `docs/05_OPENAPI_SPEC.md`, `docs/06_SECURITY_THREAT_MODEL.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Eligibility:** Only `ALLOW` with risk score `0`, zero detected sensitive spans, and response-content-compatible retention may be cached. `ALLOW_WITH_MASK`, `BLOCK`, masked prompts, and `METADATA_ONLY` response-content caching are prohibited.
- **Scope and key:** Cache reuse is trusted-`orgId` scoped and organisation-wide only without user-specific context. The opaque HMAC input binds trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and policy/config fingerprint. Whitespace and casing are not normalized without a future approved contract.
- **Storage:** Plaintext assistant responses in Redis are prohibited. The Phase
  9 Message store is not a cache/replay value contract; prompt cache remains
  deferred pending dedicated encrypted/reference storage, fingerprint, and
  accounting semantics.
- **TTL and failure:** `PROMPT_CACHE_TTL_SECONDS=3600` becomes required with no hidden default when cache implementation is enabled. Cache reads/writes fail open; idempotency remains separate and fail closed.
- **Future SSE behavior:** A hit uses `request_started` → `policy` → `routing` with `routingReason=cache` → `token*` → `done` with `cacheHit=true`; no new `cache_hit` event exists and provider execution is skipped.
- **Accounting:** True hits have zero provider usage and synthetic usage is forbidden. Current `RequestLog` semantics cannot safely represent non-billable cache delivery, so accounting must be resolved before implementation.
- **Deferred prerequisites:** Encrypted/safe-reference response storage, deterministic policy/config fingerprinting, cache-hit accounting representation, and final provider/model metadata semantics.
- **Verification:** Stale-contract and canonical-contract scans passed across `docs/` and `PROJECT_MEMORY.md`; `git diff --check` passed with documentation-only changes.
- **Scope:** Documentation only; no production, Redis, auth, chat, provider, or environment behavior changed.
- **Next:** Run a Phase 6 closure review; do not implement prompt caching or start another Phase 6 implementation task without approval.

- **Task:** P6-01 — Generalize Tenant-Scoped Idempotency Reservations
- **Status:** Completed
- **Files changed:** `backend/src/shared/idempotency/idempotency.service.ts`, chat idempotency wiring, environment configuration/example, four focused tests, and the approved Redis/API/progress documents.
- **Key contract:** Redis keys preserve the P5-06-compatible `chat:idempotency:` namespace and contain only an HMAC-SHA-256 digest over trusted `orgId`, `userId`, and `clientRequestId`. Raw identifiers, prompts, responses, PII, email, and secrets are absent from keys, values, and logs.
- **State contract:** Safe JSON records contain only `PROCESSING` or `COMPLETED`, server `requestId`, and the relevant timestamp. Completed-response replay is not implemented.
- **TTL contract:** Required validated `IDEMPOTENCY_PROCESSING_TTL_SECONDS=300` and `IDEMPOTENCY_COMPLETED_TTL_SECONDS=3600` have no defaults and reject drift from the approved values.
- **Failure contract:** Redis coordination failures return safe `503 IDEMPOTENCY_UNAVAILABLE`. Pre-provider failures release only the matching processing reservation; once provider execution may have started, chat finalization marks the reservation completed instead of enabling a blind retry.
- **Concurrency and isolation:** A real Redis test launched ten concurrent reservations for one trusted scope; exactly one reservation/provider-call winner succeeded and nine returned `REQUEST_IN_PROGRESS`. The same client request ID under another trusted user or organisation did not collide.
- **Verification:** Four focused idempotency tests and four existing chat-stream tests passed. The complete backend suite passed 164/164; typecheck, build, diff check, obsolete-code scan, and sensitive Redis/log key scans passed.
- **Deferred:** Prompt cache, plaintext/encrypted response storage, metadata-only cache eligibility, completed-response replay, and anonymous landing refresh behavior remain outside P6-01.
- **Next task:** P6-02 — Prompt Cache Contract Resolution. Do not start without approval.

- **Task:** P5-07 addendum — Landing Page Visual and Regression QA
- **Status:** Completed
- **Files changed:** `frontend/src/features/marketing/components/hero-section.tsx`, `design-qa.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Visual verification:** Production desktop `1536x1024` and mobile `390x844` captures were compared with the supplied reference; no P0, P1, or P2 visual issues remain. Mobile navigation and every workspace CTA target `/login`.
- **Authenticated regression:** The provisioned development admin authenticated, created an owned Conversation, received one real Groq SSE response, and displayed ALLOW policy, provider, model, latency, and known token metadata. Exactly one chat-stream request was observed.
- **Claims:** Replaced the unsupported direct `Compliant` tagline with `Governed`; no registration route, fake certification badge, auth architecture change, backend behavior change, or Phase 6 scope was added.
- **Verification:** Frontend tests passed 7/7 in a deterministic single-worker run; typecheck, lint, production build, mobile navigation, diff check, and source/security scans passed. The first default parallel Vitest run hung without an assertion failure and was replaced by the passing single-worker verification.
- **Known observation:** Anonymous landing bootstrap still produces the pre-existing `/api/v1/auth/refresh` 401 in browser DevTools; preserving auth behavior was required, and the landing experience remains functional.
- **Next task:** Await explicit approval before Phase 6 — Redis Cache and Idempotency. Do not start P5-08 or Phase 6 automatically.

- **Task:** P5-07 addendum — Local Development Admin Provisioning
- **Status:** Completed
- **Files changed:** `backend/package.json`, `backend/.env.example`, `backend/src/scripts/seed-dev-admin.ts`, `docs/09_README.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Implementation:** Adds `npm run dev:seed-admin`, validates development-only seed input, uses the shared Mongo lifecycle, existing Organisation/User models, canonical permissions, and approved Argon2id password helper, and prints only the requested local login fields.
- **Idempotency:** Two consecutive runs against a fresh isolated database produced exactly one `proxiai-demo` organisation and one scoped `admin@proxiai.local` user; the configured password continued to verify.
- **Safety:** `NODE_ENV=production` refusal passed before any database import/connection. No password hash, JWT/refresh token, database credential, provider key, registration route, or auth architecture change was introduced.
- **Browser verification:** Printed credentials authenticated through the existing `/login`; the workspace, Conversation navigation/creation, chat composer, and policy panel rendered against isolated ports `3001`/`8081` without disturbing the developer's existing `3000`/`8080` services.
- **Verification:** `npm test` passed 160/160; `npm run typecheck`, `npm run build`, production refusal, duplicate-run idempotency, and end-to-end seeded login passed.
- **Next task:** Await explicit approval before Phase 6 — Redis Cache and Idempotency. Registration remains out of scope.

- **Task:** P5-07 addendum — Public Landing Page
- **Status:** Completed
- **Files changed:** `frontend/src/app/page.tsx`, `frontend/src/app/globals.css`, `frontend/src/features/marketing`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Implementation:** Replaces the root login redirect with a static public landing route, adds reference-led header, hero, proxy flow, trust, feature, workflow, enterprise, CTA, and footer sections, and keeps every workspace CTA wired to `/login`.
- **Styling and motion:** Uses Tailwind CSS v4 utilities and existing theme foundations; code-native visuals and CSS-only reduced-motion-safe reveals add no browser state, image-generation dependency, or provider logic.
- **Focused tests:** Three tests cover the core product story and login CTAs, section-anchor navigation, and preservation of the existing login route composition.
- **Visual verification:** Playwright with installed Chrome compared full-page desktop `1536x1024` and mobile `390x844` captures against the supplied reference; spacing, separator contrast, central mark treatment, and mobile stacking were corrected during QA.
- **Security and scope:** No backend behavior, authentication contract, provider secret, policy/billing logic, fake compliance claim, Phase 6 feature, environment file, or temporary QA asset was added.
- **Next task:** Await explicit approval before Phase 6 — Redis Cache and Idempotency. Do not start P5-08 or Phase 6 automatically.

- **Task:** P5-07 — Login and Chat Frontend
- **Status:** Completed
- **Files changed:** Frontend package/config foundation; `frontend/src/app`; shared layout and UI primitives; auth, conversation, chat, and policy feature modules; API/error/environment/SSE libraries; four focused tests; `docs/15_PHASE.md`; and `PROJECT_MEMORY.md`.
- **Architecture:** Adds a stateless Next.js App Router frontend with feature-owned interactive state, direct credentialed backend integration, in-memory access-token handling, scoped Conversation workflows, streaming SSE chat, and a safe policy/risk inspector.
- **Styling:** Uses Tailwind CSS v4 as the primary styling system with theme tokens and base rules in `globals.css`; no `*.module.css`, inline style object, or unnecessary legacy Tailwind config remains.
- **Focused tests:** Four tests cover password-space-preserving login normalization, approved API error-envelope parsing, split SSE frame preservation, and ordered multi-chunk SSE parsing.
- **Browser verification:** Playwright fallback verified generic login, authenticated login, owned Conversation list/read, Conversation creation, one live Groq SSE completion, one chat-stream request, desktop at `1536x1024`, mobile at `390x844`, and both responsive drawers. The in-app browser backend was unavailable.
- **QA fixes:** Strict Mode request aborts no longer produce false Conversation errors/redirects; mobile panel transforms are mutually exclusive; favicon metadata uses the approved ProxyAi asset; safe fallback status is presented.
- **Security:** Frontend source/diff scans found no provider key, cookie, token, secret, console logging, CSS Module, or environment-file staging. The live prompt appeared only in the intended browser conversation UI and was absent from application source and console output.
- **Scope:** No backend behavior, provider policy, billing logic, admin/audit/usage page, server-side session store, P5-08, or Phase 6 work was added.
- **Next task:** Await explicit approval before Phase 6 — Redis Cache and Idempotency. Do not start P5-08 or Phase 6 automatically.

- **Task:** P5-06 live Groq model configuration correction and authenticated smoke verification
- **Status:** Completed
- **Files changed:** `backend/.env.example`, `backend/tests/helpers/test-env.mjs`, `backend/tests/groq-provider.adapter.test.mjs`, and `PROJECT_MEMORY.md`; ignored local `backend/.env` was aligned separately.
- **Model:** Replaced the unavailable `llama-3.1-8b-instant` active configuration with canonical `openai/gpt-oss-20b` while preserving explicit env-controlled registry and adapter selection.
- **Live smoke:** An authenticated owner received ordered `request_started`, `policy`, `routing`, `token`, and `done` SSE events with real streamed content from Groq. Reusing the same client request ID returned `409 DUPLICATE_REQUEST` without another accounting record.
- **Accounting:** Groq supplied known input/output/total usage; the tenant RequestLog persisted the exact values and BillingRollup reconciled them. The intentionally aborted second stream persisted unknown usage rather than inventing token counts.
- **Disconnect and safety:** In-flight client disconnect aborted the request, finalized safe accounting, and left liveness healthy. Exact prompt, PII sentinel, and API-key scans found no leak in captured logs, tracked source, or diff; pricing remains undefined.
- **Verification:** Focused Groq adapter tests passed 4/4; `npm run typecheck`, `npm run build`, live authenticated smoke, and `git diff --check` passed.
- **Scope:** No adapter hardcoding, policy/chat behavior, pricing, routing, retry, fallback, circuit-breaker, or P5-07 behavior changed.
- **Next task:** P5-07 — Login and Chat Frontend. Do not start without approval.

- **Task:** P5-06 — Authenticated Chat Stream
- **Status:** Completed
- **Files changed:** `backend/src/app.ts`, `backend/src/config/env.ts`, `backend/.env.example`, `backend/src/features/chat/chat.schema.ts`, `backend/src/features/chat/chat-control.service.ts`, `backend/src/features/chat/chat.repository.ts`, `backend/src/features/chat/chat.service.ts`, `backend/src/features/chat/chat.sse.ts`, `backend/src/features/chat/chat.controller.ts`, `backend/src/features/chat/chat.routes.ts`, `backend/src/features/providers/provider.types.ts`, `backend/src/features/providers/groq-provider.adapter.ts`, `backend/tests/chat.stream.test.mjs`, `backend/tests/helpers/test-env.mjs`, `backend/tests/policy-events.test.mjs`, `backend/tests/provider-fallback.test.mjs`, `docs/03_TDD.md`, `docs/05_OPENAPI_SPEC.md`, `docs/09_README.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Flow:** Adds authenticated `chat:send` POST streaming with scoped ownership, opaque Redis idempotency, dual plan-aware rate limiting, authoritative budget checks, immutable PII processing, deterministic policy, one-candidate Groq fallback stack, SSE, disconnect abort, and usage accounting.
- **Phase 4 gates:** Focused HTTP tests prove BLOCK performs zero provider calls and MASK sends only `[EMAIL_REDACTED]` while the raw email sentinel is absent from captured provider requests, policy events, and SSE output.
- **Focused tests:** Four tests cover BLOCK, masked-only provider input, ALLOW streaming with known usage persistence, foreign ownership denial, budget fail-closed behavior, and pre-PII execution order.
- **Verification:** `npm test` passed 160/160; focused chat tests passed 4/4; billing integration passed 4/4; `npm run typecheck`, `npm run build`, `git diff --check`, and sensitive/provider scans passed.
- **Scope:** No second production provider, prompt cache, replay framework, message persistence, encryption, pricing, billing worker, frontend, or P5-07 work was added.
- **Next task:** P5-07 — Login and Chat Frontend. Do not start without approval.

- **Task:** P5-06 prerequisite — Minimal Authoritative Token Accounting
- **Status:** Completed; P5-06 chat endpoint not started
- **Files changed:** `backend/src/features/billing/billing.types.ts`, `backend/src/features/billing/request-log.model.ts`, `backend/src/features/billing/billing-rollup.model.ts`, `backend/src/features/billing/billing.repository.ts`, `backend/src/features/billing/billing.service.ts`, `backend/tests/billing.accounting.integration.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Accounting:** Adds append-only tenant RequestLog usage records, organisation-month BillingRollup reconciliation, UTC period boundaries, and deterministic BudgetStatus from current organisation budget plus persisted known usage.
- **Fail closed:** Missing organisation accounting, database failures, unsupported unresolved provider/model contracts, or required rollup persistence failures return safe `503 BUDGET_ACCOUNTING_UNAVAILABLE`; Redis and invented zero usage are never accepted. Supported unresolved records use a separate conservative capability reservation rather than synthetic actual usage.
- **Focused tests:** Four real-Mongo tests cover persisted usage status, exact exhausted boundary, tenant isolation, and unknown usage fail-closed behavior.
- **Verification:** `node --test tests/billing.accounting.integration.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No chat route, provider call, idempotency, Redis rate limit, billing worker, pricing, invoice, alert, or Phase 7 expansion was added.
- **Next task:** P5-06 — Authenticated Chat Stream. Do not resume without approval.

- **Task:** P5-05 — Conversation Messages API
- **Status:** Completed
- **Files changed:** `backend/src/features/conversations/conversation.routes.ts`, `backend/src/features/messages/message.types.ts`, `backend/src/features/messages/message.cursor.ts`, `backend/src/features/messages/message.schema.ts`, `backend/src/features/messages/message.repository.ts`, `backend/src/features/messages/message.service.ts`, `backend/src/features/messages/message.controller.ts`, `backend/tests/message.query.integration.mjs`, `docs/05_OPENAPI_SPEC.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Flow:** Authenticates, checks `chat:view_own`, verifies trusted Conversation ownership, runs an `orgId`-scoped Message query, and returns stable chronological cursor pages through the standard envelope.
- **Safety:** The repository explicitly selects safe metadata fields, maps persistence roles to lowercase API values, sets `contentAvailable: false`, and never returns encrypted content or encryption metadata.
- **Focused tests:** Four real-Mongo HTTP tests cover safe owner summaries, foreign organisation/user generic `404`, cross-conversation and cross-tenant isolation, and stable chronological cursor pagination.
- **Verification:** `node --test tests/message.query.integration.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No Message creation, content decryption, provider/chat integration, or P5-06 work was added.
- **Next task:** P5-06 — Authenticated Chat Stream. Do not start without approval.

- **Task:** P5-04 — List and Read Conversation APIs
- **Status:** Completed
- **Files changed:** `backend/src/features/conversations/conversation.types.ts`, `backend/src/features/conversations/conversation.cursor.ts`, `backend/src/features/conversations/conversation.schema.ts`, `backend/src/features/conversations/conversation.repository.ts`, `backend/src/features/conversations/conversation.service.ts`, `backend/src/features/conversations/conversation.controller.ts`, `backend/src/features/conversations/conversation.routes.ts`, `backend/tests/conversation.query.integration.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Flow:** Adds authenticated `chat:view_own` list/read routes, trusted owner-scoped Mongo queries, safe summaries, generic scoped 404 behavior, and validated cursor pagination.
- **Tenant gate:** Real MongoDB tests prove an authenticated user cannot list or read another organisation's or another user's Conversations using their public IDs.
- **Focused tests:** Four tests cover owned-only listing, own-record reading, foreign org/user generic 404, and stable non-overlapping cursor pages.
- **Verification:** `node --test tests/conversation.query.integration.mjs` passed 4/4 against dedicated MongoDB; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No Message-list endpoint, update/delete operation, chat/provider integration, or P5-05 work was added.
- **Next task:** P5-05 — Conversation Messages API. Do not start without approval.

- **Task:** P5-03 — Create Conversation API
- **Status:** Completed
- **Files changed:** `backend/src/app.ts`, `backend/src/features/conversations/conversation.types.ts`, `backend/src/features/conversations/conversation.model.ts`, `backend/src/features/conversations/conversation.schema.ts`, `backend/src/features/conversations/conversation.repository.ts`, `backend/src/features/conversations/conversation.service.ts`, `backend/src/features/conversations/conversation.controller.ts`, `backend/src/features/conversations/conversation.routes.ts`, `backend/tests/conversation.create.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Flow:** Authenticates, checks `chat:send`, strictly validates optional title, derives ownership from trusted auth context, creates through service/repository boundaries, and returns the approved `201` envelope.
- **Security:** Client tenant/user selectors are rejected, persistence receives trusted ownership only, and the response omits `orgId`, `userId`, `_id`, and internal model fields.
- **Focused tests:** Four HTTP tests cover valid trusted-owner creation, client ownership-field rejection with zero writes, default title, and missing auth context.
- **Verification:** `node --test tests/conversation.create.test.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No Message creation, provider/chat call, list/read route, cursor pagination, or P5-04 work was added.
- **Next task:** P5-04 — List and Read Conversation APIs. Do not start without approval.

- **Task:** P5-02 — Message Model
- **Status:** Completed
- **Files changed:** `backend/src/features/messages/message.types.ts`, `backend/src/features/messages/message.model.ts`, `backend/tests/message.model.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Model:** Adds strict tenant-owned Message metadata with immutable UUIDs, approved uppercase roles, encrypted-only optional content, storage-state consistency, optional token count, and created-at-only timestamps.
- **Safety:** Plaintext `content` is rejected, unknown encrypted fields fail, and `contentEnc` is excluded from normal queries and object/JSON serialization.
- **Indexes:** Declares only the approved unique message ID and tenant-conversation chronological indexes.
- **Focused tests:** Four tests cover valid metadata/encrypted messages, immutable UUID ownership, role/token validation, strict plaintext/nested-field rejection, timestamp shape, collection, and indexes.
- **Verification:** `node --test tests/message.model.test.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No routes, controllers, provider/chat integration, raw content, encryption service, request/provider metadata, TTL, or P5-03 work was added.
- **Next task:** P5-03 — Create Conversation API. Do not start without approval.

- **Task:** P5-01 — Conversation Model
- **Status:** Completed
- **Files changed:** `backend/src/features/conversations/conversation.types.ts`, `backend/src/features/conversations/conversation.model.ts`, `backend/tests/conversation.model.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Model:** Adds strict `conversations` schema with immutable tenant/owner/public UUIDs, generic title default, safe-integer message count, nullable last-message timestamp, and Mongoose timestamps.
- **Indexes:** Declares only unique public-ID and tenant-owner activity-list indexes approved for P5-01.
- **Focused tests:** Four tests cover valid defaults, immutable/required UUID identifiers, title/message-count constraints, strict unknown-field rejection, timestamps, collection, and index declarations.
- **Verification:** `node --test tests/conversation.model.test.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Scope:** No routes, controllers, repositories, Message model, chat/provider integration, encrypted title fields, or P5-02 work was added.
- **Next task:** P5-02 — Message Model. Do not start without approval.

- **Task:** Phase 4 implementation closure
- **Status:** Completed with two deferred integration gates
- **Files changed:** `docs/15_PHASE.md` and `PROJECT_MEMORY.md` only.
- **Completed scope:** P4-01 through P4-10 implementation is recorded complete.
- **Deferred gates:** Integrated chat must prove zero provider calls for `BLOCK` and masked-only `providerPrompt` for `ALLOW_WITH_MASK` when Phase 5 wires policy to providers.
- **Audit boundary:** P4-10 provides safe structured events; Phase 9 now adds
  durable append-only policy decision audit records.
- **Scope:** No temporary provider/chat code was added, and Phase 5 was not started.
- **Verification:** `npm run typecheck`, `npm run build`, `git diff --check`, and clean post-commit `git status --short` are required for closure.
- **Next task:** Await explicit approval before starting Phase 5.

- **Task:** P4-10 — Audit Decisions Without Raw Values
- **Status:** Completed
- **Files changed:** `backend/src/features/policy/policy-events.ts`, `backend/tests/policy-events.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Events:** Adds stable `policy.allow`, `policy.mask`, `policy.block`, and `policy.budget_block` events through an explicit safe-field allowlist.
- **Safety:** Raw prompts, masked prompts, detected values, `providerPrompt`, credentials, full auth context, and unexpected decision fields are never copied into event data; `orgId` and `userId` are included only from an existing trusted `AuthContext`.
- **Focused tests:** Four tests cover safe ALLOW, MASK, high-risk BLOCK, and budget BLOCK events, including raw-sensitive sentinel absence from captured logger output.
- **Verification:** `node --test tests/policy-events.test.mjs` passed 4/4; `npm run typecheck`, `npm run build`, and `git diff --check` passed; focused policy source/console scans found no forbidden content access or console logging.
- **Historical limitation:** P4 did not add durable storage. Phase 9 now owns
  append-only policy audit persistence; P5 already proved blocked/masked
  provider integration gates.
- **Next task:** Phase 4 closure audit/approval. Do not start Phase 5 automatically.

- **Task:** P4-08 — Implement `BLOCK`
- **Status:** Completed
- **Files changed:** `backend/src/features/policy/policy.types.ts`, `backend/src/features/policy/policy-evaluator.ts`, `backend/tests/policy-block.test.mjs`, `docs/02_SDD.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Policy:** Extends the canonical decision union with deterministic high-risk and budget-exhausted BLOCK behavior using approved reason codes.
- **Safety:** BLOCK carries no provider prompt or raw PII, preserves the original request, and has no provider integration or call path.
- **Focused tests:** Four tests cover exact block-threshold, above-threshold, budget-exhausted precedence, and absence of provider/raw-sensitive data.
- **Verification:** `node --test tests/policy-block.test.mjs`, `npm run typecheck`, `npm run build`, and `git diff --check` passed; focused source scan found no policy-to-provider or logging calls.
- **Next task:** P4-10 — Audit Decisions Without Raw Values. Do not start without approval.

- **Task:** P3-05 — Retry Policy
- **Status:** Completed
- **Files changed:** `backend/src/features/providers/provider-retry.policy.ts`, `backend/tests/provider-retry.policy.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Retry policy:** Adds bounded reusable provider retry helper with exponential backoff, jitter, max-attempt enforcement, approved retry categories, and abort-aware backoff.
- **Scope:** No circuit breaker, fallback, routing, or provider-specific retry integration was added.
- **Focused tests:** Four tests cover transient retry success, non-retryable no-retry behavior, max-attempt enforcement, and abort during backoff.
- **Verification:** `node --test tests/provider-retry.policy.test.mjs` passed after build; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Recommended completed commit:** `feat(providers): add bounded retry policy`.
- **Next task:** P3-06 — Circuit Breaker. Do not start without approval.

- **Task:** P3-04 — Capability Registry
- **Status:** Completed
- **Files changed:** `backend/src/features/providers/provider-capability.registry.ts`, `backend/src/features/providers/fake-provider.adapter.ts`, `backend/src/features/providers/groq-provider.adapter.ts`, `backend/tests/provider-capability.registry.test.mjs`, `backend/tests/fake-provider.adapter.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Registry:** Adds a read-only provider/model capability registry for Groq and the deterministic fake provider.
- **Adapter alignment:** Fake and Groq adapters now read shared provider IDs, model IDs, and capability limits from the registry.
- **Focused tests:** Four registry tests cover provider lookup, model lookup, unsupported provider/model handling, and immutability. Existing fake/Groq focused tests also passed after refactor.
- **Verification:** `node --test tests/provider-capability.registry.test.mjs tests/fake-provider.adapter.test.mjs tests/groq-provider.adapter.test.mjs` passed after build; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Recommended completed commit:** `feat(providers): add provider capability registry`.
- **Next task:** P3-05 — Retry Policy. Do not start without approval.

- **Task:** P3-03 — First Real Provider Adapter
- **Status:** Completed
- **Files changed:** `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `backend/src/config/env.ts`, `backend/src/features/providers/groq-provider.adapter.ts`, `backend/tests/helpers/test-env.mjs`, `backend/tests/groq-provider.adapter.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Groq adapter:** Maps canonical completion and streaming requests into Groq chat completions, maps responses back to canonical results/chunks, disables SDK retries, applies validated timeout, and normalizes SDK failures into `ProviderError`.
- **Security:** API key stays in validated env; tests use a mock client; adapter does not log prompts, responses, API keys, auth headers, SDK bodies, or raw SDK errors.
- **Focused tests:** Four focused tests cover completion mapping, streaming mapping, 429 normalization, and health/capabilities without real network calls.
- **Verification:** `node --test tests/groq-provider.adapter.test.mjs` passed after build; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Recommended completed commit:** `feat(providers): add first real provider adapter`.
- **Next task:** P3-04 — Capability Registry. Do not start without approval.

- **Task:** P3-02 — Fake Provider Adapter
- **Status:** Completed
- **Files changed:** `backend/src/features/providers/fake-provider.adapter.ts`, `backend/tests/fake-provider.adapter.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Fake behavior:** Supports success completion, streaming completion, timeout, 429, 500, mid-stream failure, health, capabilities, and call counting.
- **Focused tests:** Five focused tests cover normal completion, streaming, immediate failure modes, call counter, and mid-stream failure.
- **Verification:** `node --test tests/fake-provider.adapter.test.mjs` passed after build; `npm run typecheck`, `npm run build`, and `git diff --check` passed.
- **Recommended completed commit:** `feat(providers): add deterministic fake provider adapter`.
- **Next task:** P3-03 — Real Provider Adapter. Do not start without approval.

- **Task:** P3-01 — Provider Types and Interface
- **Status:** Completed
- **Files changed:** `backend/src/features/providers/provider.types.ts`, `backend/src/features/providers/provider-adapter.ts`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Provider contract:** Defines canonical completion request/result, stream chunk, capabilities, health, and normalized provider error types without SDK-specific types.
- **Adapter interface:** Supports non-stream completion, streaming completion, health checks, and capabilities.
- **Automated tests:** Not generated or modified by request.
- **Verification:** `npm run typecheck` passed; `npm run build` passed.
- **Recommended completed commit:** `feat(providers): add canonical provider adapter contract`.
- **Next task:** P3-02 — Fake Provider Adapter. Do not start without approval.

- **Task:** P2-08 — Logout
- **Status:** Completed
- **Files changed:** `backend/src/features/auth/auth.controller.ts`, `backend/src/features/auth/auth.service.ts`, `backend/src/features/auth/auth.routes.ts`, `backend/src/features/auth/auth.types.ts`, `docs/05_OPENAPI_SPEC.md`, `docs/14_OBSERVABILITY_DOCUMENTATION.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Logout flow:** Reads the refresh token only from the `proxiai_refresh` cookie, hashes it, revokes the trusted token family by DB identifiers when present, and clears the cookie with the approved attributes.
- **Idempotency:** Missing, unknown, or already revoked refresh tokens return the standard success envelope.
- **Logging:** Logout emits safe `auth.logout_succeeded` and `auth.logout_operational_error` events without raw tokens or cookie data.
- **Post-completion correction:** Logout is refresh-cookie only and no longer requires Bearer auth; MongoDB lookup or revocation failures now return `503 AUTH_TEMPORARILY_UNAVAILABLE` after clearing the cookie.
- **Automated tests:** Not generated or modified by request.
- **Manual checks:** Typecheck and build passed after the refresh-cookie-only correction; live logout behavior verification was not executed here.
- **Recommended completed commits:** `feat(auth): add idempotent logout`, `docs(progress): record P2-08 completion`.

- **Task:** P2-07 — Permission-Based RBAC
- **Status:** Completed
- **Files changed:** `backend/src/features/auth/auth-context.types.ts`, `backend/src/features/auth/auth.middleware.ts`, `backend/src/features/auth/authorization.middleware.ts`, `backend/src/types/express.d.ts`, `docs/05_OPENAPI_SPEC.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Authorization flow:** `requirePermission` checks only current `request.auth.permissions` and never grants access from role alone.
- **Scope helpers:** Organisation helper compares trusted resource `orgId` with auth `orgId`; team helper also requires trusted resource `teamId` to match auth `teamId`.
- **Auth context:** Optional trusted `teamId` is attached from the current database User when present.
- **Route integration:** No permission route was added because current implemented routes do not require permission guard without starting a later phase.
- **Automated tests:** Not generated or modified by request.
- **Manual checks:** Pending user-run checks for missing auth, missing permission, valid permission, wrong org scope, and wrong team scope.
- **Typecheck:** `npm run typecheck` passed.
- **Build:** `npm run build` passed.
- **Security scans:** Focused scans found no new authorization logs, client-trusted `orgId` scope, future routes, logout, admin feature, or P2-08 implementation.
- **Scope check:** No admin features, business routes, logout, password reset, durable audit, tests, or P2-08 implementation was added.
- **Recommended completed commits:** `feat(auth): add permission and scope authorization`, `docs(progress): record P2-07 completion`.

## Latest Task

- **Task:** P9-00 — Phase 9 Contract and Architecture Audit
- **Status:** Completed on 2026-08-21; docs-only, with no production feature
  code, schema migration, runtime configuration, or API behavior changed.
- **Scope resolved:** Message/title encryption, versioned keyring and AAD,
  owner-only decryption, prospective retention, append-only AuditLog, durable
  auth/policy events, audit-atomic admin mutations, deterministic roles,
  deactivation/session revocation, alert state, audit export, migration, and
  failure/recovery behavior.
- **Classification:** Encryption, AuditLog, approved admin mutations, alert
  state, and export are `IMPLEMENT_PHASE9`; existing refresh-family primitives
  and fresh active-user checks are `ALREADY_COMPLETE`; custom retention,
  automatic/per-org key management, onboarding/team CRUD, cache/replay, email,
  and team-lead logs are `DEFER`; no contract blocker remains.
- **Migration boundary:** Existing metadata messages remain unavailable and are
  not reconstructed. Audit coverage begins at Phase 9 deployment. Existing
  custom plaintext titles use an idempotent encrypt-verify-replace migration.
- **Security:** No plaintext persistence, no client-trusted orgId or permission
  arrays, no admin mutation without a committed audit, no RequestLog mutation,
  and no key/ciphertext/audit-sensitive value in logs or exports.
- **Files changed:** `docs/01_PRD.md`, `docs/02_SDD.md`, `docs/03_TDD.md`,
  `docs/04_DATABASE_DESIGN.md`, `docs/05_OPENAPI_SPEC.md`,
  `docs/06_SECURITY_THREAT_MODEL.md`, `docs/07_DEPLOYMENT_ARCHITECTURE.md`,
  `docs/08_TESTING_STRATEGY.md`, `docs/09_README.md`,
  `docs/12_SEQUENCE_DIAGRAMS.md`, `docs/13_CICD_DOCUMENTATION.md`,
  `docs/15_PHASE.md`, `deploy/aws/MANUAL_ACTIONS.md`, and
  `PROJECT_MEMORY.md`.
- **Verification:** Stale contract, canonical contract, production-code-diff,
  concrete-secret, Markdown fence, OpenAPI YAML parser, and sensitive-term scans
  passed. `git diff --check` passed. No runtime tests/typecheck/build were run
  because this task changes documentation only.
- **Historical next task:** P9-01 was approved after this contract audit and is
  now complete with P9-02 through P9-11.

- **Task:** Phase 8 — Admin Dashboard and RBAC
- **Status:** Completed and verified on 2026-08-21. Phase 9 was not started at
  this checkpoint and is now complete.
- **Backend:** Added authenticated `GET /api/v1/admin/summary`, `/logs`,
  `/billing`, `/alerts`, `/users`, and `/teams` with canonical permission
  guards, trusted `orgId`, strict Zod query validation, stable bounded cursors,
  and `Cache-Control: no-store` responses.
- **Frontend:** Added `/admin` with permission-aware navigation, responsive
  overview/users/teams/usage/alerts/logs views, and explicit loading, empty,
  error, denied, unknown-accounting, and deferred-mutation states.
- **Authoritative data:** Summary and billing expose persisted outcomes,
  known/unknown usage, provider/model counts, budget, anomaly alerts, and Redis
  provider health. Cost, latency, cache, fallback, routing, PII-risk, prompt,
  response, ciphertext, and secret fields are absent.
- **Security:** All tenant-owned queries include trusted `orgId`; real Mongo
  cross-tenant verification passed. Employee permission denial passed.
  RequestLog remains append-only, and no Phase 9 audit/encryption code exists.
- **Focused verification:** Backend admin unit tests passed `4/4`, real Mongo
  tenant integration passed `1/1`, and frontend admin tests passed `3/3`.
- **Full verification:** Backend passed `207/207` using the local test Redis
  override; frontend passed `15/15` with deterministic single-worker Vitest.
  Backend/frontend lint, typecheck, build, `git diff --check`, production
  dependency audits, and admin sensitive-source scans passed.
- **Approved deferrals:** Team-lead logs await trusted request-to-team
  ownership. User/team/status, session revocation, policy/budget/retention,
  alert resolution, and audit export await Phase 9 durable audit. Email awaits
  approved provider/configuration/template content.
- **Completed commits:** `docs(admin): resolve phase 8 dashboard contracts`,
  `feat(admin): add tenant-scoped organisation dashboard APIs`,
  `feat(frontend): add read-only organisation admin dashboard`, and
  `test(admin): cover tenant and permission boundaries`.
- **Next task:** Phase 9 contract planning/audit only after explicit approval.

- **Task:** P7-11 — Durable Enqueue Recovery
- **Status:** Completed and verified on 2026-08-19; Phase 7 completed and Phase 8 not started
- **Files changed:** `backend/src/features/analytics/analytics.queue.ts`, `backend/src/features/billing/billing.queue.ts`, `backend/src/features/chat/chat.service.ts`, `backend/src/features/recovery/enqueue-recovery.types.ts`, `backend/src/features/recovery/enqueue-recovery.model.ts`, `backend/src/features/recovery/enqueue-recovery.repository.ts`, `backend/src/features/recovery/enqueue-recovery.service.ts`, `backend/src/features/recovery/enqueue-recovery.queue.ts`, `backend/src/features/recovery/enqueue-recovery.worker.ts`, `backend/src/server.ts`, `backend/src/shared/async/job-contract.ts`, `backend/tests/chat-billing-producer.test.mjs`, `backend/tests/chat.stream.test.mjs`, `backend/tests/enqueue-recovery.worker.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Durable state:** The strict MongoDB `async_enqueue_recovery` ledger stores only trusted `{ orgId, requestId, queueName, jobType }`, `PENDING`/`ENQUEUED`/`COMPLETED`/`FAILED`, bounded attempts, safe timestamps, and an allowlisted error category. RequestLog remains append-only.
- **Recovery flow:** Billing and analytics enqueue failures create immediate durable records. A startup scan plus one idempotently upserted 60-second BullMQ schedule enumerates trusted organisations, reads RequestLog with `orgId`, reconstructs only approved billing/analytics jobs, and re-enqueues deterministic job IDs.
- **Duplicate safety:** Atomic due-record claims close concurrent scan races. Existing billing/analytics ledgers remain the final exactly-once side-effect guard; completed ledgers close recovery without another enqueue.
- **Failure behavior:** Publication retries reuse the approved exponential backoff and stop after three attempts. Terminal BullMQ failures and exhausted recovery remain `FAILED` and visible through MongoDB, BullMQ's failed set, and safe structured events.
- **Focused tests:** Four real-Mongo tests prove durable failure recording, concurrent deterministic single enqueue, completed-ledger duplicate prevention, and terminal failure after three attempts.
- **Verification:** Focused tests passed `4/4`; chat/billing/analytics/recovery regressions passed `19/19`; the full backend suite passed `195/195`; `npm run typecheck`, `npm run build`, `git diff --check`, lifecycle review, RequestLog mutation scan, and sensitive-source/log scans passed.
- **Security/scope:** Recovery stores and logs no prompt, response, PII, password, cookie, authorization header, API key, provider payload, or secret. It covers only existing billing and analytics producers; no email, arbitrary job replay, Bull Board, public admin UI, or Phase 8 work was added.
- **Remaining risks:** `FAILED` recovery records require controlled future operational handling; Bull Board/manual replay remains Phase 10. The bounded 100-record tenant scan may drain a large historical backlog over multiple intervals by design.
- **Completed commit:** `feat(async): add durable enqueue recovery`.
- **Next task:** Phase 8 readiness audit only, after explicit approval.

## Deployment Readiness Contract

- **Platform:** AWS ECR + ECS/Fargate + ALB + Route 53 + ACM + Secrets Manager + CloudWatch, with MongoDB Atlas and a managed Redis service compatible with BullMQ.
- **Services:** One frontend service, one API service, and one separate always-on BullMQ worker service. API and worker reuse the same backend image with different commands.
- **Public origin:** One canonical origin per environment. ALB routes `/api/*` and `/health/*` to API and other paths to frontend; browser API calls use same-origin relative paths so one frontend image can be promoted unchanged.
- **Secrets:** Runtime application secrets belong in AWS Secrets Manager. GitHub Actions uses AWS OIDC; no long-lived AWS key or application secret enters Git, image layers, build arguments, frontend bundles, or logs.
- **Release:** Build SHA-tagged images once, deploy exact digests to staging, run smoke tests, require production approval, and promote the same digests. Rollback selects previously recorded task definitions/digests.
- **Parameters:** Region, domains, hosted zone/certificate, networking, task sizes/counts, MongoDB networking, Redis product/settings, IAM identities, and smoke credentials must be provided explicitly and are not invented in source.
- **Phase order:** Phase 12 deployment readiness is explicitly accelerated after Phase 7. Phase 8 Admin UI and later product phases remain planned and deferred, not cancelled.

## Previous Contract Task — P7-08

- **Task:** P7-08 — Safe Alert Email Notification Contract
- **Status:** Completed documentation-only on 2026-08-19
- **Completed commit:** `docs(email): define safe alert notification contract`.

## Previous Implementation Task — P7-07

- **Task:** P7-07 — Tenant-Scoped Daily Token Anomaly Worker
- **Status:** Completed and verified on 2026-08-19
- **Completed commit:** `feat(anomaly): add tenant-scoped daily token anomaly worker`.

## Previous Contract Task

- **Task:** P7-07 — Daily Anomaly Detection Contract
- **Status:** Completed documentation-only on 2026-08-19
- **Completed commit:** `docs(anomaly): define tenant-scoped daily anomaly detection contract`.

## Previous Implementation Task

- **Task:** P7-06 — Basic Analytics Worker
- **Status:** Completed and verified on 2026-08-19
- **Files changed:** `backend/src/shared/async/job-contract.ts`, `backend/src/features/billing/billing.types.ts`, `backend/src/features/billing/request-log.model.ts`, `backend/src/features/billing/billing.repository.ts`, `backend/src/features/billing/billing.service.ts`, `backend/src/features/chat/chat.service.ts`, `backend/src/features/chat/chat.controller.ts`, `backend/src/features/analytics/analytics.types.ts`, `backend/src/features/analytics/analytics-daily.model.ts`, `backend/src/features/analytics/analytics-job-ledger.model.ts`, `backend/src/features/analytics/analytics.repository.ts`, `backend/src/features/analytics/analytics.queue.ts`, `backend/src/features/analytics/analytics.worker.ts`, `backend/src/server.ts`, `backend/tests/analytics.worker.test.mjs`, `backend/tests/async-job-foundation.test.mjs`, `backend/tests/billing.accounting.integration.mjs`, `backend/tests/billing.worker.test.mjs`, `backend/tests/chat-billing-producer.test.mjs`, `backend/tests/chat.stream.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Outcome contract:** RequestLog and queue payloads now carry explicit canonical `status` and `policyAction`. Provider outcomes publish `request.completed`; policy blocks publish analytics-only `request.blocked` after the immutable RequestLog append.
- **Analytics projection:** The worker recomputes UTC-day organisation and user aggregates for total, successful, blocked, masked, failed, and interrupted requests plus provider/model counts and known provider token usage.
- **Idempotency and authority:** A separate tenant-scoped `{ orgId, requestId, jobType }` analytics ledger prevents duplicate effects. The worker verifies each event against its authoritative scoped RequestLog before projection and never mutates RequestLog or BillingRollup.
- **Unknown usage:** Unknown provider usage remains explicit through `unknownUsageRequestCount`; no token count or cost is synthesized. Billing remains the only authoritative BudgetRollup source.
- **Lifecycle and failures:** The analytics worker reuses the central BullMQ connection factory, bounded three-attempt retry/failed-job retention, managed shutdown, and heartbeat. Invalid or mismatched authoritative outcomes are terminal; transient failures release the processing claim for a bounded retry.
- **Focused tests:** Four tests cover safe outcome enqueue, duplicate idempotency, blocked counting, tenant isolation, and unknown-usage handling.
- **Verification:** Analytics tests passed 4/4; worker/chat/billing regressions passed 23/23; full backend suite passed 183/183. `npm run typecheck`, `npm run build`, `git diff --check`, console scan, and sensitive contract/log scan passed.
- **Security/scope:** Analytics payloads and logs contain no prompt, response, PII, password, cookie, authorization header, API key, or secret. No anomaly, email, provider-health worker, reporting API, pricing, or Phase 8 work was added.
- **Completed commit:** `feat(analytics): add tenant-scoped async request analytics`.
- **Next task:** P7-07 — Simple Anomaly Worker planning/audit only; do not implement without approval.

## Previous Application Task

- **Task:** P5-08 — Chat Workspace Contract Corrections
- **Status:** Completed and browser-verified on 2026-08-19
- **Files changed:** `backend/src/features/conversations/conversation.controller.ts`, `backend/src/features/conversations/conversation.repository.ts`, `backend/src/features/conversations/conversation.routes.ts`, `backend/src/features/conversations/conversation.schema.ts`, `backend/src/features/conversations/conversation.service.ts`, `backend/src/features/conversations/conversation.types.ts`, `backend/tests/conversation.title-update.integration.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/app/(workspace)/chat/[conversationId]/page.tsx`, `frontend/src/features/chat/assistant-markdown.tsx`, `frontend/src/features/chat/chat-center.tsx`, `frontend/src/features/chat/chat-workspace.tsx`, `frontend/src/features/chat/chat-center.test.tsx`, `frontend/src/features/chat/chat-workspace.test.tsx`, `frontend/src/features/conversations/conversation-sidebar.tsx`, `frontend/src/features/conversations/conversation-title-editor.tsx`, `frontend/src/features/conversations/conversation.api.ts`, `frontend/src/lib/api/api-client.ts`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Title update:** `PATCH /api/v1/conversations/:conversationId` requires authentication plus current `chat:send`, validates strict trimmed titles from 1–120 characters, and updates only `{ orgId, userId, conversationId }`; foreign scope returns generic `404` without mutation.
- **Conversation recovery:** Workspace startup and direct `/chat/:conversationId` refresh use real Conversation list/read APIs with explicit loading, empty, and error states. Historical messages remain safe summaries and display a metadata-only content-unavailable notice.
- **Rendering and input:** Assistant output uses safe Markdown/GFM rendering without raw HTML support; user prompts remain plain escaped text. Enter sends, Shift+Enter inserts a newline, streaming blocks duplicates, focus is restored, and switching routes aborts the active request.
- **Focused tests:** Four new high-value tests cover owned/foreign title updates, Conversation loading and stream abort state, safe Markdown/table rendering, and Enter/Shift+Enter behavior. The real-Mongo title test passed 2/2; the complete backend suite passed 181/181. Frontend focused tests passed at each implementation commit; a final rerun encountered the known Vitest worker-start hang and was terminated without a test assertion failure.
- **Verification:** Backend typecheck/build passed. Frontend typecheck/lint/production build passed. `git diff --check`, scope/leak scans, and clean-tree checks passed before this docs update.
- **Browser QA:** Login, real Conversation loading, selecting and refreshing an old Conversation, manual rename, metadata-only history notice, real Groq SSE output, Markdown headings/lists/table rendering, Enter, Shift+Enter, route-switch `net::ERR_ABORTED`, and responsive desktop/mobile layouts were verified. No browser console errors or horizontal mobile overflow were found.
- **Known UI observation:** Direct authenticated refresh restores the scoped Conversation, but the sidebar identity labels can fall back to `ProxyAi User` and `Your workspace`; this pre-existing auth-bootstrap presentation issue is outside P5-08.
- **Security/scope:** No attachments, multipart/upload UI, LLM title generation, plaintext historical content, `contentEnc` exposure, raw HTML injection, or prompt logging was added.
- **Completed commits:** `feat(conversations): add tenant-scoped conversation title update`; `fix(chat): restore conversation loading and metadata-only history states`; `feat(chat): render assistant markdown and tables safely`; `fix(chat): support Enter-to-send and Shift+Enter newline`; `docs(progress): record P5-08 chat UX completion`.
- **Next task:** P7-06 — Basic Analytics Worker. Do not start without approval.

## Previous Contract Task

- **Task:** P7-06 prerequisite — Request Outcome Event Contract
- **Status:** Documentation contract completed on 2026-08-19; no production analytics code added
- **Files changed:** `docs/02_SDD.md`, `docs/03_TDD.md`, `docs/04_DATABASE_DESIGN.md`, `docs/05_OPENAPI_SPEC.md`, `docs/06_SECURITY_THREAT_MODEL.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Completed/provider contract:** `request.completed` requires explicit `COMPLETED`, `FAILED`, or `INTERRUPTED` plus `ALLOW` or `ALLOW_WITH_MASK`, trusted scope, provider/model, and only optional actual usage.
- **Blocked contract:** Policy `BLOCK` emits analytics-only `request.blocked` with explicit `BLOCKED` plus `BLOCK`; provider/model/usage/cost and all prompt/response/PII/secret fields are forbidden.
- **Persistence ordering:** The immutable RequestLog is appended before either event publication attempt. Queue failure is operationally visible but workers never mutate RequestLog or infer missing outcomes.
- **Public API:** No new SSE event was added. Existing `done`, `error`, and pre-stream JSON `403 POLICY_BLOCKED` behavior remains canonical.
- **Recommended commit:** `docs(analytics): define request outcome event contract`.
- **Next task:** Re-audit and then implement P7-06 only after approval.

## Previous Task

- **Task:** P7-05 — Worker Heartbeat
- **Status:** Completed on 2026-08-19
- **Files changed:** `backend/src/shared/async/worker-heartbeat.ts`, `backend/src/shared/async/bullmq.ts`, `backend/src/features/billing/billing.worker.ts`, `backend/tests/worker-heartbeat.test.mjs`, `docs/03_TDD.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Contract:** The billing worker probes Redis every 30 seconds through its existing BullMQ connection; health becomes stale after the approved 120-second alert boundary.
- **Safe state:** Internal health exposes only fixed worker identity/type, `running`, `healthy`, `lastHeartbeatAt`, and `lastSuccessfulJobAt`. It does not expose job payloads, tenant data, Redis details, or secrets.
- **Lifecycle:** Startup is idempotent, creates one heartbeat timer, and records successful jobs through the managed worker processor. Shutdown clears the timer and awaits any in-flight probe before closing BullMQ resources.
- **Failure behavior:** A failed probe marks health unhealthy and emits `queue.worker.heartbeat_failed` with safe fixed metadata. It does not block chat requests or create another Redis connection.
- **Focused tests:** Four tests prove timestamp/freshness updates, duplicate-start prevention, clean shutdown, failed-probe health, and a real managed-worker heartbeat over the existing BullMQ connection.
- **Verification:** Focused heartbeat tests passed 4/4; the combined heartbeat/BullMQ/billing worker suite passed 12/12. Typecheck, build, diff-check, and sensitive log/source scans passed.
- **Recommended commit:** `feat(async): add billing worker heartbeat`.
- **Next task:** P7-06 — Basic Analytics Worker. Do not start without approval.

## Prior Task

- **Task:** P7-04 — Idempotent Billing Worker
- **Status:** Completed on 2026-08-19
- **Files changed:** `backend/src/features/billing/billing.types.ts`, `backend/src/features/billing/billing-job-ledger.model.ts`, `backend/src/features/billing/billing.repository.ts`, `backend/src/features/billing/billing.service.ts`, `backend/src/features/billing/billing.worker.ts`, `backend/src/server.ts`, `backend/tests/billing.worker.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Ledger:** A strict MongoDB ledger atomically guards trusted `{ orgId, requestId, jobType }` work with `PROCESSING` and `COMPLETED` states plus safe `APPLIED` or `USAGE_UNAVAILABLE` outcomes.
- **Reconciliation:** The worker loads RequestLog through `{ orgId, requestId }`, never mutates it, aggregates the authoritative UTC month, and writes deterministic BillingRollup totals with `$set`; chat no longer waits for this rollup work.
- **Retry/failure:** Concurrent and completed duplicates skip effects. Transient failures release the claim for BullMQ's bounded retry; malformed/missing authoritative data remains terminal and failed jobs retain safe metadata only.
- **Lifecycle:** Billing worker startup waits for MongoDB and Redis, uses the existing managed BullMQ worker connection, and closes through the shared graceful-shutdown boundary.
- **Focused tests:** Four real-Mongo tests prove sequential duplicate safety, concurrent duplicate safety, transient retry recovery, and unknown-usage terminal behavior without synthetic accounting.
- **Verification:** Focused worker/BullMQ/chat tests passed 15/15 and billing integration passed 4/4. The full suite reached 174/175 because the pre-existing BullMQ retry timing assertion intermittently observed two of three attempts; its isolated rerun passed 4/4. Typecheck, build, diff-check, RequestLog mutation scan, console scan, and sensitive payload/log scans passed.
- **Recommended commit:** `feat(billing): add idempotent async billing worker`.
- **Next task:** P7-05 — Worker Heartbeat. Do not start without approval.

## Earlier Task

- **Task:** P7-03 — Request-Completed Billing Producer Integration
- **Status:** Completed on 2026-08-19
- **Files changed:** `backend/src/features/chat/chat.service.ts`, `backend/tests/chat.stream.test.mjs`, `backend/tests/chat-billing-producer.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Ordering:** Chat finalization appends RequestLog before publishing one safe validated billing job and keeps synchronous budget reconciliation until the worker exists.
- **Verification:** Focused checks passed 7/7 and the complete backend suite passed 171/171 with typecheck, build, diff-check, and leak scans.
- **Recommended commit:** `feat(async): enqueue completed request billing jobs`.
- **Next task:** P7-04 — Idempotent Billing Worker.

## Latest Verified Defect Fix

- **Task:** Local development CORS origin alignment
- **Status:** Completed on 2026-08-19 without changing production CORS behavior
- **Files changed:** `backend/.env.example`, `docs/09_README.md`, and local ignored `backend/.env`
- **Decision:** Local frontend origin is `http://localhost:3001`; `FRONTEND_ORIGIN` remains the single validated exact-origin credentialed CORS boundary with no wildcard or fallback.
- **Verification:** Login and refresh preflights returned `204`; login, refresh, and authenticated `/api/v1/auth/me` requests returned `200` with `Access-Control-Allow-Origin: http://localhost:3001` and credentials enabled.
- **Security:** No authentication logic, frontend behavior, wildcard origin, alias, or multi-origin production fallback was added.

## Latest Deployment Verification

- **Task:** P12-09 local production-like release verification
- **Status:** Local gates completed on 2026-08-19; live AWS deployment remains blocked on external account configuration.
- **Files changed:** `backend/src/features/analytics/analytics.repository.ts`, `backend/tests/analytics.worker.test.mjs`, `deploy/scripts/smoke.sh`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Runtime defect fixed:** Mongo aggregation returned an internal `_id` field that was accidentally spread into an existing analytics aggregate update. The explicit canonical projection now prevents immutable Mongo `_id` updates, and a second same-tenant request regression test proves aggregate updates continue without duplicate effects.
- **Smoke contract fixed:** Deployment MASK/BLOCK prompts now deterministically cross the seeded policy thresholds without changing policy or product behavior.
- **Local smoke:** The isolated gateway/frontend/API/worker/Redis stack became healthy. Frontend, `/healthz`, `/health/live`, `/health/ready`, login, refresh, `/auth/me`, Conversation create/list/read, Groq ALLOW SSE, PII MASK, and pre-provider BLOCK all passed.
- **Accounting/async proof:** The correlated ALLOW request produced exactly one immutable COMPLETED RequestLog with known provider usage, one applied billing job, one completed analytics job, and a positive BillingRollup. No analytics processing failure remained after the fix.
- **Verification:** Backend tests passed 197/197 plus lint, typecheck, and build. Frontend tests passed 9/9 with a constrained-environment CLI timeout plus lint, typecheck, and production build. Both Docker images rebuilt successfully; ShellCheck, Gitleaks (111 commits), `git diff --check`, and service-log secret scans passed.
- **Security:** Eight configured/synthetic sensitive sentinels were absent from service logs; Gitleaks found no repository leaks. No provider key, database/Redis URL, password, prompt sentinel, cookie, or token was printed by verification output.
- **Completed commits:** `fix(analytics): prevent aggregate id leakage during updates`; `fix(deploy): align policy smoke inputs with seeded thresholds`.
- **Remaining gate:** Run CloudFormation validation and actual immutable-digest staging → approval → production → rollback flow after approved AWS parameters and secrets are provisioned.

## Latest AWS IaC Alignment

- **Task:** P12-09 pre-deployment IaC correction for existing production resources.
- **Status:** Repository-side IaC alignment completed on 2026-08-19; no AWS resources or ECS services were created by this task, and live P12-09 rollout remains pending.
- **Resource reuse:** `foundation.yml` now accepts the existing `proxiai-production` cluster, `proxiai-alb`, ALB/ECS security groups, frontend/API target groups, IAM roles, VPC, public/private subnets, NAT gateway, log-group names, and runtime-secret ARN as parameters instead of declaring duplicate resources.
- **Optional resources:** The foundation stack can create only explicitly missing retained 7-day log groups and, after approved domain/certificate inputs exist, the HTTPS listener and path rules. Existing HTTP listener conversion to HTTP → HTTPS redirect remains a reviewed deployment action because that listener is externally managed.
- **Secret contract:** Production uses one JSON Secrets Manager secret, `proxiai/production`, containing only `MONGO_URI`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_SECRET`, and `GROQ_API_KEY`; task definitions select keys at runtime and never embed secret values.
- **Release safety:** Production image parameters require `repository@sha256:<digest>`. Production desired counts are fixed at one; staging may use zero while reusing the cluster/ALB with environment-specific services, target groups, logs, secret, and data.
- **Cost/security:** Frontend, API, and worker default to 256 CPU units/512 MiB, autoscaling is absent, ECS public IP assignment stays disabled, existing one-NAT topology is reused, Container Insights remains disabled, and retained log groups use seven-day retention.
- **Files changed:** `deploy/aws/foundation.yml`, `deploy/aws/services.yml`, `deploy/aws/README.md`, `deploy/aws/MANUAL_ACTIONS.md`, `docs/07_DEPLOYMENT_ARCHITECTURE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** AWS CloudFormation validation passed for both templates; static duplicate-resource, mutable-image, stale split-secret, concrete-secret, and whitespace scans passed.
- **Remaining manual inputs:** Approved domain and ACM certificate, explicit existing HTTP-listener redirect update, populated production secret values, Atlas and managed Redis connectivity, immutable frontend/backend image digests, environment-specific staging target groups/secret/data, and live staging/rollback verification.

## Latest Deployment Task

- **Task:** P12-08 — GitHub Actions Validation, Deployment, Smoke, and Rollback
- **Status:** Implementation completed on 2026-08-19; live AWS execution remains P12-09
- **CI:** Pull requests and main run secret scan, deterministic installs, production dependency audits, frontend/backend lint, typecheck, tests, builds, and both Docker builds with no paid provider calls.
- **Release:** A successful main CI run builds each image once with the release SHA OCI label, scans high/critical findings, pushes immutable SHA tags, resolves digests, and passes those exact digests through staging and protected production.
- **Deployment:** Scripts render current task definitions, record previous revisions, register new digest revisions, run the private one-off index task, update frontend/API/worker services, wait for stability, and preserve rollback artifacts.
- **Smoke:** Release automation checks health, auth/login/refresh/me, Conversation create/list/read, real Groq ALLOW SSE, MASK/BLOCK behavior, and correlated billing/analytics worker completion with applied accounting.
- **Rollback:** Manual staging/production workflow requires explicit prior frontend/API/worker revisions, waits for stability, and reruns smoke without touching data, queues, secrets, or images.
- **Lint/toolchain:** Added real backend TypeScript ESLint. Backend TypeScript was aligned from unsupported `7.0.2` to parser-compatible `6.0.3`; three stale type imports were removed with no runtime behavior change.
- **Files changed:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/rollback.yml`, `deploy/scripts/*.sh`, backend lint/package files, three stale-import files, frontend/backend Docker labels, `docs/13_CICD_DOCUMENTATION.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Backend lint/typecheck/build passed; backend and frontend production dependency audits reported zero vulnerabilities; actionlint and ShellCheck passed in read-only network-disabled validator containers. Full tests and final image builds are recorded by the P12-09 readiness run.
- **Pending environment gates:** AWS OIDC/role, region/domain/network values, secret population, Atlas/managed Redis connectivity, GitHub Environment approval identities, smoke accounts, actual ECR/ECS rollout, CloudWatch evidence, and rollback execution.

## Previous Deployment Task

- **Task:** P12-07 — Parameterized AWS Infrastructure Definitions
- **Status:** Completed on 2026-08-19
- **Registry/foundation:** `deploy/aws/registry.yml` defines exactly two shared immutable scan-on-push ECR repositories so staging and production use identical digests. `foundation.yml` defines each environment's ECS cluster, retained Secrets Manager containers, least-privilege roles, CloudWatch logs, ALB routing, health checks, security groups, and Route 53/ACM integration.
- **Services:** `deploy/aws/services.yml` defines independent private-subnet Fargate frontend, API, and worker services. Frontend/API use ALB target groups; worker has no listener or public IP; API and worker share one backend image digest with different commands and secret sets.
- **Parameters:** Region remains the CloudFormation deployment context. VPC/subnets, domain, certificate, images, SHA, model, task sizing/counts, and external MongoDB/Redis connectivity remain explicit inputs rather than guessed values.
- **Data services:** MongoDB Atlas and managed Redis are intentionally external. Secret containers are created without committing endpoint credentials; JWT and rate-limit secrets are independently generated and retained.
- **Files changed:** `deploy/aws/registry.yml`, `deploy/aws/foundation.yml`, `deploy/aws/services.yml`, `deploy/aws/README.md`, `docs/07_DEPLOYMENT_ARCHITECTURE.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Both YAML templates parsed locally with CloudFormation intrinsic-tag support (23 foundation resources and 6 service resources); diff-check passed. AWS service validation could not run because no local AWS credentials are configured, so first staging bootstrap must run `aws cloudformation validate-template` before create/update.
- **Security:** ECS tasks run in private subnets without public IPs; only ALB security-group traffic reaches ports 3000/8080; secret values are runtime-injected and absent from task plaintext configuration.

## Earlier Deployment Task

- **Task:** P12-06 — Idempotent Production Index Deployment
- **Status:** Completed on 2026-08-19
- **Command:** `npm run deploy:indexes` loads all 13 approved Mongoose models and calls `createIndexes()` only. It never uses destructive `syncIndexes()`, never drops indexes, and never mutates application records.
- **Production behavior:** Normal production MongoDB connections set `autoIndex=false`; index creation is an explicit pre-rollout one-off task rather than API/worker startup work.
- **Files changed:** `backend/src/scripts/deploy-indexes.ts`, `backend/src/shared/lib/mongo.ts`, `backend/package.json`, `backend/tests/deploy-indexes.test.mjs`, `docs/04_DATABASE_DESIGN.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Focused test passed 1/1; build passed; the command completed twice against dedicated `proxiai_index_deployment_audit`, creating declared indexes for all 13 models both times without conflict.
- **Safety:** Logs contain fixed model names and safe events only. MongoDB URIs and credentials are never logged. Future document/data migrations remain a separately approved concern.

## Earlier AWS Task

- **Task:** P12-05 — Production-Like Local Compose Stack
- **Status:** Completed on 2026-08-19
- **Topology:** Added Nginx gateway, standalone Next.js frontend, Express API, BullMQ worker, and Redis services. Nginx mirrors ALB routing by sending `/api/*` and `/health/*` to API and all other paths to frontend.
- **Configuration:** `COMPOSE_MONGO_URI` is mandatory and must be container-reachable; Redis remains internal with AOF and `noeviction`; `PROXIAI_HTTP_PORT` safely parameterizes the exact local origin without wildcard CORS.
- **Local HTTP boundary:** Compose intentionally uses backend `NODE_ENV=development` so host-only refresh cookies work over local HTTP. Production ECS tasks remain `NODE_ENV=production` behind ACM/TLS.
- **Files changed:** `docker-compose.yml`, `deploy/local/nginx.conf`, `docs/09_README.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Compose configuration validation passed. Real stack verification reported frontend, API, worker, Redis, and gateway healthy; `/`, `/healthz`, `/health/live`, and `/health/ready` returned `200`; readiness reported MongoDB and Redis `up`; nine expected API/worker startup events were observed.
- **Operational note:** Port `3001` was already occupied during audit, so the verified stack used `PROXIAI_HTTP_PORT=3301`. Containers were stopped cleanly after verification; the Redis named volume was preserved.

## Earlier Database Task

- **Task:** P12-04 — Production Frontend and Backend Docker Images
- **Status:** Completed on 2026-08-19
- **Images:** Added pinned Node 22 Debian-slim multi-stage images for the Next.js standalone server and the shared Express/BullMQ backend artifact.
- **Runtime safety:** Both images use UID `1001`, production-only runtime files, explicit ports, container health checks, and `.dockerignore` rules that exclude dependency trees, build output, tests, logs, and environment files.
- **Frontend health:** `/healthz` is a dependency-free container endpoint; the built image returned `status=ok` and Docker reported `healthy`.
- **Backend roles:** The image defaults to `dist/server.js`; worker deployments set `RUNTIME_ROLE=worker` and run `dist/worker.js` from the same immutable image.
- **Files changed:** `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/src/app/healthz/route.ts`, `backend/Dockerfile`, `backend/.dockerignore`, `docs/07_DEPLOYMENT_ARCHITECTURE.md`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Frontend typecheck, lint, and standalone build passed; both real Docker image builds passed; image inspection proved non-root users, no copied `.env` files, both backend entrypoints, and configured health checks.
- **Dependency observation:** The backend production dependency stage reported zero known npm audit vulnerabilities. The build-only dependency stage reported one high-severity development dependency finding; CI image scanning remains required before release.

## Earlier Index/Runtime Task

- **Task:** P12-03 — Separate API and BullMQ Worker Production Entrypoints
- **Status:** Completed on 2026-08-19
- **Runtime split:** `dist/server.js` now starts only HTTP plus billing/analytics producers. `dist/worker.js` owns all BullMQ schedulers and billing, analytics, anomaly, provider-health, and enqueue-recovery consumers.
- **Configuration:** Shared MongoDB, Redis, logger, and Groq configuration is validated through `runtimeEnv`; API-only CORS, auth, rate-limit, and idempotency settings remain required only by `env`.
- **Startup/shutdown:** Both runtimes connect required dependencies before reporting started, fail startup explicitly, and reuse one ordered BullMQ/Redis/Mongo graceful-shutdown boundary.
- **Files changed:** `backend/package.json`, `backend/src/config/env.ts`, `backend/src/config/runtime-env.ts`, provider runtime files, shared Mongo/Redis/logger modules, `backend/src/shared/async/runtime.ts`, `backend/src/shared/runtime/infrastructure.ts`, `backend/src/server.ts`, `backend/src/worker.ts`, `backend/tests/auth-config.test.mjs`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Verification:** Focused environment tests passed 6/6; full backend suite passed 196/196; typecheck, build, and diff-check passed.
- **Security:** Worker no longer requires API JWT/CORS/rate-limit secrets. No secret values are logged, and queue consumers cannot accidentally start inside API tasks.

## Earlier Runtime Task

- **Task:** P12-02 — Immutable Frontend Deployment Configuration
- **Status:** Completed on 2026-08-19
- **Files changed:** `frontend/.env.example`, `frontend/next.config.ts`, `frontend/src/lib/api/api-path.ts`, `frontend/src/lib/api/api-client.ts`, `frontend/src/features/chat/chat.api.ts`, `frontend/src/features/marketing/landing-page.test.tsx`, removed `frontend/src/lib/env/public-env.ts`, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Contract:** Browser API calls now use same-origin `/api/v1` paths. Local development uses a server-side-only `BACKEND_INTERNAL_ORIGIN` rewrite, while production routing remains the ALB responsibility.
- **Immutable release:** `NEXT_PUBLIC_API_BASE_URL` was removed, so one standalone frontend image digest can be promoted between environments without rebuilding public configuration into the browser bundle.
- **Verification:** Frontend tests passed 9/9 using a deterministic single-worker run with an environment-only timeout; typecheck, lint, production build, and diff-check passed. The normal 5-second test timeout remains slow-machine sensitive and was not changed in source.
- **Security:** No backend secret or internal origin is exposed to browser code. Production has no hidden local proxy fallback.

## Latest Phase 9 Task

- **Task:** P9-01 through P9-11 — Complete Phase 9 Retention, Encryption, and Audit.
- **Status:** Completed on 2026-08-21 before the now-completed Phase 10 work.
- **Encryption:** Central AES-256-GCM service uses a validated versioned
  application keyring, fresh 12-byte IVs, 16-byte tags, canonical base64url,
  and tenant/resource-bound AAD. Missing keys, wrong AAD, tampering, malformed
  envelopes, and missing key versions fail closed with no plaintext fallback.
- **Retention:** `METADATA_ONLY` stores two metadata-only records after a
  completed stream. `ENCRYPTED_STORAGE` stores ciphertext-only user/assistant
  records. Message pair creation and Conversation activity update are one
  idempotent Mongo transaction; partial/interrupted streams store no content.
- **Owner read:** Conversation ownership is checked through trusted
  `{ orgId, userId, conversationId }` before encrypted messages are selected
  and decrypted. API/frontend receive `content` only with
  `contentAvailable=true`; `contentEnc` is never serialized.
- **Titles/migration:** New manual custom titles are encrypted. The controlled
  migration verifies existing ciphertext, encrypts legacy custom titles,
  verifies decryption, and conditionally replaces plaintext. A second run is
  a no-op; verification failure preserves the original title.
- **Audit/admin:** Tenant-scoped AuditLog is append-only with action-specific
  bounded metadata. Role/team/status/session, policy/budget/retention, and
  alert state changes commit atomically with audit; role permissions are
  deterministic and disabling a user revokes active refresh sessions.
- **Export/frontend:** Audit CSV is feature/permission-gated, tenant-scoped,
  ordered, limited to 90 days and 10,000 rows, formula-neutralized, and
  self-audited. Admin controls wait for backend confirmation and expose safe
  loading/error/disabled states. Historical encrypted content renders only
  through the approved owner response contract.
- **Files changed:** Phase 9 backend security, audit, admin, auth, chat,
  conversation/message, config/runtime, migration/index and test files;
  frontend admin/chat/conversation files; deployment secret selectors; and
  approved architecture, database, OpenAPI, security, roadmap, CI/CD, README,
  and memory documentation.
- **Verification:** Backend full suite passed `213/213` with explicit local
  Redis. Isolated MongoDB replica-set integration passed `7/7` admin/audit
  tests and `4/4` encrypted-message/migration tests. Frontend passed `16/16`
  with the existing slow-import test timeout raised only at command time.
  Backend/frontend lint, typecheck, and production builds passed. Production
  dependency audits found `0` vulnerabilities. Production images built as
  non-root and contained no `.env` files or runtime-secret environment values.
  Static secret and sensitive-log scans returned zero matches; diff-check
  passed.
- **Operational limitations:** The MVP uses one application-level versioned
  keyring. BYOK, per-organisation keys, KMS/HSM envelope encryption, automatic
  rotation/re-encryption, custom retention/TTL deletion, prompt cache, response
  replay, and email remain deferred. The transitive development-only
  `brace-expansion` advisory was resolved to `5.0.9`; full and production
  dependency audits are clean.
- **Local environment note:** The developer `.env` currently contains a
  malformed duplicated Redis assignment prefix. Verification used the healthy
  local Redis service through an explicit process-only `REDIS_URL` override;
  no `.env` or secret file was modified or committed.

## Historical Phase 10 Closure

- **Task:** P10-01 through P10-10 — Complete Phase 10 Observability and
  Operations.
- **Status:** Completed on 2026-08-21; Phase 11 subsequently completed through
  P11-08 release certification.
- **Instrumentation:** The API and worker use bounded process-local Prometheus
  registries. HTTP, chat, TTFT, provider resilience/health, policy, PII,
  idempotency, dependency readiness, queue/job, worker lifecycle/heartbeat,
  and audit-write owning boundaries emit without request, user, organisation,
  resource, model, raw path, prompt, response, or secret labels.
- **Runtime boundaries:** API `/metrics` and worker port `9464` are private.
  `/metrics` does not instrument itself, and the worker listener exposes no
  application route and shuts down cleanly before shared dependencies.
- **Operations:** One validated Grafana dashboard contains 20 panels. Eight
  bounded alert rules each map to one dedicated incident runbook. Public
  ALB/Caddy routes and power-control scripts remain unchanged.
- **Verification:** Focused observability fixtures passed `30/30`; the full
  backend suite passed `241/241`; lint, typecheck, build, diff-check, dashboard
  JSON, alert YAML/metric references, runbook mapping, runtime health/scrape,
  cardinality, sensitive-data, and secret scans passed. Full and production
  dependency audits report zero vulnerabilities.
- **Runtime evidence:** Local API checks returned `200` for `/health/live` and
  `/health/ready`; MongoDB and Redis readiness gauges reached `1`; normal and
  unmatched HTTP series changed while repeated `/metrics` scrapes created no
  self-series. Focused fixtures proved successful chat, BLOCK with zero
  provider calls, masked provider input, provider retry, and worker-job metric
  changes without a paid provider call.
- **Deferred:** Prompt-cache/completed-replay metrics remain absent until those
  execution paths are implemented. Full OpenTelemetry tracing, managed
  monitoring/notification delivery, and public Bull Board remain separately
  deferred; no fake zero series or Phase 11 implementation was added.
- **Local environment note:** The ignored developer `.env` still contains a
  malformed duplicated Redis assignment prefix. Release verification used a
  process-only local Redis override and did not modify or expose the file.

## Recommended Next Task

- Run a Phase 12 contract/readiness audit before any new Phase 12 implementation.
  Existing P12-09A deployment history remains a separate operational record;
  Phase 11 closure did not start or modify it.

## Active Lightsail Cost-Cut Migration

- **Task:** P12-09A — Replace the low-traffic public ECS demo with one
  cost-optimized Lightsail Docker Compose host while preserving ECS rollback.
- **Sizing evidence:** The current production images started together against
  isolated MongoDB/Redis dependencies and consumed approximately 35 MiB
  frontend, 54 MiB API, and 57 MiB worker memory at idle. The approved initial
  target is the public-IPv4 2 GB Linux plan; sustained pressure or OOM is the
  objective upgrade trigger to 4 GB.
- **Target topology:** Caddy exposes only 80/443 and routes to private Compose
  frontend/API services; worker exposes no port. Atlas, Upstash, Groq, ECR,
  Route 53, and the existing production secret remain authoritative.
- **Migration safety:** This was the pre-deep-stop contract. The current audit
  found ECS services at zero with ALB/NAT/public DNS absent. The retained
  snapshot and approved reconstruction path must restore and certify ECS before
  it is treated as the rollback boundary. No further destructive cleanup is
  permitted before Lightsail canary/public smoke and separate approval.
- **Current blockers:** The local non-root role can read Lightsail resources,
  but GitHub OIDC execution remains unproven. Production encryption selectors,
  protected smoke credentials, green current-SHA CI, ECS reconstruction,
  staging/rollback proof, Atlas static-IP allowlisting, and Lightsail
  provisioning remain required.
- **Historical live baseline:** `https://proxiai.me/`, `/health/live`, and
  `/health/ready` returned HTTP 200 before the later deep-stop state.
- **Historical release:** Git SHA
  `eb9607adaadabdecf3802b42c523cb1d1c146c7e`; it is rollback metadata, not a
  currently running public release.
- **Repository verification:** Lightsail Compose and Caddy validation,
  PowerShell parsing, IAM-policy JSON parsing, actionlint, ShellCheck, and both
  local production image builds passed. Frontend typecheck and production
  build passed. The committed backend produced 196/197 passing tests in the
  full isolated run; the sole BullMQ retry-attempt timing assertion passed on
  focused rerun, and backend lint/typecheck/build passed. The local frontend
  Vitest and broad ESLint processes did not terminate within bounded runs;
  neither deployment change touches frontend application code.
- **Repository isolation:** An unrelated in-progress
  `backend/src/scripts/seed-demo-organisation.ts` and `backend/package.json`
  edit remain outside this migration and must not be staged with deployment
  commits.
- **Historical deployment note:** The prior instruction to defer Phase 8 was
  superseded by explicit approval. Phase 8 is now complete; Phase 9 remains
  not started.
- **Autopsy accounting hardening:** Unknown Groq usage now remains unknown while
  synchronous budget checks reserve the approved model's maximum input/output
  liability separately. One interrupted request no longer creates an
  unconditional tenant lock when budget remains after that reservation.
  RequestLog append failure no longer falsely marks idempotency `COMPLETED`;
  the post-provider `PROCESSING` tombstone remains until its approved TTL.
- **Autopsy provider/stream hardening:** Groq terminal `x_groq.error` metadata
  becomes a normalized provider failure, missing usage is omitted rather than
  synthesized, and frontend SSE EOF without `done`/`error` becomes a safe
  `STREAM_INTERRUPTED` state while preserving partial output.
- **Autopsy auth hardening:** The five-second refresh concurrency grace and
  guarded atomic claim preserve the winning token family. Confirmed older
  replay still revokes the family. Operational refresh `5xx` preserves the
  cookie and frontend session for retry; terminal invalid-token `401` may
  clear it.
- **Autopsy proxy hardening:** Express trusts forwarding only from loopback,
  link-local, and private-network proxy peers. Login rate-limit tests prove
  trusted private forwarding and reject public-peer spoofing.
- **Autopsy deployment hardening:** ECR templates now use canonical
  `proxiai/frontend` and `proxiai/backend` names, the deployment policy scopes
  required repository/listener operations to ProxiAI resources, and ECS
  staging/production workflows retain previous task definitions with
  `if: always()` and automatically roll back failed functional smoke releases.
- **Autopsy classification:** Historical metadata-only rows remain unavailable
  by design. Phase 9 now persists newly completed content only under
  `ENCRYPTED_STORAGE`; plaintext storage remains prohibited.
- **Verification (2026-08-20):** Backend full suite passed 203/203 with the
  configured local Redis dependency; backend lint/typecheck/build passed.
  Frontend passed 12/12 tests with a non-semantic 30-second test timeout for a
  slow dynamic import, plus lint/typecheck/production build. Actionlint,
  ShellCheck, JSON parsing, diff checks, and focused secret scans passed for
  the deployment correction.

## Latest Task — AWS Demo Power Controls

- **Status:** Repository implementation completed on 2026-08-20. The live ECS,
  ALB, NAT Gateway, EIP, Route 53, and service counts were not changed during
  implementation.
- **Soft mode:** `soft-stop-demo.ps1` scales only frontend/API/worker to zero;
  `soft-start-demo.ps1` restores API/worker before frontend and verifies the
  public landing, liveness, and readiness endpoints.
- **Deep mode:** `deep-stop-demo.ps1` snapshots non-secret topology before
  scaling down, deletes only verified ALB/listener/rule and NAT resources,
  preserves target groups/ACM/Route 53 zone/NAT EIP/networking, and removes the
  dangling apex alias. `deep-start-demo.ps1` reconstructs NAT routing, ALB,
  HTTPS/HTTP listeners, priority 10/20 routing, DNS, ECS tasks, target health,
  and public smoke from that snapshot.
- **Safety:** Deep operations require `-Apply`; `-WhatIf` performs live
  read-only discovery and refuses ambiguous ownership. The ignored state file
  is `deploy/aws/.runtime/demo-power-state.json` and contains no secrets.
- **Snapshot hard gate:** `demo-power.ps1 snapshot` refreshes the non-secret
  recovery snapshot without changing AWS. Deep stop now creates, atomically
  persists, reads back, and validates every required ALB/listener/rule,
  Route 53, NAT/EIP/route-table, VPC/subnet, target-group, ACM, and ECS desired
  count field before its first AWS mutation. Any snapshot failure aborts.
- **IAM:** `deploy/aws/proxiai-demo-power-policy.json` is intentionally not
  attached by the deployment role. An account administrator must review and
  attach it only to `proxiai-deployment-role`.
- **Verification:** PowerShell parsing passed for all demo-control scripts;
  policy JSON parsing, live deep-stop preview, reconstructed deep-start preview,
  wrapper preview, current topology discovery, and `git diff --check` passed.
- **Next action:** Attach the scoped power policy, use soft mode for routine
  savings, and run deep stop only when accepting the longer ALB/NAT rebuild
  window. P12-09A Lightsail canary/public cutover remains incomplete.

## Do Not Forget

- Implement only the active PHASE task; keep deferred features out of the MVP.
- Preserve the documented chat security order.
- Tenant-owned queries always include `orgId`.
- JWT claims are never the sole authorization source; P2-06 must reload current User and Organisation state.
- JWT permissions stay canonical lowercase namespaced `UserPermission` values; never uppercase or remap them.
- Raw refresh tokens are never persisted or logged.
- Blocked prompts make zero provider calls.
- Never log sensitive content or secrets.
- Encryption failure never falls back to plaintext.
