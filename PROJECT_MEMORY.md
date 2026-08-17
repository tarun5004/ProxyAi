# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 5 — Chat, Conversations, and Streaming
- **Task:** Awaiting approval before P5-04 — List and Read Conversation APIs
- **Status:** P5-03 Create Conversation API completed

## Completed Tasks

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

## Important Decisions

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
- Express forwarded-header trust remains disabled, so ordinary `X-Forwarded-For` values cannot change the rate-limit IP identity.
- Access tokens use `jose`, HS256, protected-header `typ: at+jwt`, issuer `proxiai`, audience `proxiai-api`, type `access`, and validated `ACCESS_TOKEN_TTL_MINUTES`.
- JWT role claims serialize uppercase `UserRole` values. Permission claims serialize canonical lowercase namespaced `UserPermission` values without transformation.
- P2-06 must allow only HS256, validate the complete token contract, reload current User and Organisation state, and validate every current permission against the existing allowlist.
- Initial login creates separate backend UUID v4 `tokenId`, `sessionId`, and `familyId` values. The access token uses `sessionId`, not `familyId`.
- Refresh tokens are 32 random bytes, only SHA-256 hashes are persisted, and raw values exist only long enough to set the response cookie.
- The host-only `proxiai_refresh` cookie is HttpOnly, Secure only in production, SameSite Lax, scoped to `/api/v1/auth`, and has no Domain attribute.
- SameSite Lax assumes the frontend and API are deployed same-site. Cross-site cookie design is not part of P2-04.
- Initial refresh-token persistence is critical and occurs before access-token signing or cookie response. Login metadata updates and structured security-event logging are best-effort.
- P2-04 emits only `auth.login_succeeded`, `auth.login_failed`, and `auth.login_operational_error`; durable append-only audit persistence remains Phase 9.
- P2-05 exclusively owns refresh rotation, reuse detection, family revocation, and the refresh endpoint.
- Refresh-token lookup may start with unique `tokenHash` because trusted `orgId` is not known until the database record is loaded.
- Refresh rotation uses a conditional MongoDB `findOneAndUpdate` gate scoped by old token `_id`, trusted `orgId`, `usedAt: null`, `revokedAt: null`, and future `expiresAt`.
- Successful refresh preserves `orgId`, `userId`, `sessionId`, and `familyId`; it changes `tokenId`, raw token, token hash, and expiry.
- Refresh access tokens are signed from current active User and Organisation state, not from stale JWT claims.
- Refresh failures for absent, unknown, expired, used, revoked, disabled-User, and suspended-Organisation states return the same public `401 INVALID_REFRESH_TOKEN` response.
- Used-token replay and concurrent atomic-gate losers revoke the trusted token family and emit `auth.refresh_reuse_detected`.
- Refresh operational failures after old-token consumption revoke the family, clear the cookie, emit `auth.refresh_operational_error`, and return generic `503 AUTH_TEMPORARILY_UNAVAILABLE`.
- P2-05 emits only `auth.refresh_succeeded`, `auth.refresh_failed`, `auth.refresh_reuse_detected`, and `auth.refresh_operational_error`; durable audit persistence remains Phase 9.
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
```

## Known Blockers

- None.

## Documentation Gaps

- `docs/07_DEPLOYMENT_ARCHITECTURE.md` is referenced by existing documents but is missing. It is not required for P1-02 and must not be recreated during this task.
- The origin-variable and authentication token-TTL naming mismatches are resolved. Future encryption-key names still require reconciliation before their PHASE task.
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
- Organisation indexes are currently declared in the Mongoose schema; production-safe index migration tooling has not been introduced.
- User/Team schemas cannot prove cross-collection organisation ownership by themselves. Team assignment and `createdBy` checks require future trusted service/repository lookups using `orgId`.
- Future user-creation services must call the password hashing helper before persistence; direct internal model writes can still bypass that service boundary.
- Compromised/common-password blocklisting remains deferred. Login rate limiting and missing-user timing equalization are now implemented.
- Argon2 is a native dependency; clean installation succeeded on the current Node 22 Windows environment, but deployment images must verify compatible native binaries.
- The approved local Argon2 profile averaged 31.78 ms across five manual samples. Production hardware and expected authentication concurrency still require benchmarking.
- `npm audit --omit=dev` reports zero production vulnerabilities. Full `npm audit` reports one high-severity development-only `brace-expansion` advisory through ESLint; it was not changed because it is unrelated to P2-03.
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
- Cross-tenant scope helpers deny mismatched trusted org/team resources, but full CRUD proof remains deferred until tenant-owned business routes exist.
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
- P4-10 emits structured application events only. Durable append-only audit persistence remains owned by Phase 9.
- Phase 4 implementation is complete, but two runtime gates remain explicitly deferred: `BLOCK` must cause zero provider calls, and `ALLOW_WITH_MASK` must send only masked `providerPrompt`.
- Both deferred gates must be proven when the first Phase 5 chat pipeline wires policy decisions to provider execution; no temporary provider/chat route will be created merely to mark them passed.
- P5-01 resolves the Conversation documentation conflict in favour of the approved task contract: plain `title`, default `"New conversation"`, nullable `lastMessageAt`, and no `status`, `titleEnc`, or `titlePreview` fields.
- Conversation title encryption remains deferred to Phase 9. Future title-writing APIs must follow the approved retention behavior and must not generate titles from sensitive prompt content without the required protection.
- Conversation ownership identifiers `conversationId`, `orgId`, and `userId` are immutable UUID v4 values; `conversationId` is generated only by the backend.
- Conversation declares only the approved unique `{ conversationId: 1 }` index and owner-list `{ orgId: 1, userId: 1, lastMessageAt: -1 }` index.
- Future tenant-owned Conversation queries must use trusted `orgId` plus authenticated `userId` and the resource identifier where applicable; ordinary client input never establishes tenant scope.
- Phase 5 UI reference: light/white theme, ProxyAI green accent, minimal Claude-style layout, left conversation sidebar, center chat workspace, right policy/risk panel, subtle borders/shadows, clean whitespace, and no generic AI-dashboard styling.
- P5-02 resolves Message persistence conflicts with immutable UUID v4 `messageId`, `orgId`, `conversationId`, and `userId`, plus uppercase `USER`, `ASSISTANT`, and `SYSTEM` roles.
- Message documents have no plaintext content field. Optional `contentEnc` uses a strict encrypted shape and is excluded from normal selection and serialization; `contentStored` defaults to `false` and must match encrypted-content presence on creation.
- Message is append-oriented and uses `createdAt` only. `tokenCount` is optional but must be a non-negative safe integer.
- Message declares only unique `{ messageId: 1 }` and tenant-conversation `{ orgId: 1, conversationId: 1, createdAt: 1 }` indexes.
- `requestId`, provider/model metadata, `expiresAt`/TTL, and the encryption service remain deferred. Actual AES-256-GCM encryption and retention writing remain Phase 9 responsibilities.
- Future Message reads must first establish Conversation ownership and query with trusted tenant/owner scope; client-supplied `orgId`, `userId`, or conversation ownership is never authoritative.
- `POST /api/v1/conversations` requires a valid access token and current `chat:send` permission before request validation or persistence.
- Create-conversation input is a strict Zod object containing only optional `title`; client-supplied `orgId`, `userId`, or unknown fields are rejected.
- Conversation ownership is copied only from trusted `request.auth.orgId` and `request.auth.userId`; the repository receives no client-selected ownership fields.
- The create response uses the standard `201` success envelope with request ID and a safe Conversation summary that excludes tenant IDs and MongoDB internals.
- The mandatory Phase 2 cross-tenant read/update/delete runtime gate remains deferred because P5-03 creates resources but exposes no read/update/delete operation. P5-04 must prove cross-tenant and cross-user read denial.

## Latest Task Record

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
- **Audit boundary:** P4-10 provides safe structured events; durable append-only audit persistence remains Phase 9.
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
- **Limitation:** This task does not add durable audit storage; Phase 9 owns append-only audit persistence. End-to-end blocked/masked provider gates remain pending chat integration.
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

## Recommended Next Task

- Wait for approval before P5-04 — List and Read Conversation APIs; do not start automatically.

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
