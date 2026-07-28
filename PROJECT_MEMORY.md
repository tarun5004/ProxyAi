# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 2 — Authentication and Tenant Isolation
- **Task:** P2-05 — Refresh Token Rotation
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
- P2-04 — Tenant-aware login completed on 2026-07-28

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
- Refresh-token rotation, reuse detection, family revocation, refresh/logout endpoints, authentication middleware, and RBAC remain unimplemented by design.

## Latest Task Record

- **Task:** P2-04 — Tenant-Aware Login
- **Status:** Completed
- **Files changed:** `docs/03_TDD.md`, `docs/04_DATABASE_DESIGN.md`, `docs/05_OPENAPI_SPEC.md`, `docs/06_SECURITY_THREAT_MODEL.md`, `docs/09_README.md`, `docs/12_SEQUENCE_DIAGRAMS.md`, `backend/.env.example`, `backend/package.json`, `backend/package-lock.json`, `backend/src/app.ts`, `backend/src/config/env.ts`, `backend/src/shared/lib/logger.ts`, `backend/src/features/auth/*`, focused and existing environment-backed tests, `docs/15_PHASE.md`, and `PROJECT_MEMORY.md`.
- **Login flow:** Validates strict external input, applies Redis limits, resolves Organisation slug to trusted `orgId`, loads User with `{ orgId, emailNormalized }`, verifies password with real/dummy Argon2 paths, persists initial refresh state, signs the access token, updates metadata, and sets the cookie.
- **JWT contract:** HS256 with `typ=at+jwt`, `iss=proxiai`, `aud=proxiai-api`, UUID `jti`, UUID `sessionId`, uppercase role, and unchanged canonical lowercase permissions.
- **Refresh security:** Separate UUID `tokenId`, `sessionId`, and `familyId`; unique SHA-256 token hash; TTL expiry; raw token absent from MongoDB and JSON.
- **Generic failures:** Real HTTP integration verified identical public `401` code/message for missing/suspended Organisation, missing/disabled User, and wrong password.
- **Rate limiting:** Real Redis database 15 verified opaque account/IP keys, 10 allowed attempts, eleventh `429`, 15-minute TTL, forwarded-header resistance, and clean disconnect.
- **Automated tests:** Final `npm test` passed with 78 tests and 0 failures.
- **Real integrations:** Organisation model `4/4`, User/Team model `6/6`, and tenant login with Redis `4/4` passed.
- **Typecheck:** `npm run typecheck` passed.
- **Build:** `npm run build` passed.
- **Security scans:** No application console calls, permission transformations, raw auth logging, bcrypt fallback, refresh/logout routes, or secret-bearing log fields were found.
- **Regression found and fixed:** Real integration exposed that Mongoose permission arrays are not structured-cloneable by `jose`; the token boundary now copies them into a plain array without changing values.
- **Scope check:** No refresh endpoint, rotation, reuse detection, family revocation behavior, logout, authentication middleware, RBAC middleware, password reset, invitation flow, durable audit collection, or P2-05 implementation was added.
- **Recommended completed commits:** `docs(auth): reconcile tenant-aware login contract`, `feat(config): add authentication security settings`, `feat(auth): add access and refresh token primitives`, `feat(auth): add tenant-aware login flow`, `test(auth): add login security coverage`, `docs(progress): record P2-04 completion`.

## Recommended Next Task

- P2-05 — Refresh Token Rotation. Start with design review only after explicit approval.

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
