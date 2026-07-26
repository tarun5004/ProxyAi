# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 2 — Authentication and Tenant Isolation
- **Task:** P2-04 — Login
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
- P2-03 — Password security completed on 2026-07-27

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
- Future user-creation services must call the password hashing helper before persistence; direct internal model writes can still bypass that service boundary.
- Compromised/common-password blocklisting, authentication rate limiting, and missing-user timing equalization remain deferred to approved authentication work.
- Argon2 is a native dependency; clean installation succeeded on the current Node 22 Windows environment, but deployment images must verify compatible native binaries.
- The approved local Argon2 profile averaged 31.78 ms across five manual samples. Production hardware and expected authentication concurrency still require benchmarking.
- `npm audit --omit=dev` reports zero production vulnerabilities. Full `npm audit` reports one high-severity development-only `brace-expansion` advisory through ESLint; it was not changed because it is unrelated to P2-03.

## Latest Task Record

- **Task:** P2-03 — Password Security
- **Status:** Completed
- **Files changed:** `docs/05_OPENAPI_SPEC.md`, `backend/package.json`, `backend/package-lock.json`, `backend/src/shared/security/password.ts`, `backend/src/shared/lib/logger.ts`, `backend/tests/password.test.mjs`, `backend/tests/logger.test.mjs`, `docs/15_PHASE.md`, `PROJECT_MEMORY.md`
- **Password behavior:** Adds separate new-password validation, Argon2id hashing, and verification responsibilities with NFC normalization and Unicode code-point limits.
- **Hash profile:** Uses explicit Argon2id `m=19456`, `t=2`, `p=1`, 32-byte hashes, and library-generated random salts. No bcrypt or plaintext fallback exists.
- **Verification safety:** Correct candidates return `true`, mismatches return `false`, and malformed or unsupported hashes produce a safe internal operational error without including the hash or candidate.
- **Logger safety:** Raw password and password-hash sentinels are absent from logger output; known protected paths contain `[REDACTED]`.
- **Automated tests:** Final `npm test` passed with 51 tests and 0 failures after a clean `npm ci`.
- **Typecheck:** `npm run typecheck` passed.
- **Build:** `npm run build` passed.
- **Clean install:** `npm ci` installed the locked dependency tree successfully, including the native Argon2 package.
- **Dependency audit:** Production dependency audit passed with zero findings; one unrelated ESLint-tree development advisory remains documented.
- **Source scans:** No application `console` calls, password logger calls, or bcrypt references were found. `passwordHash` appears only in the User schema/type and explicit logger-redaction paths.
- **Manual benchmark:** Five local Argon2 hashes completed in 30.66–34.33 ms, averaging 31.78 ms; no hashes or password values were printed.
- **Documentation:** OpenAPI now documents the 15–128 code-point policy, NFC normalization, no composition rules, and the remaining verifier-alignment gaps without claiming full NIST compliance.
- **Scope check:** No login, user-creation route, JWT, refresh token, controller, password reset, invitation flow, common-password service, authentication rate limit, missing-user timing equalization, or P2-04 implementation was added.
- **Recommended completed commit:** `feat(security): add Argon2id password protection`

## Recommended Next Task

- P2-04 — Login. Start with design review only after explicit approval.

## Do Not Forget

- Implement only the active PHASE task; keep deferred features out of the MVP.
- Preserve the documented chat security order.
- Tenant-owned queries always include `orgId`.
- Blocked prompts make zero provider calls.
- Never log sensitive content or secrets.
- Encryption failure never falls back to plaintext.
