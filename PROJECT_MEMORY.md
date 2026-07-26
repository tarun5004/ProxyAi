# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 2 — Authentication and Tenant Isolation
- **Task:** P2-03 — Password Security
- **Status:** Not Started

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

## Commands That Work

```bash
cd backend
npm test
npm run typecheck
npm run build
node --test tests/organisation.model.integration.mjs
node --test tests/user-team.model.integration.mjs
# After providing a valid .env:
npm run dev
npm start
```

## Known Blockers

- None.

## Documentation Gaps

- `docs/07_DEPLOYMENT_ARCHITECTURE.md` is referenced by existing documents but is missing. It is not required for P1-02 and must not be recreated during this task.
- The origin-variable mismatch is resolved in favor of `FRONTEND_ORIGIN`. Future token-TTL and encryption-key names still differ between `docs/03_TDD.md` and `docs/09_README.md` and must be resolved before their PHASE tasks.
- The OpenAPI readiness example includes `providerAvailable`, while P1-06 explicitly requires only MongoDB and Redis readiness. P1-06 follows the active phase scope; provider readiness remains deferred until provider abstraction exists.
- The current OpenAPI login contract accepts only email/password, while per-organisation email uniqueness requires an organisation slug lookup. The login contract must be corrected before P2-04.
- TDD/OpenAPI role examples include lowercase `super_admin`; tenant persistence now uses uppercase tenant-only roles and excludes `SUPER_ADMIN`. Platform identity requires separate approved design.

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
- P2-02 accepts a required stored `passwordHash` but does not prove it was produced by an approved hashing algorithm; P2-03 owns hashing and verification.

## Latest Task Record

- **Task:** P2-02 — User and Team Models
- **Status:** Completed
- **Files changed:** `backend/src/features/teams/team.types.ts`, `backend/src/features/teams/team.model.ts`, `backend/src/features/users/user.types.ts`, `backend/src/features/users/user.model.ts`, `backend/tests/team.model.test.mjs`, `backend/tests/user.model.test.mjs`, `backend/tests/user-team.model.integration.mjs`, `docs/15_PHASE.md`, `PROJECT_MEMORY.md`
- **Team behavior:** Adds strict tenant-owned Team records with backend-generated UUID v4 IDs, immutable tenant ownership, deterministic case-insensitive name keys, inactive defaults, timestamps, and approved indexes.
- **User behavior:** Adds strict tenant-owned User records with tenant-only roles, allowlisted permissions, per-organisation normalized email identity, disabled defaults, optional team membership, internal login state, timestamps, and safe credential projection/serialization.
- **Conditional validation:** `ACTIVE` `TEAM_LEAD` records require a UUID `teamId`; `DISABLED` team leads may remain unassigned during provisioning.
- **Index verification:** Awaited `TeamModel.init()` and `UserModel.init()` against the dedicated local MongoDB test database; duplicate IDs, same-org normalized team names, and same-org normalized emails failed with MongoDB error code `11000`, while cross-org normalized names/emails succeeded.
- **Automated tests:** `npm test` passed with 42 tests and 0 failures.
- **Mongo integration tests:** `node --test tests/user-team.model.integration.mjs` passed with 6 tests and 0 failures.
- **Typecheck:** `npm run typecheck` passed.
- **Build:** `npm run build` passed.
- **Security check:** Password hashes and internal account state are excluded by default; unknown fields, `SUPER_ADMIN`, platform permission strings, duplicate permissions, invalid IDs, and unsafe active team-lead state are rejected.
- **Scope check:** No authentication, hashing service, JWT, refresh token, route, controller, repository, invitation, generic tenant query middleware, cross-collection model validator, or P2-03 implementation was added.
- **Limitation:** Models alone do not prevent cross-organisation Team assignment; future assignment services must use trusted `{ orgId, teamId }`.
- **Repository note:** A pre-existing uncommitted change in `backend/src/shared/lib/logger.ts` was not modified or included in P2-02 commits.
- **Recommended completed commit:** `feat(users): add tenant-scoped user model`

## Recommended Next Task

- P2-03 — Password Security. Do not start it without explicit approval.

## Do Not Forget

- Implement only the active PHASE task; keep deferred features out of the MVP.
- Preserve the documented chat security order.
- Tenant-owned queries always include `orgId`.
- Blocked prompts make zero provider calls.
- Never log sensitive content or secrets.
- Encryption failure never falls back to plaintext.
