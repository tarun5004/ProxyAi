# ProxiAI Project Memory

This file is a progress log. The approved documents in `docs/` remain the source of truth.

## Current Work

- **Phase:** Phase 1 — Foundation and Dependency Readiness
- **Task:** Phase 1 closure
- **Status:** Completed

## Completed Tasks

- Phase 0 — Planning and repository baseline
- P1-01 — TypeScript foundation verified against the repository on 2026-07-24
- P1-02 — Environment validation completed on 2026-07-24
- P1-03 — Structured logger completed on 2026-07-24
- P1-04 — MongoDB connection completed on 2026-07-24
- P1-05 — Redis connection completed on 2026-07-24
- P1-06 — Health endpoints completed on 2026-07-24
- P1-07 — API foundation completed on 2026-07-24

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

## Commands That Work

```bash
cd backend
npm test
npm run typecheck
npm run build
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

## Known Technical Debt

- Logger redaction is path-based. Unknown, unexpected, or differently nested object shapes are not automatically safe; raw requests, provider errors, and environment objects must never be logged.
- Request-scoped child loggers are available, but full HTTP completion logging and `pino-http` integration were not added because they are outside the explicit P1-07 checklist; they remain deferred to the observability phase.
- Initial MongoDB connection failure is logged safely but is not retried automatically; the process remains live and not ready.
- Readiness currently reflects connection state only; it does not execute MongoDB or Redis probe commands.
- Future `AppError` callers must ensure optional `details` contain only safe client-correctable data.
- Unknown errors intentionally omit raw exceptions and stack traces from logs, improving data safety but reducing immediate diagnostic detail.

## Latest Task Record

- **Task:** Phase 1 Closure
- **Status:** Completed
- **Files changed:** `AGENTS.md`, `docs/15_PHASE.md`, `PROJECT_MEMORY.md`
- **Redis runtime:** Started an authenticated temporary official Redis container on localhost, received `PONG`, then removed the container and released its port.
- **Readiness check:** Compiled API returned `200` from `/health/ready` with MongoDB and Redis both `up`.
- **Liveness check:** Compiled API returned `200` from `/health/live` without dependency output.
- **Shutdown check:** Application `SIGTERM` flow emitted Redis disconnect, MongoDB disconnect, and shutdown-completed events; Redis ended cleanly.
- **Log-safety check:** MongoDB URI, Redis URL, and Redis credential were absent from application logs.
- **Automated tests:** `npm test` passed with 20 tests and 0 failures.
- **Typecheck:** `npm run typecheck` passed.
- **Build:** `npm run build` passed.
- **Commits:** `feat(config): add validated environment configuration`; `feat(logging): add redacted structured logger`; `feat(mongodb): add managed MongoDB connection`; `feat(redis): add managed Redis connection`; `feat(health): add liveness and readiness endpoints`; `docs(config): standardize frontend origin variable`; `feat(api): add secure API foundation`; `docs(progress): record Phase 1 completion`.
- **Scope check:** Phase 2 was not started.
- **Remaining risks:** Missing deployment architecture document, readiness-provider contract mismatch, and path-based logger redaction remain documented.
- **Recommended completed commit:** `docs(progress): record Phase 1 completion`

## Recommended Next Task

- P2-01 — Organisation Model. Do not start it without explicit approval.

## Do Not Forget

- Implement only the active PHASE task; keep deferred features out of the MVP.
- Preserve the documented chat security order.
- Tenant-owned queries always include `orgId`.
- Blocked prompts make zero provider calls.
- Never log sensitive content or secrets.
- Encryption failure never falls back to plaintext.
