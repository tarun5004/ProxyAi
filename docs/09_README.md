# ProxiAI

> Enterprise AI Gateway and Audit Platform — beginner-friendly solo-developer MVP.

ProxiAI is a multi-tenant middleware platform that sits between an organisation's employees and external Large Language Model providers. It checks prompts for sensitive data, applies organisation policy, selects an eligible provider, handles limited provider failures, streams the response to the user, and records safe operational metadata for administration and auditing.

This repository is designed as a **five-week MVP for one developer**. It intentionally uses a modular monolith, one primary database, one Redis instance, a small provider set, deterministic policy rules, and a limited deployment topology. Advanced enterprise capabilities are documented as future work and are not treated as completed features.

---

## 1. Project Status

**Current status:** Design and documentation baseline.

The repository documentation defines the approved MVP scope, system design, implementation approach, database model, API contract, security controls, deployment model, and testing strategy.

Before claiming a feature as available, verify that its implementation exists in the source code and that the corresponding tests pass.

---

## 2. Problem Being Solved

Organisations increasingly use multiple AI providers without one controlled access layer. This creates several problems:

- administrators cannot clearly see how AI tools are being used;
- sensitive information may be sent to third-party providers without policy checks;
- provider outages can interrupt employee workflows;
- usage and cost are fragmented across provider accounts;
- security and compliance teams lack a consistent audit trail;
- prompt and response retention is often controlled by external vendors rather than the organisation.

ProxiAI provides one controlled gateway for these interactions.

---

## 3. MVP Capabilities

The approved MVP includes:

- organisation-scoped authentication and authorization;
- employee, team lead, organisation administrator, and platform administrator roles;
- access tokens and rotating refresh tokens;
- refresh-token reuse detection;
- conversation and message management;
- prompt submission through an authenticated streaming endpoint;
- rule-based sensitive-data detection;
- sensitive-data classification and explainable risk scoring;
- policy decisions: `ALLOW`, `ALLOW_WITH_MASK`, and `BLOCK`;
- provider adapters behind one common TypeScript interface;
- a small fixed set of LLM providers;
- manual and simple automatic provider routing;
- provider capability, health, latency, budget, and cost inputs;
- retry with exponential backoff and jitter;
- circuit breaker and pre-stream provider fallback;
- Redis-backed prompt caching where safe;
- Redis-backed idempotency protection;
- metadata-only and encrypted-storage retention modes;
- safe request metadata, billing rollups, alerts, and append-only audit records;
- BullMQ background workers;
- administrator dashboard APIs;
- cursor-based pagination and filtering;
- structured logs, core metrics, and health endpoints;
- Docker-based local development;
- a simple GCP deployment path.

---

## 4. Deliberately Deferred Features

The following capabilities are **not part of the beginner MVP**:

- SSO or SAML;
- MFA;
- BYOK implementation;
- approval workflow for `REQUIRE_APPROVAL`;
- ML-based intent classification;
- ML or NER-based PII detection;
- Kafka or a separate event-streaming platform;
- Kubernetes or service mesh;
- multi-region deployment;
- distributed circuit-breaker state;
- seamless provider switching after streaming has started;
- full-text search over encrypted prompt content;
- customer-managed encryption keys or HSM integration;
- tamper-proof external audit storage;
- advanced enterprise policy language;
- automated compliance certification;
- native mobile applications.

These items must not be presented as implemented unless they are explicitly added later.

---

## 5. High-Level Request Flow

A normal chat request follows this order:

1. The client sends an authenticated request with a unique client request ID.
2. Authentication resolves the user and organisation.
3. RBAC verifies that the user may send a prompt.
4. Redis checks the idempotency key.
5. Rate-limit and input validation checks run.
6. The PII pipeline detects and classifies sensitive spans.
7. The risk scorer produces an explainable score.
8. The policy engine returns `ALLOW`, `ALLOW_WITH_MASK`, or `BLOCK`.
9. A blocked prompt stops immediately and is never sent to a provider.
10. An allowed prompt is checked against the safe prompt cache.
11. The routing engine filters and scores eligible providers.
12. The selected provider runs through timeout, retry, and circuit-breaker controls.
13. If the provider fails before streaming begins, the next eligible provider may be tried.
14. The response is streamed to the client.
15. Safe completion data is persisted according to the organisation retention mode.
16. Background jobs update billing, analytics, anomalies, alerts, and audit records.

### Critical security order

```text
Authenticate
  -> Authorize
  -> Validate
  -> Idempotency / Rate Limit
  -> PII Detection
  -> Risk Scoring
  -> Policy Decision
  -> Cache Check
  -> Provider Routing
  -> Provider Call
  -> Safe Persistence and Async Processing
```

Policy evaluation must always happen before provider routing.

---

## 6. Architecture

The MVP uses a **modular monolith** with feature-based folders.

```text
proxiai/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   ├── anomaly/
│   │   │   ├── audit/
│   │   │   ├── auth/
│   │   │   ├── billing/
│   │   │   ├── chat/
│   │   │   ├── pii/
│   │   │   ├── providers/
│   │   │   ├── retention/
│   │   │   └── routing/
│   │   ├── shared/
│   │   │   ├── errors/
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   └── responses/
│   │   ├── workers/
│   │   └── server.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── services/
│   ├── package.json
│   └── Dockerfile
├── docs/
├── docker-compose.yml
├── .env.example
└── README.md
```

The API and worker may use the same backend image but run with different commands.

---

## 7. Technology Stack

| Layer | Technology | MVP use |
|---|---|---|
| Frontend | React + TypeScript + Tailwind CSS | Employee chat and admin UI |
| Backend | Node.js + Express + TypeScript | HTTP API and streaming |
| Validation | Zod | Environment and request validation |
| Database | MongoDB | Tenant data, metadata, audit, billing, alerts |
| Cache | Redis | Prompt cache, idempotency, rate limits, provider health |
| Jobs | BullMQ | Billing, analytics, anomaly, provider health, and failed-enqueue recovery; email delivery deferred to Phase 8 |
| Logging | Pino | Structured and redacted application logs |
| Metrics | Prometheus | Core API, provider, cache, and queue metrics |
| Dashboard | Grafana | Operational visualisation |
| Email | Provider not selected | Safe `alert.created` contract approved; delivery deferred pending provider and configuration approval |
| Payment | Razorpay | Optional subscription integration after core flow |
| Containerization | Docker + Docker Compose | Local and production packaging |
| Deployment | GCP Cloud Run for API | Managed HTTP runtime |
| Secrets | Environment variables locally; GCP Secret Manager in deployment | Secret injection |

---

## 8. Main Domain Components

### Authentication

- short-lived access token;
- refresh token stored in an `httpOnly`, `Secure`, `SameSite` cookie;
- refresh tokens stored as hashes;
- refresh token is single-use;
- reuse detection revokes the full token family.

### PII pipeline

1. Detection
2. Classification
3. Risk scoring
4. Policy handoff

MVP detection is rule-based and deterministic. It must cover common contact details, financial patterns, government identifiers, credentials, API keys, connection strings, and configured confidential terms.

### Policy engine

Supported MVP decisions:

- `ALLOW`
- `ALLOW_WITH_MASK`
- `BLOCK`

The original sensitive prompt must never be sent when masking is required.

### Provider abstraction

Every provider implements a shared contract similar to:

```ts
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(tokensIn: number, tokensOut: number): number;
}
```

Application code outside the provider feature should not depend directly on a provider SDK.

### Routing

The MVP routing engine may consider:

- requested/manual provider;
- prompt intent and complexity heuristics;
- provider capabilities;
- context-window requirement;
- provider health;
- rolling latency;
- estimated cost;
- remaining organisation budget.

The routing decision must produce a human-readable reason.

### Resilience

- timeout on every provider call;
- retry only transient failures such as timeout, `429`, and selected `5xx` responses;
- no retry for invalid credentials or invalid requests;
- exponential backoff with jitter;
- circuit breaker with `CLOSED`, `OPEN`, and `HALF_OPEN` states;
- fallback only before response streaming has started;
- clear stream error if the provider fails after output has begun.

---

## 9. Data Storage Rules

### Tenant isolation

Every tenant-owned record must include `orgId`. The server derives `orgId` from the authenticated context; the client cannot select another tenant by passing an arbitrary organisation ID.

All repository queries for tenant-owned data must include the authenticated `orgId`.

### Retention modes in MVP

| Mode | Stored data |
|---|---|
| `METADATA_ONLY` | Provider, model, token counts, cost, latency, status, PII score, timestamps |
| `ENCRYPTED_STORAGE` | Metadata plus encrypted prompt and response content |

`NO_STORAGE` and fully configurable custom retention remain deferred unless the implementation explicitly adds and tests them.

### Sensitive data

- never store raw access or refresh tokens;
- never store provider API keys in plaintext;
- never log raw prompts or responses;
- never put raw prompts into Prometheus labels;
- never put raw prompt content into BullMQ jobs unless the job absolutely requires it and the security design is updated;
- never fall back to plaintext storage when encryption fails;
- never include raw detected sensitive values in an audit record.

---

## 10. Core MongoDB Collections

The approved database design includes:

- `organisations`
- `teams`
- `users`
- `refreshTokens`
- `conversations`
- `messages`
- `requestLogs`
- `auditLogs`
- `billingRollups`
- `alerts`
- `providerHealth`

Important indexes include organisation-and-time compound indexes for request logs and audit logs, conversation-and-time indexes for messages, and organisation-and-period indexes for billing rollups.

See [`docs/04_DATABASE_DESIGN.md`](docs/04_DATABASE_DESIGN.md) for schemas and index details.

---

## 11. API Conventions

### Base path

```text
/api/v1
```

### Standard success response

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "request-id"
  }
}
```

### Standard error response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "requestId": "request-id"
  }
}
```

Unknown errors must return a generic message and must not expose a stack trace.

### Important endpoint groups

```text
/api/v1/auth/*
/api/v1/conversations/*
/api/v1/chat/stream
/api/v1/admin/dashboard
/api/v1/admin/logs
/api/v1/admin/billing
/api/v1/admin/alerts
/api/v1/admin/policy
/api/v1/admin/retention
/api/v1/admin/audit/export
/health/live
/health/ready
```

The complete contract is defined in [`docs/05_OPENAPI_SPEC.md`](docs/05_OPENAPI_SPEC.md).

---

## 12. Streaming Contract

The chat endpoint uses an authenticated `POST` request and a streaming response. The frontend should consume the response using `fetch()` stream handling rather than browser `EventSource`, because the request requires an authorization header and a JSON body.

Typical stream events:

```text
event: metadata
data: {"requestId":"...","provider":"..."}

event: token
data: {"text":"Hello"}

event: done
data: {"tokensUsed":120,"cacheHit":false}
```

On a mid-stream provider failure:

```text
event: error
data: {"code":"STREAM_INTERRUPTED","message":"The provider response was interrupted."}
```

The MVP does not splice output from a second provider into an already-started response.

---

## 13. Redis Responsibilities

Redis has distinct responsibilities and key namespaces.

| Responsibility | Example key | Default behavior if Redis fails |
|---|---|---|
| Prompt cache | `cache:prompt:{opaqueHmac(canonicalCacheInput)}` | Fail open and call provider; implementation deferred pending Phase 9 prerequisites |
| Idempotency | `idempotency:{orgId}:{clientRequestId}` | Fail closed for paid request safety |
| Provider health | `health:{providerId}` with 120-second TTL | Missing/error becomes `UNKNOWN`; use static capability and local circuit defaults |
| Rate limit | `rate:{orgId}:{userId}:{window}` | Follow documented environment policy |
| Queue data | BullMQ-managed keys | Async work pauses or retries |

Prompt cache entries must be organisation-scoped and must not be created for prompts with detected PII.

---

## 14. BullMQ Workers

Approved worker responsibilities:

- billing rollups;
- analytics rollups;
- anomaly detection;
- provider health checks;
- failed-enqueue recovery;
- optional retention cleanup where database TTL does not already solve the requirement.

Phase 7 email delivery has an explicit waiver. Its safe `alert.created`
contract is retained, but implementation moves to Phase 8 after provider,
sender, timeout, error mapping, and template content are approved.

If billing or analytics enqueue fails after RequestLog persistence, a safe
tenant-scoped recovery record and bounded backfill scan reconstruct the job
from allowlisted RequestLog metadata. RequestLog is never mutated, and existing
worker ledgers prevent duplicate effects.

Every job handler must be idempotent because BullMQ provides at-least-once processing behavior.

The Phase 7 failed-job source is BullMQ's retained failed set plus safe
structured logs. Bull Board is deferred to optional controlled Phase 10 tooling
and must never be publicly exposed.

The API and worker failure domains must remain separate: an email failure must not delay the user-facing chat response.

---

## 15. Local Development Prerequisites

Install the following:

- Node.js 20 or newer;
- npm;
- Docker Desktop with Docker Compose;
- Git;
- a code editor such as VS Code;
- API credentials for the provider adapters enabled in your local environment.

You do not need Kubernetes, Kafka, or a local cloud emulator for the MVP.

---

## 16. Environment Configuration

Create local environment files from the examples provided by the repository.

```bash
cp .env.example .env
```

Recommended backend variables:

```env
NODE_ENV=development
PORT=8080
FRONTEND_ORIGIN=http://localhost:3001

MONGO_URI=mongodb://localhost:27017/proxiai
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=replace-with-base64url-encoded-32-byte-random-secret
AUTH_RATE_LIMIT_SECRET=replace-with-a-different-base64url-encoded-32-byte-random-secret
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
DEV_ADMIN_PASSWORD=proxiai-local-admin-only
CHAT_RATE_LIMIT_FREE_USER_RPM=10
CHAT_RATE_LIMIT_FREE_ORG_RPM=60
CHAT_RATE_LIMIT_PRO_USER_RPM=30
CHAT_RATE_LIMIT_PRO_ORG_RPM=300
CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM=60
CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM=1200
IDEMPOTENCY_PROCESSING_TTL_SECONDS=300
IDEMPOTENCY_COMPLETED_TTL_SECONDS=3600

CONTENT_ENCRYPTION_KEY=replace-with-a-valid-32-byte-key

GROQ_API_KEY=
GEMINI_API_KEY=
THIRD_PROVIDER_API_KEY=

LOG_LEVEL=debug
```

Email-provider variables are intentionally omitted. Do not add an API key,
sender identity, timeout, or provider-specific configuration until the email
provider and template content are explicitly approved and added to validated
backend environment configuration.

Generate each authentication secret independently:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Frontend variables may include:

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

### Rules

- never commit a populated `.env` file;
- never use production credentials locally;
- validate environment variables when the application starts;
- fail startup when a required variable is missing or malformed;
- document the exact key format expected by encryption code;
- use different secrets for local, staging, and production.

---

## 17. Quick Start with Docker Compose

The final commands depend on the actual repository scripts. A typical MVP setup is:

```bash
git clone <repository-url>
cd proxiai
cp .env.example .env
docker compose up --build
```

Expected local services:

| Service | Default URL |
|---|---|
| Frontend | `http://localhost:3001` |
| Backend API | `http://localhost:8080` |
| Liveness | `http://localhost:8080/health/live` |
| Readiness | `http://localhost:8080/health/ready` |
| MongoDB | `mongodb://localhost:27017` |
| Redis | `redis://localhost:6379` |

Do not claim these commands work until the corresponding Docker and package files exist in the repository.

---

## 18. Manual Development Setup

### Backend

```bash
cd backend
npm install
npm run dev
```

### Worker

In a second terminal:

```bash
cd backend
npm run worker:dev
```

### Frontend

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

### Infrastructure

MongoDB and Redis can still run through Docker:

```bash
docker compose up mongo redis
```

The exact script names must match `package.json`. Update this README when implementation chooses different names.

---

## 19. Recommended npm Scripts

The backend should provide a small, understandable script set:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "worker:dev": "tsx watch src/worker.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "worker:start": "node dist/worker.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

The frontend should provide equivalent `dev`, `build`, `lint`, `typecheck`, and `test` scripts.

This block is a recommended contract, not proof that scripts already exist.

---

## 20. Database Initialization

The repository should create indexes through an explicit migration or initialization script rather than relying only on implicit Mongoose index creation in production.

Typical flow:

```bash
cd backend
npm run db:migrate
npm run db:seed
```

Seed data should contain only fake values and should create:

- one development organisation;
- one employee;
- one team lead;
- one organisation administrator;
- safe default policy thresholds;
- a low development token budget;
- enabled fake or development provider configuration.

Never seed real credentials or real employee data.

For the minimal local login bootstrap, configure `DEV_ADMIN_PASSWORD` in
`backend/.env`, then run:

```bash
cd backend
npm run dev:seed-admin
```

The command creates or reconciles the development-only `proxiai-demo`
organisation and `admin@proxiai.local` organisation administrator. It prints
the local login password to the invoking terminal, never the password hash,
and refuses to run unless `NODE_ENV=development`. Re-running the command with
the same password is idempotent. This is provisioning only; the MVP does not
expose self-service registration.

---

## 21. Running Tests

Run static validation first:

```bash
npm run lint
npm run typecheck
```

Run backend tests:

```bash
cd backend
npm test
```

Run frontend tests:

```bash
cd frontend
npm test
```

Run critical end-to-end tests after the local stack is ready:

```bash
npm run test:e2e
```

### Release-blocking tests

A release must fail if any of these scenarios fail:

- a user can access another organisation's resource;
- a team lead can access another team's restricted data;
- a blocked prompt reaches a provider;
- an unmasked sensitive prompt reaches a provider after a mask decision;
- ten duplicate client request IDs create more than one provider call;
- refresh-token reuse does not revoke the token family;
- encryption failure stores plaintext;
- raw prompt content appears in logs or metrics;
- a BullMQ retry produces duplicate billing;
- unknown errors expose stack traces.

See [`docs/08_TESTING_STRATEGY.md`](docs/08_TESTING_STRATEGY.md).

---

## 22. Health Checks

### Liveness

```text
GET /health/live
```

Confirms that the process is running. It should not perform slow dependency checks.

### Readiness

```text
GET /health/ready
```

Confirms that the API can serve traffic. The MVP readiness check should verify:

- MongoDB connection;
- Redis connection;
- at least one usable provider or an explicitly documented degraded mode.

### Detailed health

A detailed dependency endpoint may exist for administrators, but it must not expose secrets, connection strings, internal stack traces, or provider credentials.

---

## 23. Observability

### Logs

Use Pino structured logs with:

- `requestId`;
- future distributed trace ID only after an approved tracing migration;
- `orgId` and `userId` only where access rules permit;
- provider ID;
- status;
- latency;
- safe error code.

Redact:

- authorization headers;
- cookies;
- prompt and response content;
- API keys;
- encrypted content fields;
- access and refresh tokens.

### Metrics

Core metrics may include:

- HTTP request count and duration;
- provider latency and error count;
- circuit-breaker state;
- fallback count;
- prompt cache hit ratio;
- queue depth and failed jobs;
- billing job duration;
- active alerts.

Do not use `orgId`, `userId`, email address, prompt, or request ID as high-cardinality metric labels.

---

## 24. Deployment Summary

### Frontend

Deploy the built React application to a static hosting service. A containerized frontend is optional, not required.

### API

Deploy the backend API image to GCP Cloud Run.

Recommended MVP characteristics:

- immutable image tag based on Git commit SHA;
- non-root container user;
- production-only dependencies;
- secrets injected at runtime;
- Cloud Run liveness/readiness integration;
- bounded maximum instances to control provider cost;
- one region for the MVP.

### Worker

A continuously polling BullMQ worker must run in an environment that remains active when no HTTP request is arriving. Do not assume an ordinary scale-to-zero Cloud Run service will continuously process Redis queues.

For the MVP, use one small always-running worker process, or use a Cloud Run configuration only after confirming minimum-instance and CPU behavior for background processing.

See [`docs/07_DEPLOYMENT_ARCHITECTURE.md`](docs/07_DEPLOYMENT_ARCHITECTURE.md).

---

## 25. Security Rules for Contributors

Every contributor must preserve these invariants:

1. A tenant-owned query always includes authenticated `orgId`.
2. A blocked prompt never reaches any provider adapter.
3. A masked prompt replaces the original before routing.
4. Raw prompts, responses, tokens, and API keys never appear in logs.
5. Encryption failure never falls back to plaintext.
6. Cache and idempotency keys are organisation-scoped.
7. Feature access is enforced on the server, not only hidden in the UI.
8. Refresh tokens are stored hashed and are single-use.
9. Unknown errors never expose implementation details.
10. Background jobs are idempotent.
11. Provider SDK errors are normalized before leaving the provider layer.
12. Audit records never contain raw sensitive values.

Read [`docs/06_SECURITY_THREAT_MODEL.md`](docs/06_SECURITY_THREAT_MODEL.md) before changing authentication, tenant access, policy, provider, cache, encryption, audit, export, or deployment code.

---

## 26. Development Order for a Solo Developer

Use this order rather than trying to build every subsystem at once.

### Week 1 — Core foundation

- repository structure;
- Express and TypeScript setup;
- environment validation;
- MongoDB connection;
- organisation and user models;
- login and access token;
- standard response/error envelope;
- one fake provider adapter;
- basic request logging.

### Week 2 — Provider and resilience

- common provider interface;
- two or three provider adapters;
- provider error normalization;
- capability registry;
- timeout and retry;
- circuit breaker;
- simple routing;
- pre-stream fallback.

### Week 3 — Policy and background jobs

- PII detection;
- classification and risk scoring;
- policy engine;
- masking and blocking;
- Redis idempotency;
- safe prompt cache;
- BullMQ billing and analytics jobs;
- audit events.

### Week 4 — Streaming and administration

- authenticated response streaming;
- conversation and message flow;
- admin dashboard endpoints;
- RBAC;
- cursor pagination;
- search filters;
- billing and alert views.

### Week 5 — Quality and deployment

- structured logging;
- Prometheus metrics;
- health endpoints;
- security regression tests;
- Docker images;
- staging deployment;
- production smoke checks;
- documentation cleanup.

Do not start payment automation or advanced roadmap features before the core prompt pipeline is stable and tested.

---

## 27. Documentation Index

| Document | Purpose |
|---|---|
| [`docs/01_PRD.md`](docs/01_PRD.md) | Product goals, scope, personas, requirements, acceptance criteria |
| [`docs/02_SDD.md`](docs/02_SDD.md) | High-level components, boundaries, and request flow |
| [`docs/03_TDD.md`](docs/03_TDD.md) | TypeScript-level implementation design |
| [`docs/04_DATABASE_DESIGN.md`](docs/04_DATABASE_DESIGN.md) | MongoDB collections, indexes, retention, and Redis keys |
| [`docs/05_OPENAPI_SPEC.md`](docs/05_OPENAPI_SPEC.md) | API contract, errors, streaming, and endpoint schemas |
| [`docs/06_SECURITY_THREAT_MODEL.md`](docs/06_SECURITY_THREAT_MODEL.md) | Assets, trust boundaries, threats, mitigations, and security gates |
| [`docs/07_DEPLOYMENT_ARCHITECTURE.md`](docs/07_DEPLOYMENT_ARCHITECTURE.md) | Environments, containers, Cloud Run, workers, rollback, and operations |
| [`docs/08_TESTING_STRATEGY.md`](docs/08_TESTING_STRATEGY.md) | Unit, integration, security, E2E, performance, and release testing |
| [`docs/09_README.md`](docs/09_README.md) | Project entry point and developer setup |

When this file is moved to the repository root as `README.md`, update the final row and relative paths if necessary.

---

## 28. Common Troubleshooting

### API starts but readiness fails

Check:

- `MONGO_URI`;
- `REDIS_URL`;
- provider credentials;
- container network names;
- MongoDB and Redis health;
- environment validation output.

### Chat request returns `PROVIDER_UNAVAILABLE`

Check:

- provider API key;
- provider quota;
- provider model name;
- circuit-breaker state;
- timeout configuration;
- outbound internet access;
- normalized provider error logs using the request ID.

### Duplicate request is rejected

The same `clientRequestId` may already be processing or completed. The client should generate one unique ID for each intended prompt and reuse it only when retrying that same intended request.

### Refresh repeatedly logs the user out

Check:

- secure-cookie settings for the current environment;
- frontend credentials mode;
- CORS allowed origin;
- refresh-token expiration;
- token-family reuse detection;
- multiple browser tabs exchanging the same refresh token concurrently.

### Worker does not process jobs

Check:

- worker process is running;
- API and worker use the same Redis instance and queue prefix;
- queue names match;
- worker environment contains all required variables;
- the deployment platform keeps the worker active;
- failed jobs and retry counts.

### Encrypted content cannot be read

Do not replace the encryption key as a quick fix. First verify:

- the correct environment secret version is mounted;
- key encoding and length;
- nonce, tag, and ciphertext field mapping;
- deployment history;
- whether old records were encrypted with a different key.

Key loss can make encrypted content unrecoverable.

---

## 29. Contribution Workflow

For a small solo project, keep the workflow simple:

1. Create a focused branch.
2. Update or add tests with the change.
3. Run lint, typecheck, and relevant tests locally.
4. Review tenant isolation and sensitive-data handling.
5. Update the affected design document if the contract changes.
6. Open a pull request even when working alone, so the change has a review checkpoint.
7. Merge only when required checks pass.
8. Deploy to staging before production.

Suggested branch names:

```text
feature/auth-login
feature/pii-policy
fix/provider-timeout
chore/docker-build
```

Suggested commit style:

```text
feat(auth): add refresh token rotation
fix(routing): skip providers with open circuit
security(cache): scope prompt keys by organisation
```

---

## 30. Definition of Done for MVP

The MVP is complete only when:

- authentication and refresh rotation work;
- tenant isolation tests pass;
- normal, masked, and blocked prompt flows work;
- blocked content never reaches a provider;
- streaming works for the primary provider;
- pre-stream provider fallback works;
- circuit breaker and retry behavior are tested;
- idempotency prevents duplicate billable calls;
- safe prompt caching works and excludes PII prompts;
- metadata-only and encrypted retention work;
- audit, billing, and alert jobs are idempotent;
- the administrator can view the agreed metadata dashboards;
- logs and metrics do not expose sensitive content;
- Docker local setup works from a clean machine;
- staging deployment passes smoke tests;
- the release checklist is completed;
- documentation matches the implemented behavior;
- deferred features are not represented as implemented.

---

## 31. Known MVP Limitations

- rule-based PII detection can produce false positives and false negatives;
- routing intent classification is heuristic;
- circuit-breaker state may be local to one API instance;
- provider fallback is only safe before streaming begins;
- one region creates a regional availability dependency;
- one Redis instance is a shared dependency;
- audit immutability is application- and permission-enforced rather than cryptographically tamper-proof;
- encryption-key rotation requires additional operational design;
- local performance results are not proof of enterprise-scale capacity;
- compliance certification is not included.

These limitations are accepted for the beginner solo-developer MVP and must be revisited before enterprise production use.

---

## 32. README Self-Audit

### Scope audit — PASS

The README documents only capabilities already approved in the PRD, SDD, TDD, database, API, security, deployment, and testing documents. It does not add a new user-facing feature.

### Beginner solo-developer audit — PASS

The setup uses a modular monolith, MongoDB, Redis, BullMQ, Docker Compose, a small provider set, and a five-week sequence. It avoids Kubernetes, Kafka, SSO, ML models, and distributed systems not required for the MVP.

### Security-order audit — PASS

The documented request flow places PII detection and policy evaluation before cache eligibility, routing, and provider calls. Blocked prompts stop before provider egress.

### Tenant-isolation audit — PASS

The README requires server-derived organisation context, organisation-scoped queries, organisation-scoped Redis keys, and mandatory cross-tenant tests.

### Sensitive-data audit — PASS

The README prohibits raw prompt, response, token, key, and detected sensitive values in logs, metrics, audit metadata, and unsafe queue payloads.

### Implementation-honesty audit — PASS

Commands, scripts, URLs, and environment variables are marked as expected or recommended where the source repository has not yet proven that they exist. The README does not claim the application is already implemented.

### Deployment audit — PASS WITH DOCUMENTED LIMITATION

The API is suitable for Cloud Run. The continuously polling BullMQ worker requires an always-active runtime or a carefully validated Cloud Run configuration.

### Documentation consistency audit — PASS

Terminology, roles, retention modes, policy actions, streaming behavior, and deferred features remain consistent with the prior design documents.

---

## 33. Final Status

> **Approved as the main project entry-point and developer onboarding baseline for the ProxiAI beginner solo-developer MVP.**
