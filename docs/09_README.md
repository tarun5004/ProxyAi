# ProxiAI Engineering Guide

ProxiAI is a multi-tenant, policy-aware AI gateway. It authenticates users,
derives trusted tenant scope, applies usage and sensitive-data controls before
provider egress, streams approved responses, and records safe accounting,
analytics, alert, and audit evidence.

The recruiter-facing project overview and local setup live in
[`../README.md`](../README.md). This document is the engineering-document index
and implementation-status boundary.

## Current Status

- Phases 1–11 are complete and regression-verified.
- Phase 12 is in progress.
- ECS/Fargate is the canonical staging, production, and rollback runtime.
- The code release gate passes locally, including isolated MongoDB,
  Redis/BullMQ, security, coverage, Docker, and deployment contracts.
- Live promotion remains blocked until required encryption selectors, protected
  smoke inputs, and healthy Redis/BullMQ worker capacity are available.
- Phase 13 has not started.

Executable source and passing tests are stronger truth than stale historical
notes. `docs/15_PHASE.md` is the official execution roadmap.

## Request Boundary

The chat path preserves this order:

```text
authentication
-> organisation and permission scope
-> validation
-> idempotency
-> rate limit
-> authoritative budget
-> PII detection/classification
-> risk and policy
-> provider routing
-> persistence
-> background jobs
```

Security invariants:

- client input never controls trusted `orgId`;
- every tenant-owned query includes tenant scope;
- `BLOCK` makes zero provider calls;
- `ALLOW_WITH_MASK` sends only the approved masked prompt;
- encryption failure never stores plaintext;
- `RequestLog` and `AuditLog` remain append-only;
- prompts, responses, credentials, tokens, cookies, and encryption keys never
  belong in logs, metrics labels, async payloads, or public errors.

## Implemented Domains

- organisation, user, team, conversation, message, refresh-session, request,
  billing, analytics, alert, audit, and recovery models;
- Argon2id password security, access JWTs, rotating refresh sessions, logout,
  current-state authentication, RBAC, and scoped authorization;
- deterministic PII detection, classification, risk, masking, and policy;
- provider adapter contracts, Groq streaming, retries, circuit breaker,
  fallback boundary, capability registry, and provider health;
- conversation APIs, authenticated SSE chat, safe Markdown UI, and encrypted
  owner-authorized message history;
- BullMQ billing, analytics, anomaly, health, heartbeat, and durable enqueue
  recovery workers;
- read-only admin dashboard, audited Phase 9 mutations, and safe audit export;
- bounded metrics, structured redacted logs, runbooks, liveness, readiness, and
  private worker health;
- Docker images, local Compose, ECS IaC, immutable deployment, smoke, rollback,
  and cost-control scripts.

## Explicit Deferrals and Limitations

- prompt-cache content storage and completed-response replay;
- attachments;
- email delivery provider integration;
- external penetration testing and internet-scale certification;
- cross-team runtime isolation until a team-owned resource exists;
- automated recovery of provider usage unavailable after an interrupted Groq
  stream without an authoritative provider lookup API;
- a second enabled production provider;
- high-availability or multi-region claims.

Unknown provider usage is never converted to zero. Budget/accounting behavior
uses approved conservative semantics and remains observable.

## Local Commands

Backend:

```powershell
cd backend
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Frontend:

```powershell
cd frontend
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

Full deterministic release gate:

```powershell
node scripts/verify-release.mjs
```

The release command enforces dependency audits, coverage thresholds, isolated
integration, security scans, builds, Docker images, and deployment/container
contracts. It exits non-zero on failure.

## Environment Rules

- `FRONTEND_ORIGIN` is the only CORS origin variable.
- Production CORS is exact-origin and credentialed; wildcard origins are
  prohibited.
- Backend and worker secrets stay in validated runtime configuration.
- Frontend bundles contain no provider, database, Redis, JWT, or encryption
  secrets.
- `.env` files, coverage output, deployment snapshots, and generated smoke
  credentials are ignored and must not be committed.

Use `backend/.env.example` and `frontend/.env.example` as the variable
inventories. Do not copy production values into documentation.

## Deployment Boundary

The approved public topology is:

```text
Route 53 -> HTTPS ALB
             |-> frontend ECS service :3000
             `-> API ECS service :8080

private worker ECS service -> MongoDB Atlas / Redis / BullMQ / Groq
```

- `/api/*` and `/health/*` route to the API without stripping `/api`;
- default traffic routes to the frontend;
- API readiness uses `/health/ready`;
- frontend health uses `/healthz`;
- worker `/healthz` and both metrics endpoints remain private;
- API and worker deploy before frontend;
- exact image digests, not mutable tags, are authoritative;
- failed smoke must preserve deterministic rollback inputs.

Executable Lightsail artifacts were removed from the active tree and remain
archived in Git history. ECS/Fargate is the only canonical release path.

## Document Map

| Document | Purpose |
| --- | --- |
| [`01_PRD.md`](01_PRD.md) | Product scope and acceptance boundaries |
| [`02_SDD.md`](02_SDD.md) | System components and responsibilities |
| [`03_TDD.md`](03_TDD.md) | Implementation contracts and flow details |
| [`04_DATABASE_DESIGN.md`](04_DATABASE_DESIGN.md) | Collections, indexes, retention, and Redis keys |
| [`05_OPENAPI_SPEC.md`](05_OPENAPI_SPEC.md) | HTTP, errors, schemas, and SSE contracts |
| [`06_SECURITY_THREAT_MODEL.md`](06_SECURITY_THREAT_MODEL.md) | Threats, trust boundaries, mitigations, and gates |
| [`07_DEPLOYMENT_ARCHITECTURE.md`](07_DEPLOYMENT_ARCHITECTURE.md) | ECS architecture, release, rollback, and operations |
| [`08_TESTING_STRATEGY.md`](08_TESTING_STRATEGY.md) | Coverage, integration, security, and release evidence |
| [`10_ADR.md`](10_ADR.md) | Architecture decisions |
| [`12_SEQUENCE_DIAGRAMS.md`](12_SEQUENCE_DIAGRAMS.md) | Auth, chat, provider, and worker sequences |
| [`13_CICD_DOCUMENTATION.md`](13_CICD_DOCUMENTATION.md) | CI/CD and immutable promotion |
| [`14_OBSERVABILITY_DOCUMENTATION.md`](14_OBSERVABILITY_DOCUMENTATION.md) | Logs, metrics, alerts, and runbooks |
| [`15_PHASE.md`](15_PHASE.md) | Official execution roadmap and current task |
