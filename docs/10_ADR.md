# ProxiAI Architecture Decision Records (ADR)

**Document ID:** ADR-001  
**Project:** ProxiAI — Enterprise AI Gateway & Audit Platform  
**Version:** 1.0  
**Status:** Approved for MVP Baseline  
**Audience:** Solo Developer, Reviewer, Future Contributors  
**Last Updated:** July 2026  

---

## 1. Purpose

This document records the major architectural decisions for the ProxiAI MVP.

The goal is to preserve:

- why a decision was made;
- which alternatives were considered;
- what trade-offs were accepted;
- what must remain true during implementation;
- what can change later without rewriting the complete system.

This document does not add new product features. It records the decisions already established in the PRD, System Design Document, Technical Design Document, Database Design, API Specification, Security Threat Model, Deployment Architecture, Testing Strategy, and README.

---

## 2. ADR Status Definitions

| Status | Meaning |
|---|---|
| Proposed | Decision is still under review |
| Accepted | Decision is approved and should guide implementation |
| Superseded | Replaced by a newer ADR |
| Deprecated | Should not be used for new implementation |
| Rejected | Considered but intentionally not selected |

---

## 3. Decision Principles

Every architecture decision should support these principles:

1. Keep the five-week MVP realistic for a beginner solo developer.
2. Prefer a modular monolith over distributed microservices.
3. Enforce security before sending data to an external provider.
4. Keep tenant isolation explicit in every persistence and API flow.
5. Prefer simple, testable, explainable logic over black-box automation.
6. Keep provider integrations replaceable through interfaces.
7. Keep asynchronous side effects outside the user-facing request path.
8. Avoid infrastructure that is not justified by MVP scale.
9. Do not claim enterprise readiness where only an MVP baseline exists.
10. Preserve a clear upgrade path without implementing roadmap complexity now.

---

# ADR-001 — Use a Modular Monolith

## Status

Accepted

## Context

ProxiAI includes authentication, chat, provider routing, PII detection, policy enforcement, billing, audit logging, administration, and background jobs.

These capabilities could be split into separate services, but the MVP is being built by one beginner solo developer within a short delivery window.

## Decision

Build the backend as one modular monolith using feature-based folders.

Example:

```text
backend/src/
├── features/
│   ├── auth/
│   ├── chat/
│   ├── providers/
│   ├── routing/
│   ├── pii/
│   ├── policy/
│   ├── audit/
│   ├── billing/
│   ├── admin/
│   └── retention/
├── shared/
├── workers/
├── config/
└── server.ts
```

The API process and worker process may run separately, but both use the same codebase and deployment image.

## Alternatives Considered

### Microservices

Rejected for MVP because they would require:

- service discovery;
- inter-service authentication;
- distributed tracing;
- multiple deployments;
- network failure handling;
- separate release coordination;
- more complex local development.

### Traditional controller/service/repository folders

Rejected because one feature would be scattered across several unrelated folders.

## Consequences

### Positive

- Easier for one developer to understand.
- Faster local setup.
- Simpler deployment.
- Clear feature ownership.
- Lower operational overhead.

### Negative

- The codebase may become large over time.
- Feature boundaries depend on developer discipline.
- Independent scaling is limited.

## Implementation Guardrails

- Features must not directly access another feature’s internal files.
- Shared utilities must contain only truly shared behavior.
- Each feature should own its routes, schema, service logic, types, and tests.
- New microservices must not be introduced during MVP without a new ADR.

---

# ADR-002 — Use Node.js, Express, and TypeScript

## Status

Accepted

## Context

The project needs:

- fast development;
- strong JSON and API support;
- streaming support;
- provider SDK compatibility;
- shared types between backend and frontend;
- a beginner-friendly ecosystem.

## Decision

Use:

- Node.js as the runtime;
- Express as the HTTP framework;
- TypeScript as the implementation language.

## Alternatives Considered

### NestJS

Not selected for MVP because its decorators, dependency injection, modules, and framework conventions add learning overhead.

### Python with FastAPI

Valid, but rejected because the planned frontend and backend can share TypeScript types, and many provider SDKs already have strong Node.js support.

### .NET

Technically suitable, but not selected because the approved project stack is already TypeScript-based.

## Consequences

### Positive

- One language across frontend and backend.
- Strong typing for provider contracts.
- Good streaming support.
- Large ecosystem.
- Fast development.

### Negative

- Express requires more manual structure.
- Runtime safety still requires Zod validation.
- Incorrect async handling can produce hidden failures.

## Implementation Guardrails

- `strict` TypeScript mode must remain enabled.
- `any` should be avoided.
- External input must be validated with Zod.
- Controllers must not contain business logic.
- Every async route must pass errors to the global error handler.

---

# ADR-003 — Use Provider Adapter Interfaces

## Status

Accepted

## Context

ProxiAI must support multiple LLM providers without spreading provider-specific SDK code throughout the application.

## Decision

Every provider will implement a common `ProviderAdapter` interface.

```ts
interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(tokensIn: number, tokensOut: number): number;
}
```

Provider SDK responses and errors must be normalized inside the adapter.

## Alternatives Considered

### Calling provider SDKs directly in the chat controller

Rejected because it creates tight coupling and makes routing, fallback, testing, and provider replacement difficult.

### One generic provider function with conditionals

Rejected because it would grow into a large switch statement.

## Consequences

### Positive

- New providers require one new adapter.
- Routing remains provider-independent.
- Fake adapters can be used in tests.
- Errors can be normalized consistently.

### Negative

- The common interface may hide provider-specific capabilities.
- Some adapters may need optional capability fields.
- Streaming behavior differs between vendors and requires normalization.

## Implementation Guardrails

- Provider SDK types must not leak outside the adapter.
- Provider-specific API keys must not be logged.
- Every adapter must define capabilities.
- Every adapter must normalize retryable and non-retryable errors.
- Tests must use fake adapters instead of live providers by default.

---

# ADR-004 — Apply Policy Before Routing

## Status

Accepted

## Context

A prompt may contain sensitive data, blocked content, or may belong to an organisation whose budget is exhausted.

Selecting a provider before applying policy creates a risk that prohibited content is sent externally.

## Decision

The synchronous request order is:

1. Authenticate user.
2. Resolve organisation and permissions.
3. Validate request.
4. Check idempotency.
5. Apply rate limit.
6. Detect and classify sensitive data.
7. Calculate risk score.
8. Evaluate policy.
9. Stop if blocked.
10. Replace original text with masked text when masking is required.
11. Check cache.
12. Route to provider.
13. Call provider.

## Alternatives Considered

### Route first, scan later

Rejected because blocked data could leave the company perimeter.

### Let every provider adapter apply its own policy

Rejected because policy behavior would become inconsistent.

## Consequences

### Positive

- Blocked prompts never reach a provider.
- Masking is centralized.
- Policy decisions are explainable.
- Audit behavior is consistent.

### Negative

- PII and policy checks add latency.
- Detection errors can block valid prompts or miss sensitive content.

## Implementation Guardrails

- A blocked decision must result in zero provider calls.
- A masked decision must create a new sanitized prompt value.
- Original sensitive content must not be passed to routing.
- Policy decisions must be audited without storing raw sensitive values.

---

# ADR-005 — Use Explainable Rule-Based PII Detection for MVP

## Status

Accepted

## Context

The architecture roadmap mentions advanced named-entity recognition and Microsoft Presidio, but the MVP must be achievable by one beginner developer.

## Decision

Use a four-stage PII pipeline:

1. Detection using regex and deterministic pattern matching.
2. Classification using a static category map.
3. Risk scoring using weighted categories.
4. Policy decision using configurable thresholds.

Initial categories:

- `CONTACT_INFO`
- `FINANCIAL`
- `GOVERNMENT_ID`
- `CREDENTIAL`
- `INTERNAL_SECRET`
- `BUSINESS_CONFIDENTIAL`

## Alternatives Considered

### Machine-learning detection

Deferred because it introduces model deployment, tuning, false-positive analysis, and additional infrastructure.

### External DLP API

Deferred because it increases cost, privacy exposure, and vendor dependency.

## Consequences

### Positive

- Easy to understand.
- Easy to test.
- Fast execution.
- Explainable to reviewers.
- No separate ML service.

### Negative

- Context awareness is limited.
- False positives and false negatives remain possible.
- International identifiers may not be covered initially.

## Implementation Guardrails

- Detection rules must have unit tests.
- Raw matched values must never be included in logs.
- Category weights must be centralized.
- Changes to weights must not require code changes across multiple features.
- ML detection must remain roadmap-only until a separate ADR is accepted.

---

# ADR-006 — Use Weighted Routing with Simple Inputs

## Status

Accepted

## Context

Routing must consider more than prompt length but should remain understandable and implementable.

## Decision

Use a weighted score based on:

- capability match;
- intent category;
- provider health;
- estimated latency;
- estimated cost;
- organisation budget state.

Initial intent classification will use deterministic keywords and structure heuristics.

The routing result must include a human-readable reason.

## Alternatives Considered

### Route only by prompt length

Rejected because prompt length does not reliably represent complexity.

### Use an LLM to classify every prompt

Rejected because it adds latency, cost, and another failure dependency.

### Machine-learning router

Deferred until enough production data exists.

## Consequences

### Positive

- Explainable routing.
- No extra model call.
- Easy to tune.
- Supports cost and latency awareness.

### Negative

- Heuristics will not always classify correctly.
- Static weights may not fit every organisation.
- Provider estimates may become stale.

## Implementation Guardrails

- Manual provider selection is allowed only when policy permits it.
- Unhealthy or incapable providers must be removed before scoring.
- Context-window limits must be checked.
- Budget exhaustion must block billable requests.
- Routing weights remain fixed for MVP.

---

# ADR-007 — Use Retry, Circuit Breaker, and Ordered Fallback

## Status

Accepted

## Context

External LLM providers can experience timeouts, rate limits, outages, and temporary failures.

## Decision

Wrap provider calls with:

1. timeout;
2. retry for retryable failures;
3. exponential backoff;
4. jitter;
5. circuit breaker;
6. ordered fallback to the next eligible provider.

Circuit states:

- `CLOSED`
- `OPEN`
- `HALF_OPEN`

Fallback is automatic only before the first response token has been sent.

## Alternatives Considered

### Retry forever

Rejected because it increases cost, latency, and outage pressure.

### Fallback without a circuit breaker

Rejected because repeated requests would continue calling a known unhealthy provider.

### Seamless mid-stream provider switching

Deferred because combining two model outputs is unreliable and complex.

## Consequences

### Positive

- Better resilience.
- Faster failure recovery.
- Lower repeated timeout cost.
- Provider outage is less visible to users.

### Negative

- Different fallback providers may return different answers.
- In-memory circuit state is not shared across instances.
- Mid-stream failure still interrupts the response.

## Implementation Guardrails

- Retry only timeouts, 429 responses, and approved 5xx errors.
- Never retry validation or authentication failures.
- Maximum retry count must be bounded.
- Fallback must not bypass policy.
- Mid-stream failure must send a clear error event.

---

# ADR-008 — Use Authenticated Fetch Streaming with SSE Format

## Status

Accepted

## Context

The user expects token-by-token responses. Browser `EventSource` does not easily support an `Authorization` header for a protected POST request.

## Decision

Use:

- `POST /api/v1/chat/stream`;
- access token in the `Authorization` header;
- `fetch()` on the frontend;
- a readable response stream;
- SSE-formatted events in the response body.

Supported events:

- `meta`
- `token`
- `done`
- `error`

## Alternatives Considered

### Browser EventSource

Rejected because the endpoint needs authenticated POST request data and bearer-token support.

### WebSockets

Rejected because the MVP primarily needs one-way server-to-client streaming.

### Wait for complete response

Rejected because it creates poor chat UX.

## Consequences

### Positive

- Supports authenticated streaming.
- Uses standard HTTP.
- Avoids WebSocket infrastructure.
- Keeps event framing simple.

### Negative

- Client parsing is more manual than EventSource.
- Automatic reconnect must be implemented explicitly.
- Proxy buffering must be tested.

## Implementation Guardrails

- Headers must be sent before token events.
- Pre-stream errors use the standard JSON envelope.
- Post-stream errors use an SSE `error` event.
- Client disconnect must cancel or ignore downstream work where possible.
- No automatic mid-stream provider splice.

---

# ADR-009 — Use MongoDB as the Primary Database

## Status

Accepted

## Context

The system stores organisations, users, conversations, messages, request metadata, audit logs, alerts, billing rollups, and provider health.

The data shapes may evolve during MVP development.

## Decision

Use MongoDB with Mongoose.

Tenant-owned records must contain `orgId`.

Primary collections:

- organisations;
- teams;
- users;
- refresh tokens;
- conversations;
- messages;
- request logs;
- audit logs;
- billing rollups;
- alerts;
- provider health.

## Alternatives Considered

### PostgreSQL

A strong alternative, but not selected because the approved architecture and evolving log shapes favor MongoDB for this MVP.

### Separate databases for each subsystem

Rejected because it adds operational and consistency complexity.

## Consequences

### Positive

- Flexible schemas.
- Good fit for log-style documents.
- TTL indexes are available.
- Fast MVP iteration.

### Negative

- Application code must enforce relationships.
- Multi-document transactions should be used carefully.
- Incorrect queries can cause tenant-isolation failures.

## Implementation Guardrails

- Every tenant query must include `orgId`.
- IDs alone must never be trusted for tenant-owned records.
- Compound indexes must match query patterns.
- Raw prompt and response text must not be placed in `RequestLog`.
- Migrations must create indexes explicitly.

---

# ADR-010 — Separate Messages, Request Logs, Audit Logs, and Billing

## Status

Accepted

## Context

Conversation content, provider execution metadata, compliance actions, and monthly billing are different data domains.

Combining all of them in one collection would make permissions, retention, and queries difficult.

## Decision

Store these separately:

- `Message`: encrypted or omitted conversation content;
- `RequestLog`: provider, token, cost, latency, routing, and PII metadata;
- `AuditLog`: security and administrative actions;
- `Billing`: pre-aggregated monthly usage and cost.

## Alternatives Considered

### One universal log collection

Rejected because access rules and retention needs differ.

### Calculate billing from request logs every time

Rejected because dashboard queries would become increasingly expensive.

## Consequences

### Positive

- Clear access boundaries.
- Efficient billing dashboard.
- Independent retention policies.
- Audit queries do not expose message content.

### Negative

- Eventual consistency exists between collections.
- Workers must be idempotent.
- More schemas must be maintained.

## Implementation Guardrails

- Audit logs must not contain raw prompts.
- Billing updates must use unique event identifiers.
- Request log creation and message persistence must follow retention policy.
- Admin dashboard APIs must not automatically decrypt messages.

---

# ADR-011 — Use Redis for Four Explicit Responsibilities

## Status

Accepted

## Context

Redis is required for fast, temporary, and coordination-related data.

Using Redis as an undefined general-purpose store would make keys and failure behavior inconsistent.

## Decision

Use Redis for:

1. prompt cache;
2. idempotency keys;
3. provider health and circuit state;
4. BullMQ queues.

Distributed locking is deferred until multiple workers require it.

## Alternatives Considered

### In-memory cache only

Rejected because data would disappear independently on every process and could not coordinate API and worker behavior.

### Use MongoDB for everything

Rejected because idempotency, queue processing, and short-lived cache access require lower latency.

## Consequences

### Positive

- Fast lookups.
- Shared state.
- Supports BullMQ.
- Simple MVP infrastructure.

### Negative

- Redis becomes an important dependency.
- Different use cases need different failure behavior.
- Incorrect key scoping could leak tenant data.

## Implementation Guardrails

- Every tenant-specific key must include `orgId`.
- Prompt cache must never store detected PII.
- Cache may fail open.
- Idempotency must fail closed when duplicate paid-call risk cannot be controlled.
- Key names and TTLs must be centrally documented.

---

# ADR-012 — Use BullMQ Directly for Background Work

## Status

Accepted

## Context

Billing, analytics, anomaly detection, email, and provider health checks should not delay chat responses.

The original architecture considered Redis Pub/Sub plus BullMQ, but that creates two asynchronous layers for a beginner MVP.

## Decision

Publish durable background jobs directly to BullMQ queues.

Initial queues:

- `billing-queue`
- `analytics-queue`
- `anomaly-queue`
- `email-queue`
- `health-check-queue`

Retention cleanup should use MongoDB TTL where possible rather than a mandatory archive queue.

## Alternatives Considered

### Redis Pub/Sub plus BullMQ

Rejected for MVP because Pub/Sub messages are not durable and the extra layer adds complexity.

### Kafka

Rejected because MVP scale does not justify it.

### Synchronous processing

Rejected because side effects would increase request latency.

## Consequences

### Positive

- Durable jobs.
- Built-in retries and backoff.
- Easier observability.
- Fewer moving parts.

### Negative

- Queue workers must run continuously.
- At-least-once processing can create duplicates.
- Job payload design requires care.

## Implementation Guardrails

- Workers must be idempotent.
- Raw prompts must not be placed in queue payloads.
- Failed jobs must be visible.
- Retry count must be bounded.
- Billing jobs must use unique processing keys.

---

# ADR-013 — Use JWT Access Tokens and Rotating Refresh Tokens

## Status

Accepted

## Context

The application needs short-lived API authentication while allowing users to remain signed in.

## Decision

Use:

- 15-minute JWT access tokens;
- 7-day refresh tokens;
- refresh tokens stored hashed in MongoDB;
- refresh token in an `HttpOnly`, `Secure`, `SameSite` cookie;
- one-time refresh token rotation;
- token-family reuse detection.

## Alternatives Considered

### Long-lived JWT only

Rejected because stolen tokens would remain valid too long.

### Server-side session only

Valid but not selected because the current API design is already token-based.

### Store raw refresh tokens

Rejected because database compromise would expose active sessions.

## Consequences

### Positive

- Short access-token exposure.
- Reuse detection.
- Session revocation.
- Works well with API clients.

### Negative

- More complex than simple JWT authentication.
- Refresh race conditions must be handled.
- Cookie settings require environment-aware configuration.

## Implementation Guardrails

- Refresh tokens must be hashed before storage.
- Reusing an already-used token revokes the family.
- Logout revokes the current session.
- Access tokens must not be stored in local storage when avoidable.
- Authentication failures must be audited without recording secrets.

---

# ADR-014 — Use Permission-Based RBAC

## Status

Accepted

## Context

The platform has employee, team lead, organisation administrator, and super administrator roles.

Hard-coding role checks inside controllers would become difficult to maintain.

## Decision

Map roles to permissions and enforce permissions at route level.

Example permissions:

- `CHAT_SEND`
- `CHAT_VIEW_OWN`
- `TEAM_VIEW_LOGS`
- `ADMIN_VIEW_LOGS`
- `ADMIN_VIEW_BILLING`
- `ADMIN_MANAGE_USERS`
- `ADMIN_CONFIGURE_POLICY`
- `ADMIN_EXPORT_AUDIT`

## Alternatives Considered

### Two roles: admin and employee

Rejected because team-level visibility is required.

### Attribute-based authorization engine

Deferred because it is too complex for MVP.

## Consequences

### Positive

- Clear authorization.
- Easier role expansion.
- Route-level readability.
- Better audit records.

### Negative

- Scope checks are still needed in addition to permission checks.
- Permission changes require careful migration.

## Implementation Guardrails

- Permissions alone do not replace `orgId` filtering.
- Team leads must be restricted to their team.
- Frontend hiding is never considered authorization.
- Every admin route must declare required permission.

---

# ADR-015 — Enforce Retention Before Persistence

## Status

Accepted

## Context

Retention cannot be treated as a cleanup preference after full content has already been written.

## Decision

The organisation retention mode must be evaluated before constructing any content write.

MVP modes:

- `METADATA_ONLY`
- `ENCRYPTED_STORAGE`

Optional after core MVP:

- `CUSTOM_RETENTION`

Deferred:

- `NO_STORAGE`

## Alternatives Considered

### Store everything and delete later

Rejected because it violates the intent of restricted retention.

### One global retention mode

Rejected because organisations have different requirements.

## Consequences

### Positive

- Stronger privacy guarantee.
- Clear persistence behavior.
- Easier audit explanation.

### Negative

- Every write path must be retention-aware.
- Some dashboard features cannot display content under metadata-only mode.

## Implementation Guardrails

- Metadata-only mode must not construct message content fields.
- Encryption failure must fail the write.
- Plaintext fallback is forbidden.
- TTL index must be used for custom retention.
- Billing metadata remains independent from message-content storage.

---

# ADR-016 — Use AES-256-GCM for Stored Content

## Status

Accepted

## Context

Prompts and responses may contain confidential information.

## Decision

Encrypt retained message content using AES-256-GCM.

Store:

- ciphertext;
- IV;
- authentication tag;
- key version.

The master encryption key is supplied through environment or secret manager and is never stored in MongoDB.

## Alternatives Considered

### Plaintext MongoDB storage

Rejected because message content is sensitive.

### Database-only disk encryption

Insufficient because application-level access could still expose plaintext fields.

### Per-tenant KMS keys

Deferred because it adds key-management complexity.

## Consequences

### Positive

- Authenticated encryption.
- Better protection after database compromise.
- Supports future key versioning.

### Negative

- Lost keys mean lost content.
- Search over encrypted content is not available.
- Key rotation requires additional tooling.

## Implementation Guardrails

- Never reuse IVs with the same key.
- Encryption and decryption functions must be centralized.
- Keys must never appear in logs.
- Admin APIs must not automatically decrypt content.
- Key backup responsibility must be documented.

---

# ADR-017 — Keep Audit Logs Append-Only

## Status

Accepted

## Context

Audit records represent security and administrative actions and should not be silently altered.

## Decision

Audit logs are append-only at the application layer.

No update or delete API will be created for audit records.

## Alternatives Considered

### Allow administrators to edit audit records

Rejected because it undermines audit integrity.

### Use immutable external object storage immediately

Deferred because it adds infrastructure beyond the MVP.

## Consequences

### Positive

- Clear history.
- Better compliance evidence.
- Reduced tampering risk.

### Negative

- Incorrect audit entries cannot be edited.
- Application-level immutability is not full tamper-proof storage.

## Implementation Guardrails

- Corrections must create a new audit entry.
- Audit metadata must not contain raw sensitive content.
- Audit export requires explicit permission.
- Database credentials should avoid update/delete privileges where practical.

---

# ADR-018 — Use Standard API Envelopes and Typed Errors

## Status

Accepted

## Context

The frontend needs one predictable response shape, and support logs need a request identifier.

## Decision

Use:

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    nextCursor?: string;
  };
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
```

Use a typed `AppError` hierarchy and one global error middleware.

## Alternatives Considered

### Return arbitrary JSON from each controller

Rejected because frontend parsing and support debugging would become inconsistent.

### Expose raw exceptions

Rejected because stack traces and internal details can leak.

## Consequences

### Positive

- Consistent frontend handling.
- Stable error codes.
- Easier support tracing.
- Safer unknown-error behavior.

### Negative

- Every controller must use shared helpers.
- Streaming endpoints need a separate post-header error format.

## Implementation Guardrails

- Unknown errors return a generic message.
- Validation details must not include secrets.
- Every response includes `requestId`.
- SSE errors use documented event shapes.

---

# ADR-019 — Use Cursor-Based Pagination

## Status

Accepted

## Context

Request logs and audit logs can grow quickly.

Offset pagination becomes slower and unstable when new records are inserted.

## Decision

Use opaque cursor pagination based on:

- `createdAt`;
- `_id` as a stable tie-breaker.

## Alternatives Considered

### Offset and page-number pagination

Rejected for large chronological datasets.

### Load all records

Rejected because it creates performance and memory risks.

## Consequences

### Positive

- Stable performance.
- Works well with compound indexes.
- Better consistency during inserts.

### Negative

- Users cannot jump directly to arbitrary page numbers.
- Cursor encoding and validation are required.

## Implementation Guardrails

- Cursor contents are controlled by the server.
- Invalid cursors return a typed validation error.
- Sort order and index order must match.
- Tenant filtering occurs before cursor conditions.

---

# ADR-020 — Use Pino, Prometheus, and Basic Grafana for MVP

## Status

Accepted

## Context

The system needs logs and operational metrics, but full distributed observability is too much for the first release.

## Decision

Use:

- Pino for structured logs;
- request IDs and trace IDs for correlation;
- Prometheus-compatible metrics;
- one basic Grafana dashboard.

OpenTelemetry is deferred to the production roadmap.

## Alternatives Considered

### Console logging

Rejected because logs would be unstructured and difficult to search.

### Full observability stack immediately

Deferred due to time and infrastructure overhead.

## Consequences

### Positive

- Structured diagnostics.
- Measurable provider latency and error rates.
- Basic dashboards.
- Low implementation cost.

### Negative

- No full distributed traces in MVP.
- Correlation across queues relies on propagated IDs.

## Implementation Guardrails

- Authorization headers, API keys, prompts, responses, and encrypted fields must be redacted.
- Metrics must not use `orgId` or `userId` as high-cardinality labels.
- Queue jobs must propagate request or trace identifiers.
- Sensitive data must never appear in metric labels.

---

# ADR-021 — Use Docker and Docker Compose

## Status

Accepted

## Context

Local development must reproduce MongoDB, Redis, API, worker, and frontend dependencies consistently.

## Decision

Use:

- multi-stage Dockerfiles;
- Docker Compose for local development;
- one backend image;
- different commands for API and worker processes.

## Alternatives Considered

### Manual local installation only

Rejected because setup would differ across machines.

### Kubernetes for local and production deployment

Rejected because it is unnecessary for MVP.

## Consequences

### Positive

- Repeatable setup.
- Shared backend image.
- Smaller production images.
- Easier onboarding.

### Negative

- Docker adds initial learning effort.
- Local file permissions and volume behavior may vary.

## Implementation Guardrails

- Production container must run as a non-root user.
- Development dependencies must not be included in the final image.
- Secrets must not be baked into images.
- `.env` files must not be committed.

---

# ADR-022 — Deploy the API to GCP Cloud Run

## Status

Accepted

## Context

The API needs a simple managed deployment with automatic scaling and low idle cost.

## Decision

Deploy the API container to GCP Cloud Run.

Initial configuration should use:

- one region;
- bounded maximum instances;
- managed HTTPS;
- runtime secret injection;
- separate staging and production services.

## Alternatives Considered

### Kubernetes or GKE

Rejected due to operational complexity.

### Self-managed VM for all components

Not selected for the API because Cloud Run provides simpler managed scaling.

## Consequences

### Positive

- Simple deployment.
- Automatic HTTPS.
- Scale-to-zero support.
- Low operational overhead.

### Negative

- Cold starts are possible.
- Background workers require separate consideration.
- Local in-memory circuit state is instance-specific.

## Implementation Guardrails

- Readiness and liveness endpoints must be present.
- Deployment images must use immutable tags.
- Production maximum instances must be capped initially.
- API and worker scaling behavior must remain separate.

---

# ADR-023 — Do Not Depend on Scale-to-Zero for BullMQ Workers

## Status

Accepted

## Context

BullMQ workers must continuously poll Redis. Request-driven scale-to-zero platforms may stop worker processing when no HTTP requests arrive.

## Decision

Run the initial worker as one continuously available process.

Acceptable MVP options:

- a small VM;
- a managed container service that supports continuous background processing;
- carefully verified Cloud Run configuration with at least one active instance and appropriate CPU behavior.

## Alternatives Considered

### Ordinary scale-to-zero Cloud Run service

Rejected because jobs may remain unprocessed.

### Convert every queue into scheduled jobs

Rejected because billing and alert processing should run soon after request completion.

## Consequences

### Positive

- Queue processing remains reliable.
- Architecture remains simple.

### Negative

- Worker has a minimum ongoing hosting cost.
- Worker scaling is initially manual.

## Implementation Guardrails

- Worker heartbeat must be observable.
- Queue depth and failed jobs must be monitored.
- Start with one worker instance.
- Add distributed locks only when multiple workers create a demonstrated need.

---

# ADR-024 — Do Not Use Kafka in the MVP

## Status

Accepted

## Context

The architecture requires durable asynchronous jobs, but projected MVP traffic does not justify a dedicated event-streaming platform.

## Decision

Do not use Kafka in the MVP.

BullMQ and Redis provide sufficient queue behavior for the expected scale.

## Alternatives Considered

### Apache Kafka

Rejected due to deployment, monitoring, partitioning, schema, and operational overhead.

### Managed event streaming

Deferred until multiple independently deployed services need durable fan-out.

## Consequences

### Positive

- Lower infrastructure complexity.
- Faster implementation.
- Easier local development.
- One less production dependency.

### Negative

- BullMQ is not a full event-streaming platform.
- Long-term event replay is limited.
- Cross-service fan-out may require redesign later.

## Implementation Guardrails

- Job producers and consumers must use typed payloads.
- Business logic must not depend directly on BullMQ internals.
- A future event-bus interface can be introduced only when justified.

---

# ADR-025 — Do Not Use Microservices in the MVP

## Status

Accepted

## Context

“Enterprise platform” does not automatically require microservices.

The team size, traffic, and release needs do not justify distributed ownership.

## Decision

Do not split auth, routing, PII, billing, or audit into independent services during MVP.

## Alternatives Considered

### One service per domain

Rejected because it would create more infrastructure than product value.

## Consequences

### Positive

- Lower cognitive load.
- Faster delivery.
- Easier debugging.
- Simpler transactions and local development.

### Negative

- Independent deployments are unavailable.
- Scaling remains coarse-grained.

## Implementation Guardrails

- Maintain strong internal feature boundaries.
- Extract a service only after a measured scaling, ownership, or reliability need.
- Any extraction requires a separate ADR.

---

# ADR-026 — Exclude BYOK from the Core MVP

## Status

Accepted

## Context

Bring Your Own Key requires secure credential storage, provider-specific key validation, rotation, permissions, and stronger support expectations.

## Decision

Keep BYOK in the production roadmap.

The MVP may retain interface compatibility, but it must not present BYOK as complete.

## Alternatives Considered

### Implement BYOK immediately

Rejected because it expands the security and support scope significantly.

## Consequences

### Positive

- Lower secret-management risk.
- Faster core delivery.
- Fewer provider-specific admin flows.

### Negative

- Enterprise differentiation is reduced in the first release.
- Customers must use platform-managed providers.

## Implementation Guardrails

- No plaintext provider keys in MongoDB.
- No incomplete BYOK UI.
- Provider interfaces should remain capable of adding BYOK later.
- BYOK requires a new security review and ADR before implementation.

---

# ADR-027 — Defer REQUIRE_APPROVAL Workflow

## Status

Accepted

## Context

The policy engine design includes `REQUIRE_APPROVAL`, but approval introduces queues, reviewer assignment, expiration, notifications, resume behavior, and UI state.

## Decision

The MVP policy actions are:

- `ALLOW`
- `ALLOW_WITH_MASK`
- `BLOCK`

`REQUIRE_APPROVAL` remains roadmap-only.

## Alternatives Considered

### Add a basic approval table

Rejected because even a “basic” approval workflow affects chat UX, persistence, notification, and authorization.

## Consequences

### Positive

- Policy engine stays simple.
- Request flow remains synchronous and understandable.

### Negative

- Medium-risk prompts cannot be manually reviewed.
- The system must choose between mask and block.

## Implementation Guardrails

- API enums must not falsely advertise approval as implemented.
- Documentation must label approval as roadmap.
- Adding approval requires new UX, API, database, and security ADRs.

---

# ADR-028 — Defer Full-Text Search over Encrypted Content

## Status

Accepted

## Context

Prompts and responses are encrypted at rest.

MongoDB cannot directly perform meaningful full-text search on ciphertext.

## Decision

MVP search supports metadata only:

- employee;
- provider;
- date range;
- PII flag;
- status;
- conversation identifiers where authorized.

## Alternatives Considered

### Store searchable plaintext copies

Rejected because it defeats encryption.

### Decrypt and scan all messages at query time

Rejected due to security and performance risks.

### Dedicated encrypted search system

Deferred due to complexity.

## Consequences

### Positive

- Encryption guarantee remains intact.
- Search implementation stays simple.

### Negative

- Admins cannot search prompt content.
- Support investigations rely on metadata.

## Implementation Guardrails

- UI must not promise content search.
- Search indexes must exclude encrypted content.
- Future content search requires a separate security design.

---

# ADR-029 — Make Cross-Tenant Tests Release-Blocking

## Status

Accepted

## Context

A tenant-isolation defect could expose one organisation’s sensitive AI activity to another organisation.

## Decision

Cross-tenant authorization tests are mandatory release gates.

At minimum, tests must verify:

- conversation access;
- message access;
- request-log access;
- billing access;
- alert access;
- policy settings;
- retention settings;
- audit export;
- team-lead scope.

## Alternatives Considered

### Rely only on code review

Rejected because query omissions are easy to miss.

### Test only happy paths

Rejected because isolation failures usually appear in negative paths.

## Consequences

### Positive

- Highest-risk authorization behavior is continuously verified.
- Regression risk is reduced.

### Negative

- Test setup is more complex.
- CI must maintain multi-organisation fixtures.

## Implementation Guardrails

- Every tenant-owned repository query requires a negative cross-tenant test.
- Any failed isolation test blocks release.
- Super-admin behavior must be tested separately and explicitly.

---

# ADR-030 — Prefer Honest MVP Documentation over Enterprise Claims

## Status

Accepted

## Context

The architecture describes both MVP and future production patterns.

Presenting roadmap functionality as implemented would mislead reviewers and create unrealistic expectations.

## Decision

Every document and README must distinguish:

- implemented;
- planned for MVP;
- optional after core MVP;
- production roadmap;
- explicitly out of scope.

## Alternatives Considered

### Present the target architecture as current state

Rejected because it is inaccurate.

## Consequences

### Positive

- Clear scope.
- Better project credibility.
- Easier planning.
- Fewer hidden expectations.

### Negative

- The initial feature list appears smaller.
- Some enterprise capabilities remain visibly incomplete.

## Implementation Guardrails

- No SOC 2 or ISO 27001 certification claim.
- No “production ready” claim without operational evidence.
- No feature may be documented as complete before implementation and testing.
- Roadmap items must remain clearly labelled.

---

## 4. Rejected and Deferred Technology Summary

| Technology or Feature | Decision | Reason |
|---|---|---|
| Microservices | Rejected for MVP | Too much operational complexity |
| Kafka | Rejected for MVP | BullMQ is sufficient at expected scale |
| Kubernetes/GKE | Rejected for MVP | Cloud Run and simple worker hosting are enough |
| WebSockets | Rejected for chat MVP | One-way fetch streaming is sufficient |
| ML intent classifier | Deferred | Rule-based logic is easier to test and explain |
| NER-based PII system | Deferred | Regex-based MVP is more realistic |
| BYOK | Deferred | Secret-management scope is too large |
| REQUIRE_APPROVAL | Deferred | Requires a complete workflow |
| SSO/SAML | Deferred | Enterprise identity integration is not MVP |
| Multi-region deployment | Deferred | One region is sufficient initially |
| Shared distributed circuit breaker | Deferred | Start with one API instance or accept per-instance state |
| Full OpenTelemetry rollout | Deferred | Pino and metrics are enough for MVP |
| Search over encrypted prompts | Rejected for MVP | Conflicts with encryption and simplicity |
| Tamper-proof external audit store | Deferred | Application-level append-only log is MVP baseline |

---

## 5. ADR Traceability Matrix

| ADR | Related Area |
|---|---|
| ADR-001 | SDD modular monolith |
| ADR-002 | TDD backend stack |
| ADR-003 | Provider design |
| ADR-004 | Security-critical request order |
| ADR-005 | PII pipeline |
| ADR-006 | Routing engine |
| ADR-007 | Resilience |
| ADR-008 | API streaming |
| ADR-009 | Database design |
| ADR-010 | Data separation |
| ADR-011 | Redis design |
| ADR-012 | Background jobs |
| ADR-013 | Authentication |
| ADR-014 | RBAC |
| ADR-015 | Retention |
| ADR-016 | Encryption |
| ADR-017 | Audit logging |
| ADR-018 | API standards |
| ADR-019 | Pagination |
| ADR-020 | Observability |
| ADR-021 | Containerization |
| ADR-022 | API deployment |
| ADR-023 | Worker deployment |
| ADR-024 | Async architecture scope |
| ADR-025 | Service boundaries |
| ADR-026 | BYOK scope |
| ADR-027 | Policy scope |
| ADR-028 | Search limitation |
| ADR-029 | Testing release gate |
| ADR-030 | Documentation integrity |

---

## 6. How to Add a New ADR

Create a new entry using this structure:

```md
# ADR-XXX — Decision Title

## Status

Proposed

## Context

Explain the problem and constraints.

## Decision

State the selected decision clearly.

## Alternatives Considered

Describe realistic alternatives.

## Consequences

### Positive

### Negative

## Implementation Guardrails

List rules that prevent accidental violation.
```

Do not edit an accepted ADR to reverse its meaning.

When a decision changes:

1. create a new ADR;
2. mark the old ADR as `Superseded`;
3. reference the new ADR number;
4. explain the migration impact.

---

## 7. Architecture Decision Review Checklist

Before accepting a future ADR, confirm:

- [ ] It solves a current, demonstrated problem.
- [ ] It does not add unnecessary MVP scope.
- [ ] It explains at least one realistic alternative.
- [ ] Security and tenant isolation were considered.
- [ ] Operational cost was considered.
- [ ] Testing impact was considered.
- [ ] Migration impact was considered.
- [ ] The decision is understandable to a beginner developer.
- [ ] The decision does not contradict an accepted ADR.
- [ ] Any contradiction is resolved through superseding ADRs.

---

# 8. ADR Self-Audit

## 8.1 Scope Audit

**Result: PASS**

- No new product feature was added.
- BYOK, approval workflow, SSO, ML routing, ML PII, Kafka, and Kubernetes remain deferred.
- Decisions are limited to the already approved ProxiAI architecture.

## 8.2 Beginner Solo-Developer Audit

**Result: PASS**

The decisions reduce implementation complexity through:

- one modular monolith;
- one backend language;
- one primary database;
- one Redis instance;
- BullMQ without Kafka;
- deterministic routing and PII rules;
- one API deployment;
- one worker process initially.

## 8.3 Security-Order Audit

**Result: PASS**

The ADRs preserve this required order:

```text
Authentication
→ tenant and permission resolution
→ validation
→ idempotency
→ rate limiting
→ PII detection
→ risk scoring
→ policy decision
→ cache
→ routing
→ provider call
```

Blocked prompts cannot reach a provider.

## 8.4 Tenant-Isolation Audit

**Result: PASS**

- `orgId` is required in tenant-owned data.
- Tenant filtering is required on every query.
- Permission checks do not replace tenant checks.
- Cross-tenant tests are release-blocking.

## 8.5 Sensitive-Data Audit

**Result: PASS**

- Raw sensitive values are excluded from logs and audit metadata.
- Detected PII is excluded from prompt cache.
- Worker payloads do not contain raw prompts.
- Encrypted content cannot silently fall back to plaintext.
- Full-text search over encrypted content is not promised.

## 8.6 Reliability Audit

**Result: PASS FOR MVP**

- Retry is bounded.
- Circuit breaker and fallback behavior are defined.
- BullMQ jobs are durable and idempotent.
- Worker scale-to-zero risk is explicitly addressed.
- In-memory circuit state remains a documented MVP limitation.

## 8.7 Data Design Audit

**Result: PASS**

- Message, request-log, audit, and billing concerns are separated.
- Cursor pagination matches chronological indexes.
- Retention is enforced before persistence.
- Audit records remain append-only at application level.

## 8.8 Documentation Consistency Audit

**Result: PASS**

The ADRs align with:

- PRD scope;
- modular-monolith SDD;
- TypeScript TDD;
- MongoDB database design;
- authenticated fetch-streaming API;
- security threat model;
- Cloud Run deployment architecture;
- testing release gates;
- beginner-friendly README.

## 8.9 Known Limitations

These are accepted MVP limitations, not hidden defects:

1. Circuit-breaker state may be local to one API instance.
2. Regex-based PII detection is incomplete.
3. Message content cannot be full-text searched.
4. Audit storage is append-only but not externally tamper-proof.
5. Worker scaling starts with one instance.
6. OpenTelemetry is not fully implemented.
7. No BYOK, SSO, approval workflow, or multi-region deployment.
8. Provider cost and capability data require manual maintenance.

---

# 9. Final Approval

The architecture decisions in this document are:

- consistent with the approved ProxiAI MVP;
- realistic for a beginner solo developer;
- secure enough to serve as an implementation baseline;
- explicit about limitations and deferred capabilities;
- structured so future decisions can supersede them cleanly.

> **Final Status: Approved as the Architecture Decision Record baseline for the ProxiAI beginner solo-developer MVP.**
