# ProxiAI

**Policy-aware AI gateway for secure, governed, and observable enterprise AI usage.**

ProxiAI sits between an organisation's users and approved LLM providers. It
authenticates every request, enforces tenant policy, detects sensitive data,
masks or blocks risky prompts, streams approved responses, and records safe
operational metadata for billing, analytics, alerts, and audit workflows.

> **Status:** pre-production MVP. The application is implemented through Phase
> 11 and is undergoing final Phase 12 deployment certification. AWS ECS/Fargate
> is the canonical runtime. The current live recovery is externally blocked by
> Redis quota/credential rotation; see [Current limitations](#current-limitations).

## Why ProxiAI

Direct employee-to-provider AI usage creates risks that ordinary chat products
do not solve:

- sensitive prompts can leave the organisation without policy review;
- provider access and spending are difficult to govern per tenant;
- administrators need trustworthy audit and usage evidence;
- retries, failures, and streaming can create duplicate accounting effects.

ProxiAI provides one controlled path:

```text
User -> Auth -> Tenant scope -> Idempotency -> Rate limit -> Budget
     -> PII detection -> Risk -> Policy -> Provider routing -> Streaming
     -> Encrypted persistence -> Async billing/analytics/audit
```

## Recruiter Snapshot

- **Multi-tenant security:** trusted `orgId` is resolved server-side and applied
  to every tenant-owned query.
- **Policy-aware egress:** `BLOCK` makes zero provider calls;
  `ALLOW_WITH_MASK` sends only sanitized content.
- **Provider reliability:** canonical adapter contract, Groq integration,
  retries, circuit breaker, health state, and pre-token fallback boundaries.
- **Secure persistence:** metadata-only mode or AES-256-GCM encrypted message
  storage; encryption failure never falls back to plaintext.
- **Async correctness:** BullMQ billing, analytics, anomaly, heartbeat, and
  durable enqueue recovery with idempotent effects.
- **Release evidence:** deterministic lint, typecheck, test, coverage,
  integration, security, container, and deployment-contract gates.

## Architecture

```text
Browser
  |
  v
AWS Application Load Balancer
  |-- / and Next.js routes ----------> Frontend ECS service :3000
  `-- /api/* and /health/* ----------> API ECS service :8080

Private ECS worker service
  |-- BullMQ jobs and heartbeat
  |-- MongoDB Atlas
  `-- Redis / BullMQ

API
  |-- MongoDB Atlas
  |-- Redis / idempotency / rate limit
  `-- Groq provider adapter
```

The frontend, API, and worker use separate containers and ECS services. The
worker has no public listener. API and worker metrics are intentionally absent
from public ALB routes.

## Implemented Capabilities

### Identity and access

- organisation, user, team, refresh-session, and tenant-scoped models;
- Argon2id password hashing and safe login failure behavior;
- short-lived access JWTs plus rotating refresh sessions;
- database-backed current role and permission checks;
- permission and organisation/team scope middleware;
- idempotent logout and admin session revocation.

### Chat and policy

- conversation create, list, read, and manual rename;
- authenticated server-sent event streaming;
- deterministic PII detection, classification, scoring, and masking;
- `ALLOW`, `ALLOW_WITH_MASK`, and `BLOCK` policy decisions;
- safe Markdown rendering in the web workspace;
- encrypted message history when the organisation enables approved encrypted
  storage.

### Provider and reliability

- provider-independent completion and streaming contracts;
- deterministic fake provider and real Groq adapter;
- bounded retries with jitter, circuit breaker, ordered fallback, and health
  registry;
- no provider switch after the first streamed token;
- client-abort propagation and bounded graceful shutdown.

### Accounting and operations

- append-only `RequestLog` usage records and monthly `BillingRollup`;
- fail-closed budget accounting when authoritative usage is incomplete;
- BullMQ billing and analytics workers with duplicate-effect protection;
- tenant-scoped anomaly alerts and durable enqueue recovery;
- append-only `AuditLog`, safe CSV export, structured logs, metrics, readiness,
  liveness, and private worker health.

## Repository Structure

```text
backend/                 Express, Mongoose, Redis, BullMQ, security, workers
frontend/                Next.js App Router application
deploy/aws/              ECS/Fargate IaC, release, rollback, and power controls
deploy/local/            Local gateway configuration
docs/                    Product, architecture, security, testing, and roadmap
scripts/                 Release, security, integration, and contract checks
docker-compose.yml       Local gateway/frontend/API/worker/Redis stack
```

## Technology

- Node.js 22, TypeScript, Express, Zod, Mongoose
- Redis, BullMQ, Pino, Prometheus-compatible metrics
- Next.js App Router, React, Tailwind CSS
- Groq provider SDK behind a canonical adapter
- Docker, AWS ECR, ECS/Fargate, ALB, Route 53, ACM
- MongoDB Atlas and a BullMQ-compatible Redis service

## Local Development

### Prerequisites

- Node.js 22 and npm
- Docker Desktop for the full local stack and integration gates
- a reachable MongoDB database
- Groq credentials only when running real provider flows

### Install

```powershell
cd backend
npm ci
Copy-Item .env.example .env

cd ..\frontend
npm ci
Copy-Item .env.example .env.local
```

Populate local environment files with development values. Never commit `.env`
files or secret values.

### Run services separately

```powershell
# terminal 1
cd backend
npm run dev

# terminal 2
cd backend
npm run start:worker

# terminal 3
cd frontend
npm run dev
```

### Run the local container stack

The Compose stack uses an external/container-reachable MongoDB URI and its own
Redis container:

```powershell
$env:COMPOSE_MONGO_URI = '<container-reachable MongoDB URI>'
docker compose up --build
```

Open `http://localhost:3001` unless `PROXIAI_HTTP_PORT` overrides it.

## Configuration

`backend/.env.example` and `frontend/.env.example` are the canonical variable
inventories. Important boundaries include:

- `FRONTEND_ORIGIN`: exact credentialed CORS origin; no wildcard or alias;
- `MONGO_URI` and `REDIS_URL`: backend/worker-only connection values;
- `JWT_ACCESS_SECRET` and `AUTH_RATE_LIMIT_SECRET`: backend-only secrets;
- `MESSAGE_ENCRYPTION_KEYS_JSON` and
  `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION`: versioned message keys;
- `GROQ_API_KEY`, `GROQ_MODEL`, `PROVIDER_REQUEST_TIMEOUT_MS`: provider config;
- `BACKEND_INTERNAL_ORIGIN`: frontend server-side backend origin;
- `COMMIT_SHA`: immutable release identity exposed only as safe metadata.

All required production values are validated at startup. There are no hidden
production fallbacks for security-sensitive configuration.

## Safe Demo Provisioning

Local administrator provisioning:

```powershell
cd backend
npm run dev:seed-admin
```

Restricted recruiter-demo provisioning uses protected environment values:

```powershell
cd backend
$env:DEMO_SEED_ENABLED = 'true'
$env:DEMO_PUBLIC_PASSWORD = '<protected value>'
npm run seed:demo
```

The demo tenant is `novastack`; its user is an `EMPLOYEE` with only
`chat:send` and `chat:view_own`. The password is never stored in source or
printed by the application.

## Verification

### Focused commands

```powershell
cd backend
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build

cd ..\frontend
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

### Canonical release gate

```powershell
node scripts/verify-release.mjs
```

The release harness fails closed and covers dependency audit, lint, typecheck,
unit tests, coverage thresholds, isolated Mongo/Redis/BullMQ integration,
security scans, builds, Docker images, and deployment/container contracts.

Coverage gates:

- backend lines: at least 75%;
- frontend lines: at least 60%;
- approved critical pure modules: at least 90% branch coverage.

## Health and Operations

- API liveness: `GET /health/live`
- API readiness: `GET /health/ready`
- worker health: private container-local `GET /healthz` on the configured
  worker metrics port
- API metrics: private `GET /metrics`

Readiness requires MongoDB and Redis. Worker health requires managed workers and
heartbeats to be current. Neither metrics endpoint is publicly routed.

## AWS ECS Deployment

The approved production path promotes immutable image digests through the
existing ECS architecture. Do not use mutable `latest` tags.

Power controls:

```powershell
.\deploy\aws\demo-power.ps1 snapshot
.\deploy\aws\demo-power.ps1 soft-start -Apply
.\deploy\aws\demo-power.ps1 soft-stop -Apply
.\deploy\aws\demo-power.ps1 deep-start -Apply
.\deploy\aws\demo-power.ps1 deep-stop -Apply
```

Deep stop requires a validated recovery snapshot before any AWS mutation.
Release and rollback procedures are documented in:

- [Deployment Architecture](docs/07_DEPLOYMENT_ARCHITECTURE.md)
- [CI/CD Documentation](docs/13_CICD_DOCUMENTATION.md)
- [Manual AWS Actions](deploy/aws/MANUAL_ACTIONS.md)

## Security Boundaries

- ordinary client input never controls trusted `orgId`;
- every tenant-owned database operation includes tenant scope;
- passwords, tokens, cookies, prompts, responses, connection strings, and
  encryption material are excluded from logs;
- `passwordHash` is hidden from normal queries and serialization;
- blocked prompts make zero provider calls;
- masked prompts cannot leak the original input to providers;
- `RequestLog` and `AuditLog` are append-only;
- encryption/decryption requires tenant and resource-bound AAD;
- Redis idempotency fails closed; prompt caching remains deferred until its
  safe encrypted/reference prerequisites exist.

## Current Limitations

- The public ECS recovery is externally blocked until Redis quota is available
  and the exposed provider credential is rotated in protected configuration.
- One interrupted provider request can leave authoritative usage unknown;
  budget accounting intentionally fails closed rather than inventing usage.
- Prompt-cache response storage and completed-response replay remain deferred.
- Attachments and email delivery provider integration are not implemented.
- The retained Lightsail files are an unexecuted cost experiment, not the
  approved deployment architecture.
- External penetration testing and long-duration production observation are not
  represented as complete.

## Documentation

- [Product Requirements](docs/01_PRD.md)
- [Software Design](docs/02_SDD.md)
- [Technical Design](docs/03_TDD.md)
- [Database Design](docs/04_DATABASE_DESIGN.md)
- [OpenAPI Contract](docs/05_OPENAPI_SPEC.md)
- [Security Threat Model](docs/06_SECURITY_THREAT_MODEL.md)
- [Testing Strategy](docs/08_TESTING_STRATEGY.md)
- [Execution Roadmap](docs/15_PHASE.md)
- [Project Memory](PROJECT_MEMORY.md)

## License

No public license has been declared. Treat the repository as all rights
reserved unless the owner adds an explicit license.
