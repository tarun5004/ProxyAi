# ProxiAI System Design Document (SDD)

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | System Design Document |
| Version | 1.0 |
| Status | MVP Baseline |
| Intended audience | Solo developer, reviewer, tester, interviewer |
| Primary inputs | `docs/01_PRD.md` and ProxiAI Architecture Document v2.0 |
| Scope rule | No product feature beyond the approved PRD is introduced |
| Delivery approach | Five-week beginner-friendly solo-developer MVP |

## 2. Purpose

This document defines how the approved ProxiAI MVP will be structured as a working software system. It translates product requirements into system boundaries, components, runtime flows, data ownership, integration rules, failure behaviour, deployment topology, and implementation sequencing.

This is a system-level design. It explains how major parts work together without prescribing every class, function, or line of code. Low-level implementation details belong in the later Technical Design Document.

## 3. Scope Guardrails

The system design is intentionally limited to the already approved MVP.

### 3.1 Included

- Multi-tenant organisation and user isolation
- Email/password authentication
- JWT access tokens and rotating refresh tokens
- Employee, team lead, organisation administrator, and minimal super-administrator roles
- Conversation and message handling
- Three LLM provider adapters behind one shared interface
- Regex-based PII and secret detection
- Static PII classification and weighted risk scoring
- Policy outcomes: `ALLOW`, `ALLOW_WITH_MASK`, and `BLOCK`
- Manual and basic automatic routing
- Retry, exponential backoff, jitter, circuit breaker, and fallback
- SSE response streaming
- Redis idempotency, provider health, and BullMQ support; prompt-cache implementation deferred to Phase 9 prerequisites
- MongoDB persistence
- Metadata-only and encrypted-storage retention modes
- Basic billing, analytics, anomaly, provider-health, and failed-enqueue
  recovery workers; email delivery is deferred to Phase 8 pending provider and
  template approval
- Append-only audit logging
- Basic admin dashboard APIs
- Structured logs, core metrics, Docker Compose, and ECS/Fargate release proof

### 3.2 Explicitly deferred

- Approval workflows
- SSO or SAML
- Machine-learning PII detection
- Machine-learning intent classification
- Kafka
- Multi-region deployment
- Distributed circuit-breaker state
- Seamless provider switching after partial streaming
- Advanced enterprise policy language
- Full compliance certification
- Full BYOK implementation
- Advanced payment automation
- Prompt-cache response storage and delivery until a dedicated encrypted/reference cache-value and accounting contract is approved
- Safe completed-response replay and durable post-provider crash reconciliation

## 4. System Context

ProxiAI sits between an organisation's users and external LLM providers.

```text
Employee or Admin
       |
       v
React Web Application
       |
       v
ProxiAI API
  |    |    |    |
  |    |    |    +--> Redis / BullMQ
  |    |    +-------> MongoDB
  |    +------------> LLM Provider Adapters
  +-----------------> Metrics and Logs
```

The user never calls an LLM provider directly through the product. Every request passes through authentication, tenant resolution, idempotency, PII detection, policy evaluation, routing, and resilience controls.

## 5. Design Principles

1. **Policy before provider:** no provider call occurs before PII and policy checks finish.
2. **Tenant isolation by default:** every tenant-owned query includes `orgId` from trusted authentication context.
3. **Provider independence:** business code depends on `ProviderAdapter`, not provider SDKs.
4. **Thin synchronous path:** authoritative append-only `RequestLog` persistence may remain synchronous, but billing rollup reconciliation, analytics, anomaly checks, and emails run asynchronously and never delay an already completed provider response.
5. **Explainable decisions:** routing and policy results include a reason suitable for logs and the admin UI.
6. **Safe failure:** blocked prompts, missing tenant context, and invalid authentication fail closed.
7. **Simple MVP operations:** one API service, one worker service, MongoDB, and Redis.
8. **No premature distribution:** interfaces allow future scaling, but the MVP remains one deployable backend codebase.

## 6. High-Level Architecture

### 6.1 Logical layers

| Layer | Responsibility |
|---|---|
| Web client | Login, chat, streaming display, conversation view, basic admin dashboard |
| API edge | HTTP routing, request IDs, authentication, rate limiting, validation, error envelope |
| Business features | Auth, chat, PII, policy, routing, providers, retention, audit, admin |
| Async processing | Billing, analytics, anomaly, email, and health workers |
| Data layer | MongoDB repositories and Redis-backed state |
| Provider integration | Groq, Gemini, and one additional provider adapter |
| Operations | Pino logs, health endpoints, Docker, ECS/Fargate, and CloudWatch logs |

### 6.2 Deployable units

The MVP uses two application processes from one repository:

1. **API process**
   - Handles HTTP and SSE traffic
   - Performs synchronous request processing
   - Publishes jobs or events

2. **Worker process**
   - Runs BullMQ workers
   - Performs billing, analytics, anomaly, provider-health, and failed-enqueue
     recovery jobs

Supporting services:

- MongoDB
- Redis
- React frontend
- Optional Prometheus and Grafana in local/demo environments

## 7. Recommended Repository Structure

```text
proxiai/
├── backend/
│   ├── src/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── organisations/
│   │   │   ├── users/
│   │   │   ├── conversations/
│   │   │   ├── chat/
│   │   │   ├── pii/
│   │   │   ├── policy/
│   │   │   ├── routing/
│   │   │   ├── providers/
│   │   │   ├── retention/
│   │   │   ├── audit/
│   │   │   ├── billing/
│   │   │   ├── alerts/
│   │   │   └── admin/
│   │   ├── shared/
│   │   │   ├── config/
│   │   │   ├── database/
│   │   │   ├── redis/
│   │   │   ├── events/
│   │   │   ├── errors/
│   │   │   ├── middleware/
│   │   │   ├── responses/
│   │   │   ├── logging/
│   │   │   ├── metrics/
│   │   │   └── security/
│   │   ├── workers/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   └── worker.ts
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── app/
│   ├── Dockerfile
│   └── package.json
├── docs/
│   ├── 01_PRD.md
│   └── 02_SDD.md
├── docker-compose.yml
└── .env.example
```

The structure is feature-based so a beginner can find all code for one capability in one location.

## 8. Component Design

## 8.1 Web Client

### Responsibilities

- Authenticate users
- Store access token only in application memory
- Use secure refresh-token cookie through backend endpoints
- Create and list conversations
- Send prompts with a client-generated request ID
- Render SSE chunks incrementally
- Display masked, blocked, retried, and failed states clearly
- Show role-appropriate admin screens

### Boundaries

- The frontend must not enforce security by itself.
- The frontend may hide unavailable actions, but every permission and feature flag is rechecked by the backend.
- Provider keys and encryption keys never enter frontend code.

## 8.2 API Middleware Pipeline

Recommended order:

```text
Request ID
  -> security headers
  -> CORS
  -> JSON/body limit
  -> request logging context
  -> authentication
  -> organisation resolution
  -> account and organisation status
  -> rate limiting
  -> permission/feature checks
  -> request validation
  -> feature controller
  -> global error handler
```

### Important rule

`orgId` must be taken from the authenticated user/session context. An `orgId` supplied by the client may be used only as a comparison value and must never override trusted context.

## 8.3 Authentication Component

### Access token

- JWT
- Short lifetime, recommended 15 minutes
- Contains user identifier, organisation identifier, role, and session identifier
- Signed with a server-side secret

### Refresh token

- Random opaque token
- Stored as a hash in MongoDB
- Stored in `httpOnly`, `Secure`, `SameSite` cookie
- One-time use
- Recommended lifetime: seven days
- Belongs to a token family

### Rotation flow

```text
Client sends refresh cookie
  -> hash token
  -> load refresh-token record
  -> validate expiry/revocation/usedAt
  -> mark old token used
  -> create replacement token in same family
  -> issue new access token
```

### Reuse detection

If a used refresh token is submitted again:

- Revoke the whole token family
- Reject the request
- Create an audit event
- Require the user to sign in again

## 8.4 Organisation and Tenant Component

### Responsibilities

- Store organisation plan and status
- Store monthly token budget
- Store retention mode
- Store PII thresholds
- Store feature flags
- Provide trusted organisation context to each request

### Isolation rule

Every organisation-owned repository method must require `orgId` as an argument.

Good:

```text
findConversationById(orgId, conversationId)
```

Unsafe:

```text
findConversationById(conversationId)
```

## 8.5 User and RBAC Component

### Roles

- `EMPLOYEE`
- `TEAM_LEAD`
- `ORG_ADMIN`

### MVP permissions

| Permission | Employee | Team Lead | Org Admin |
|---|---:|---:|---:|
| Send chat | Yes | Yes | Yes |
| View own conversations | Yes | Yes | Yes |
| View team request logs | No | Yes | Yes |
| View organisation dashboard | No | No | Yes |
| Manage organisation users | No | No | Yes |
| Configure policy and budget | No | No | Yes |
| Export audit data | No | No | Yes |
| View platform provider health | No | No | No | Yes |

The super-administrator role must not automatically read organisation prompt content.

## 8.6 Conversation and Message Component

### Responsibilities

- Create conversations
- List user's conversations
- Load one conversation with messages
- Update conversation metadata after each message
- Apply retention rules before storing message content

### Ownership rules

- Employee: only own conversations
- Team lead: no conversation-content access by default in MVP; only team request metadata
- Organisation admin: request/audit metadata; prompt content access should remain excluded unless explicitly approved later

This keeps the beginner MVP safer and avoids adding a new content-review feature.

## 8.7 PII Pipeline

The synchronous PII pipeline has three implementation stages and one handoff:

```text
Detection -> Classification -> Risk Score -> Policy Engine
```

### Detection

Regex or deterministic checks identify candidate values such as:

- Email addresses
- Phone numbers
- Payment-card-like values
- Government-identifier-like values
- API keys
- Password or connection-string patterns
- IP addresses
- Organisation-configured confidential terms, only if already present in the approved configuration

### Classification

Each match is mapped to a category:

- `CONTACT_INFO`
- `FINANCIAL`
- `GOVERNMENT_ID`
- `CREDENTIAL`
- `INTERNAL_SECRET`
- `BUSINESS_CONFIDENTIAL`

### Risk score

MVP uses a deterministic weighted sum capped at 100.

Recommended initial weights:

| Category | Weight |
|---|---:|
| Contact information | 10 |
| Business confidential | 20 |
| Financial | 25 |
| Government identifier | 30 |
| Credential | 40 |
| Internal secret | 40 |

These values remain configuration constants until real test data justifies changes.

### PII result

```text
PiiAssessment
- detected: boolean
- riskScore: number
- categories: string[]
- maskedText: string
- matchCount: number
```

Raw matched values must not be returned in audit metadata.

## 8.8 Policy Engine

### Input

- Organisation policy thresholds
- PII assessment
- Budget status
- User and role context
- Feature flags

### Decision order

1. Reject inactive user or organisation before this component.
2. Block if budget is exhausted.
3. Block if risk score meets or exceeds block threshold.
4. Mask if risk score meets or exceeds mask threshold.
5. Otherwise allow.

### Output

```text
PolicyDecision
- action: ALLOW | ALLOW_WITH_MASK | BLOCK
- reasonCode: string
- providerPrompt?: string
- riskScore: number
- categories: string[]
```

### Safety invariant

Only `providerPrompt` may be passed to the routing and provider layers. The original prompt must not be passed after a masking decision.

## 8.9 Provider Abstraction

```ts
interface ProviderAdapter {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(tokensIn: number, tokensOut: number): number;
}
```

### Adapter responsibilities

- Translate common request to provider SDK format
- Translate provider output to common response/chunk format
- Normalize provider-specific errors
- Calculate estimated cost
- Expose capabilities
- Avoid leaking provider SDK types into business code

### Provider error categories

- `RATE_LIMITED`
- `TIMEOUT`
- `PROVIDER_UNAVAILABLE`
- `AUTHENTICATION_FAILED`
- `INVALID_REQUEST`
- `CONTENT_REJECTED`
- `UNKNOWN_PROVIDER_ERROR`

Only rate limits, timeouts, and transient provider failures are retryable.

## 8.10 Capability Registry

The registry contains static MVP data:

- Provider ID
- Supported models
- Streaming support
- Maximum context estimate
- Cost estimate
- Average latency seed value
- Provider tier: fast, balanced, or power

Live Redis health data overlays this configuration but does not replace it.

## 8.11 Routing Engine

### Inputs

- Manual provider choice, when present
- Prompt intent
- Estimated prompt size
- Budget remaining
- Provider capabilities
- Live health
- Recent average latency
- Estimated cost

### MVP intent classifier

Rule-based categories:

- `simple_qa`
- `summarization`
- `code_generation`
- `code_debugging`
- `data_analysis`
- `creative_writing`
- `unknown`

### Selection algorithm

1. Load providers allowed by the subscription plan.
2. Exclude providers without required capability.
3. Exclude providers whose circuit is open.
4. Respect manual provider selection when allowed and healthy.
5. Score remaining providers.
6. Sort by score descending.
7. Break ties by lower estimated cost.
8. Return the ordered list as the fallback chain.

### MVP score

```text
score =
  0.4 * capabilityMatch
+ 0.2 * normalizedHealth
+ 0.2 * inverseLatency
+ 0.2 * inverseCost
```

The exact values are constants, not tenant-configurable in the MVP.

### Routing output

```text
RoutingDecision
- primaryProvider
- fallbackProviders[]
- intent
- reason
- candidateScores[]
```

The admin dashboard may display the reason, but not internal secrets or raw PII.

## 8.12 Retry and Circuit Breaker

### Retry

- Maximum three attempts per provider call
- Exponential backoff
- Random jitter
- Retry only transient failures
- Respect an overall request timeout

### Circuit states

- `CLOSED`: requests allowed
- `OPEN`: requests rejected immediately
- `HALF_OPEN`: one trial request allowed after cooldown

### MVP state storage

- In memory inside the API instance
- Health summary also written to Redis for routing visibility
- Single API instance recommended for the first working MVP

This limitation is documented and not hidden. True shared circuit state is deferred.

## 8.13 Chat Orchestration Component

The chat orchestration service coordinates the synchronous request path.

### Ordered flow

1. Authenticate and resolve current User, Organisation, permissions, and owned Conversation.
2. Validate the strict request body.
3. Acquire tenant/user idempotency state.
4. Enforce tenant/user rate limits and load authoritative budget status.
5. Run PII/classification/risk and evaluate policy.
6. Append the safe durable policy AuditLog before any provider path.
7. When blocked, append one safe `BLOCKED` RequestLog, publish the
   analytics-only `request.blocked` event, and return the block response
   without routing.
8. Determine the approved provider prompt.
9. Check eligible prompt cache only after its deferred prerequisites exist.
10. Build routing decision and call providers in fallback order.
11. Stream chunks to the client.
12. Finalize only actual usage details returned by the provider.
13. Persist the authoritative append-only `RequestLog` record.
14. Apply the retention writer: metadata-only Message records or encrypted
    user/assistant Messages only after successful provider completion.
15. Mark idempotency result completed.
16. Publish the safe `request.completed` job/event with explicit outcome
    status and policy action.
17. Emit terminal SSE completion/error honestly.

The API waits for the authoritative request record and queue publication attempt, but it does not wait for billing, analytics, anomaly, email, or provider-health workers. Queue publication failure must be surfaced operationally without inventing usage or reversing an already delivered provider response.

### Critical boundary

If the database write or an asynchronous worker fails after the response is already streamed, the system must log the operational failure. It must not pretend the already delivered provider response failed.

## 8.14 SSE Streaming

### Server behaviour

- Set `Content-Type: text/event-stream`
- Disable response buffering where applicable
- Send heartbeat comments periodically when needed
- Send token or text chunks as `message` events
- Send one final `done` event with safe usage metadata
- Send a safe `error` event on failure
- Close the connection cleanly

### Event examples

```text
event: message
data: {"text":"Hello"}

event: notice
data: {"code":"PROMPT_MASKED"}

event: done
data: {"requestId":"...","provider":"..."}
```

### Mid-stream failure

The MVP does not splice another provider's output into a partial response. It sends an interruption notice, records the failed attempt, and allows the user to retry.

## 8.15 Redis Responsibilities

Redis is used for four clearly separated purposes.

### Prompt cache

```text
cache:prompt:{opaqueHmac(canonicalCacheInput)}
```

- Eligibility requires `ALLOW`, risk score `0`, and zero detected sensitive spans.
- `ALLOW_WITH_MASK`, `BLOCK`, and `METADATA_ONLY` requests are not cacheable.
- Scope is the trusted organisation. Organisation-wide reuse is allowed only when the request has no user-specific context.
- The HMAC input binds trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and a deterministic policy/config fingerprint.
- Prompt whitespace or casing is not normalized unless a later approved contract defines that transformation.
- Plaintext assistant responses are not approved for Redis. A future value must use an encrypted payload or an access-checked safe reference.
- `PROMPT_CACHE_TTL_SECONDS=3600` is required with no hidden default when cache implementation is enabled.
- Cache reads and writes fail open; idempotency remains a separate fail-closed control.
- Cache implementation remains deferred because the Phase 9 Message store is
  not a replay cache and accounting cannot yet represent non-billable cache
  delivery.

### Idempotency

```text
chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}
```

States:

- `PROCESSING`
- `COMPLETED`

`PROCESSING` TTL is 300 seconds. `COMPLETED` TTL is 3600 seconds. Redis/idempotency failures fail closed with `IDEMPOTENCY_UNAVAILABLE`. Safe completed-response replay remains deferred.

Both states store only status, server `requestId`, the relevant timestamp, and an opaque request fingerprint. The fingerprint binds canonical non-sensitive request fields plus a domain-separated HMAC of the exact prompt bytes; raw prompt content is never stored. Reusing one client request ID with a different fingerprint returns `409 DUPLICATE_REQUEST`.

`COMPLETED` is a non-replayable tombstone. It stores no HTTP response, provider response, token usage, or final API status/code, and every completed duplicate returns `409 DUPLICATE_REQUEST`. Response replay remains deferred; the Phase 9 encrypted Message store is not an idempotency replay contract.

If a process dies after provider execution may have started, the `PROCESSING` record can expire after 300 seconds and permit a later retry. The MVP documents this limitation and does not invent unsafe automatic reconciliation; durable recovery/replay remains deferred.

### Provider health

```text
health:{providerId}
```

Contains:

- Safe state: `HEALTHY`, `UNHEALTHY`, or `UNKNOWN`
- Last checked time

Phase 7 keeps provider-health state in Redis only with a 120-second TTL. A
missing, expired, or unreadable value is `UNKNOWN`. The scheduled worker runs
every 60 seconds for provider IDs obtained from the approved enabled-provider
registry. Queue jobs and keys never accept a client-supplied provider ID.

Routing consumes this state only as a conservative eligibility overlay:
`UNHEALTHY` skips that provider, while `HEALTHY` and `UNKNOWN` leave the existing
capability, circuit-breaker, retry, and ordered-fallback rules unchanged. Redis
failure therefore falls back to `UNKNOWN`; it does not create new routing
scores or intelligence. MongoDB provider-health history is deferred to Phase
10 observability.

Adapter health maps into the Redis contract as `healthy -> HEALTHY`,
`degraded -> UNKNOWN`, and `unhealthy -> UNHEALTHY`. A transient degraded probe
therefore remains observable without blocking normal routing.

### BullMQ

Redis also stores job queues and worker state.

## 8.16 Event and Queue Design

The MVP may use direct BullMQ job publication instead of implementing two separate messaging abstractions. This keeps the solo-developer system simpler while preserving asynchronous boundaries.

### Queue catalog

| Queue | Trigger | Responsibility |
|---|---|---|
| `billing-queue` | Request completed | Update monthly usage and cost rollup |
| `analytics-queue` | Request completed or policy blocked | Update daily organisation and user aggregates |
| `anomaly-queue` | Analytics `usage.updated` | Compare scoped daily known usage with the approved rolling baseline |
| `email-queue` | Alert created | Deferred to Phase 8 pending provider/configuration/template approval |
| `health-check-queue` | Repeating schedule | Check provider availability and latency |
| `recovery-queue` | Repeating schedule | Reconcile persisted RequestLogs whose required billing/analytics publication did not complete |
| `retention-queue` | Deferred | No custom TTL or automated content deletion in the MVP |

### Common job fields

```text
- schemaVersion
- jobType
- requestId
- orgId when tenant-owned
- userId when the job requires user scope
- providerId and model when request-derived
- explicit canonical outcome status
- explicit canonical policy action
- optional complete token-usage object
- optional estimatedCostMicros
- occurredAt
```

`requestId` is the canonical correlation ID across API logs, queue jobs, and workers. No separate `traceId` is introduced in Phase 7. If distributed tracing is added later, its trace identifier is mapped alongside `requestId` and does not replace it.

Queue payloads are constructed field-by-field and never contain raw prompts, masked prompts, provider responses, detected PII values, email addresses, credentials, cookies, tokens, encryption keys, or arbitrary objects.

The request outcome event contract is a strict discriminated union:

- `request.completed` carries `status` as `COMPLETED`, `FAILED`, or
  `INTERRUPTED`; `policyAction` is `ALLOW` or `ALLOW_WITH_MASK`; and the
  selected provider and model are required.
- `request.blocked` carries `status: BLOCKED` and `policyAction: BLOCK`.
  Provider, model, usage, and cost fields are forbidden because no provider
  execution occurs.

The append-only RequestLog is written before either event publication attempt.
Workers never infer an outcome from missing fields and never mutate RequestLog.
Queue failure is surfaced with safe operational metadata and does not change
the already determined HTTP/SSE outcome.

### Job rules

- Jobs must be idempotent.
- Retry three times with exponential backoff.
- Only transient dependency and availability failures are retryable. Invalid schemas, missing trusted identifiers, unsupported versions, and genuinely unavailable provider usage or pricing are terminal data outcomes.
- After bounded retries, jobs remain in BullMQ's failed set as the MVP dead-letter/failure-visibility mechanism.
- BullMQ's failed set plus safe structured logs are the Phase 7 failure-visibility
  source. Bull Board is deferred to optional controlled Phase 10 tooling and
  must never be exposed publicly.
- Email failure must not reverse billing or request completion.

## 8.17 Retention Component

### Supported MVP modes

1. `METADATA_ONLY`
2. `ENCRYPTED_STORAGE`

Custom TTL, `CUSTOM_RETENTION`, and automated content deletion are deferred.

### Metadata-only behaviour

Store:

- Organisation and user IDs
- Conversation and request references
- Provider and model
- Token counts and estimated cost
- Latency
- PII score and categories
- Routing reason
- Cache and fallback flags
- Timestamps

Do not store prompt or response content.

### Encrypted-storage behaviour

In addition to metadata:

- Encrypt prompt and response using AES-256-GCM
- Store initialization vector, authentication tag, and ciphertext
- Keep master key outside MongoDB
- Never log decrypted content
- Bind ciphertext to trusted tenant/resource context through versioned AAD
- Use the active version from the validated application keyring for new writes

### Enforcement point

Retention is applied before constructing the persistence document. The system must not create a full-content object and later remove fields.

### Phase 5 chat-content boundary

- Phase 5 is metadata-only. Conversation message reads return `messageId`, lowercase API `role`, optional `tokenCount`, `createdAt`, and `contentAvailable` only.
- When `contentAvailable` is `false`, `content` is omitted. `contentEnc` and all encryption metadata are never API fields.
- `METADATA_ONLY` never persists message content. `ENCRYPTED_STORAGE` message persistence and authorised decryption are Phase 9 responsibilities using AES-256-GCM.
- Successful stream-completion persistence begins only in Phase 9. Partial or interrupted assistant output is never persisted.
- Phase 9 encrypts manual custom conversation titles at rest and keeps only the fixed `New conversation` fallback plaintext; owner list/read/rename paths decrypt after scope checks.
- Conversation titles remain manual through authenticated `PATCH /api/v1/conversations/:conversationId`; prompt-derived and LLM-generated titles are prohibited.
- Attachments are deferred from the current MVP. No upload endpoint, multipart request, storage reference, or paperclip/upload UI is approved until storage, MIME and size allowlists, malware scanning, tenant ownership, provider capability, retention, and deletion are specified.

## 8.18 Audit Component

### Events included

- Login success and failure
- Logout
- Refresh-token reuse detection
- Policy allow, mask, and block decisions
- User role or status changes
- Budget changes
- Retention changes
- PII threshold changes
- Audit exports

### Append-only rules

- Application exposes no update or delete endpoint
- Audit schema has `occurredAt`, not `updatedAt`
- Metadata excludes raw prompts, responses, tokens, and credentials

### Minimum fields

```text
orgId
actorId
actorType
action
resourceType
resourceId
metadata
ipAddress
userAgent
requestId
occurredAt
```

`metadata` is action-specific, field-by-field, and bounded to 8 KiB after
serialization. It never receives raw request objects. The Audit repository
exposes append and tenant-scoped reads only; model middleware rejects all
updates, replacements, and deletes.

Admin state changes and their audit entries execute in one MongoDB transaction.
Audit/transaction failure rolls back the mutation and returns
`503 AUDIT_UNAVAILABLE`. Policy decisions write their safe durable event before
provider execution; audit failure therefore cannot allow a provider call.

Authentication/session events keep safety ordering: a required session
revocation is not reversed by a later audit failure, and login attempts without
a trusted organisation never invent tenant scope for an AuditLog.

## 8.19 Billing and Usage Component

The MVP tracks estimated usage; it does not promise invoice-grade accounting.

### Inputs

- Input tokens
- Output tokens
- Provider
- Model
- Provider cost configuration
- Cache-hit flag
- Request outcome

### Rollup key

```text
orgId + period + optional userId
```

### Rules

- Future cache hits do not create a provider cost; cache delivery remains
  unimplemented pending its dedicated value, fingerprint, and accounting
  prerequisites.
- Failed attempts may be recorded for operations, but billed cost is added only when provider usage is reported or reliably estimated.
- Budget checks read current monthly rollup plus any accepted in-flight reservation approach implemented later. For the beginner MVP, small race conditions under high concurrency are acknowledged.

## 8.20 Anomaly Component

### MVP rule

The TDD daily rule is canonical. When the tenant's `anomalyDetection` feature
flag is enabled, compare the user's current UTC-day known token total with the
average of prior active days in the previous seven UTC days. An active baseline
day has fully known token usage; unknown-usage days are excluded rather than
treated as zero. At least three prior active days are required.

Create an anomaly only when:

```text
current daily known tokens > 2 × previous 7-day active-day average
```

No request-level, request-volume, blocked-rate, or provider-error anomaly rule
is included in the MVP.

### Output

- Create or update one tenant-scoped `HIGH` anomaly alert with initial status
  `OPEN`.
- Enforce one unresolved alert for `{ orgId, userId, observedDay, ANOMALY }`.
- Re-evaluation updates or resolves the same record; it never creates a
  duplicate.
- Do not publish email or notification work in P7-07.

No machine learning is used.

## 8.21 Admin Component

Phase 8 is a read-only organisation administration surface backed only by the
implemented `RequestLog`, `AnalyticsDailyAggregate`, `BillingRollup`, `Alert`,
`User`, `Team`, `Organisation`, and Redis provider-health contracts. It does
not expose cost, latency, cache, fallback, routing, or PII-risk metrics that are
not authoritatively persisted. Team-lead logs remain deferred because current
request records have no trusted team ownership.

Security-critical mutations for users, teams, policy, budget, retention, and
alert state remain unavailable until Phase 9 can atomically require a durable
append-only admin audit record. Audit export is also Phase 9. The Phase 8 UI
must not render enabled mutation controls for these deferred operations.

Phase 9 enables only the approved mutation set: deterministic role/permission
changes, same-tenant team assignment, active/disabled status changes, explicit
refresh-session revocation, policy/budget changes, retention-mode changes, and
alert resolution/reopening. User invitation/creation, team CRUD, custom
retention, email delivery, and arbitrary permission editing remain deferred.

### MVP dashboard data

- Requests today and this month
- Known token usage plus explicit unknown-usage count
- Provider/model request counts
- Provider health
- Completed, blocked, masked, failed, and interrupted request counts
- Budget remaining
- Active anomaly alerts
- Read-only users and teams

### Query rules

- Always organisation-scoped
- Team-lead request-log queries remain unavailable until trusted request-to-team ownership exists
- Use date ranges
- Use cursor pagination for log lists
- Never decrypt content for dashboards

## 8.22 Observability Component

### Structured logs

Pino JSON logs with:

- Request ID
- A separate trace ID only after an approved distributed-tracing implementation
- Organisation ID
- User ID
- Route
- Status
- Duration
- Provider
- Error code

Redact:

- Authorization header
- Cookies
- API keys
- Refresh tokens
- Prompt/response content
- Encryption fields

### Metrics

Phase 10 adds process-local Prometheus registries to the API and worker. The API
registry is scraped from the API container; worker metrics use a separate
internal-only worker endpoint. Neither endpoint is routed by the public ALB.
Prometheus labels are platform-wide operational
dimensions only and are never tenant reporting data.

The approved inventory covers HTTP count/duration, chat outcome/completion/TTFT,
provider request/latency/error/retry/fallback/circuit/health, policy decisions,
PII categories, idempotency outcomes, dependency readiness, queue depth/job
outcome/duration, worker health/heartbeat, and audit-write outcomes. Exact metric
names, buckets, and bounded labels are defined in the TDD.

Prompt-cache and completed-response replay metrics are not emitted while those
features remain deferred. Fake zero-valued cache or replay series are
prohibited.

Current implementation status:

| Area | Classification | Evidence or required work |
|---|---|---|
| Structured redacted Pino events and request ID | `ALREADY_COMPLETE` | API and worker emit safe JSON events; request-derived jobs preserve `requestId` |
| Liveness, readiness, Redis provider health, worker heartbeat state | `ALREADY_COMPLETE` | Executable health and lifecycle code exists |
| HTTP completion logging and duration | `PARTIAL` | Rejections/failures are logged, but successful completion timing is not recorded |
| Chat/provider/policy/PII/idempotency/queue/audit metric source events | `PARTIAL` | Bounded domain states exist, but no Prometheus instruments export them |
| Registry, internal scrape endpoints, instrumentation, dashboard, alerts, and runbooks | `IMPLEMENT` | Phase 10 production and operations work |
| Prompt-cache/replay metrics | `DEFER_WITH_APPROVED_REASON` | Cache and replay execution remain deferred pending their approved safe-storage prerequisites |
| MongoDB provider-health history | `DEFER_WITH_APPROVED_REASON` | Existing Redis health plus bounded metrics is sufficient for the MVP; duplicate durable incident history is not required |
| Public Bull Board or manual replay UI | `DEFER_WITH_APPROVED_REASON` | Failed-set metrics and safe logs provide visibility without exposing job payload tooling |

### Tracing

`requestId` remains the canonical application and async-job correlation ID.
Phase 10 must not create an ad hoc second ID or put correlation IDs in metric
labels. Full W3C Trace Context/OpenTelemetry propagation remains deferred until
the collector, sampling, retention, and access-control contracts are approved.

## 9. Data Design Summary

This section defines system ownership and relationships. The detailed database design will be documented separately.

### 9.1 Core collections

| Collection | Purpose | Tenant scoped |
|---|---|---:|
| Organisation | Plan, budget, policy, retention, feature flags | Root tenant |
| User | Identity, role, team, status | Yes |
| RefreshToken | Rotating session token records | Yes |
| Conversation | Conversation metadata | Yes |
| Message | User/assistant messages, optionally encrypted | Yes |
| RequestLog | One request's operational and usage metadata | Yes |
| AuditLog | Append-only security and admin actions | Yes |
| Billing | Monthly usage and estimated cost rollups | Yes |
| Alert | Anomaly, PII, and budget alerts | Yes |
| ProviderHealth | Platform provider state | No, platform scoped |

### 9.2 Relationship overview

```text
Organisation
  ├── Users
  │    ├── RefreshTokens
  │    ├── Conversations
  │    │    └── Messages
  │    ├── RequestLogs
  │    └── Alerts
  ├── Billing Rollups
  └── AuditLogs

ProviderHealth is platform scoped.
```

### 9.3 Index principles

- Every tenant collection begins important compound indexes with `orgId`.
- Conversation messages index by `conversationId` and `createdAt`.
- Request logs index by `orgId` and descending `createdAt`.
- Billing indexes by `orgId` and period.
- Audit logs index by `orgId` and descending `occurredAt`.
- Refresh tokens index token hash uniquely.
- Custom-retention records use a TTL index on `expiresAt` only when that feature is enabled.

## 10. API Design Summary

All routes use `/api/v1`.

### 10.1 Response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "string",
    "nextCursor": "optional"
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Safe user-facing message",
    "requestId": "string"
  }
}
```

### 10.2 Route groups

| Route group | Purpose |
|---|---|
| `/auth` | Login, refresh, logout |
| `/conversations` | Create, list, load conversations |
| `/chat` | Prompt submission and SSE streaming |
| `/admin/users` | User and role management |
| `/admin/settings` | Budget, retention, and policy thresholds |
| `/admin/logs` | Request metadata search and pagination |
| `/admin/audit` | Audit search and export |
| `/admin/dashboard` | KPI data |
| `/admin/alerts` | Alert list and resolution |
| `/health` | Liveness and readiness |
| `/metrics` | Prometheus scrape endpoint |

The complete request and response contracts belong in the OpenAPI document.

## 11. End-to-End Request Flow

```text
1. Client opens chat stream/request.
2. API assigns requestId and log context.
3. Auth middleware validates access token.
4. Organisation context is resolved from trusted token/session data.
5. Permission and feature checks run.
6. Input is validated.
7. Idempotency key is reserved in Redis.
8. Conversation ownership is verified.
9. PII detection, classification, and scoring run.
10. Policy engine returns ALLOW, MASK, or BLOCK.
11. BLOCK returns immediately; no routing or provider call occurs.
12. Effective prompt is selected.
13. Eligible cache entry is checked.
14. Routing engine builds ordered provider list.
15. Provider is called through retry and circuit breaker.
16. Output is streamed through SSE.
17. Final usage and routing metadata are assembled.
18. Retention writer stores allowed metadata/content.
19. Idempotency result is completed.
20. BullMQ jobs are published.
21. Workers update billing, analytics, alerts, email, and health data.
```

## 12. Failure Design

## 12.1 Redis unavailable

| Redis function | Behaviour |
|---|---|
| Prompt cache | Fail open: skip cache and call provider |
| Provider health | Use static capabilities and in-memory circuit state |
| Idempotency | Fail closed for requests that require duplicate protection; return service unavailable |
| BullMQ publication | Log failure and return delivered response if provider response already completed; otherwise fail safely before provider call when practical |

After RequestLog persistence, a failed billing or analytics enqueue creates a
safe durable publication-recovery record. A periodic recovery job also scans
trusted organisations in bounded cursor batches so a crash before that record
is written remains discoverable. It reconstructs only allowlisted job fields
from the append-only RequestLog, uses deterministic queue IDs, and relies on
the existing worker ledgers to prevent duplicate effects. Publication recovery
is limited to three attempts; exhausted recovery records and terminal BullMQ
jobs remain failed and require explicit later operational action.

## 12.2 MongoDB unavailable

- Readiness endpoint reports unhealthy.
- New authenticated requests requiring database reads fail with `503`.
- A running stream may finish if all necessary context was already loaded.
- No fake success is returned for settings or user-management writes.

## 12.3 Provider unavailable before streaming

- Retry transient errors.
- Update breaker state.
- Select the next provider.
- Return safe `PROVIDER_UNAVAILABLE` only after fallback candidates are exhausted.

## 12.4 Provider unavailable during streaming

- Stop the stream.
- Send an interruption event when connection is still writable.
- Record partial failure.
- Do not silently combine another provider's answer.

## 12.5 Worker failure

- Retry through BullMQ.
- Keep failed job visible.
- Do not change the already returned chat result.
- Raise operational metrics/logs.

## 12.6 Encryption failure

- Do not store plaintext as fallback.
- Fail the persistence step.
- Log a safe critical error.
- Surface an operational alert.

## 12.7 Audit-write failure

For security-critical administrative changes:

- Prefer failing the change if its audit record cannot be written.

For policy decisions during chat:

- Log a critical operational event and continue only according to the selected implementation strategy. For the MVP, the preferred behaviour is to fail closed before provider submission when the audit write is synchronous and required.

## 13. Security Architecture

### 13.1 Trust boundaries

1. Browser to ProxiAI API
2. ProxiAI API to MongoDB
3. ProxiAI API/worker to Redis
4. ProxiAI API to external providers
5. Worker to email service
6. Deployment platform to secret storage

### 13.2 Core controls

- TLS for all non-local traffic
- Secure headers
- Strict CORS allowlist
- Request body limits
- Zod validation
- Parameterized MongoDB operations
- Server-side permissions
- Organisation-scoped repositories
- Short access-token lifetime
- Rotating refresh tokens
- Password hashing using a modern adaptive hash
- Rate limiting
- Secret redaction
- AES-256-GCM for stored content
- Non-root production container
- Dependency and image scanning in CI roadmap

### 13.3 Data minimisation

- Store only required metadata in metadata-only mode.
- Never store raw PII matches in audit logs.
- Never include prompt content in ordinary application logs.
- Do not expose provider credentials to clients.

### 13.4 Compliance statement

The system design supports auditability and data-governance controls. It does not by itself make ProxiAI SOC 2, ISO 27001, or otherwise certified.

## 14. Performance and Capacity Assumptions

The MVP targets a portfolio/demo and early pilot scale, not large enterprise production.

### Assumed initial scale

- Up to 50 organisations
- Up to 50 active users per organisation
- Approximately 10,000 requests per day across the platform
- One API instance during initial MVP testing
- One worker process with per-queue concurrency limits

### Primary latency budget

Most end-to-end time will be provider latency. Internal synchronous processing should remain small relative to that.

Recommended observation targets:

| Stage | Observation target |
|---|---:|
| Authentication and tenant resolution | Under 50 ms in normal local/pilot conditions |
| PII pipeline | Under 20 ms for normal prompt size |
| Policy evaluation | Under 10 ms |
| Routing decision | Under 20 ms excluding external health calls |
| Time to first streamed provider chunk | Provider dependent; track p50 and p95 |

These are engineering targets, not guaranteed SLAs.

## 15. Deployment Architecture

## 15.1 Local development

```text
Docker Compose
  ├── frontend
  ├── backend-api
  ├── backend-worker
  ├── redis
  └── nginx gateway
```

### Local rules

- Use `.env` locally, never commit it.
- Provide `.env.example` with placeholder names only.
- The checked-in production-like Compose stack requires an explicit
  container-reachable MongoDB URI and persists local Redis through a named
  volume. It does not bundle Bull Board, Prometheus, or Grafana.
- Use hot reload only in development targets.

## 15.2 Production MVP on AWS

```text
Immutable frontend/backend images -> Amazon ECR

Release proof / rollback baseline:
  Route 53 / ACM / ALB
    -> private ECS/Fargate frontend
    -> private ECS/Fargate API
    -> private ECS/Fargate worker

API and worker -> MongoDB Atlas / managed Redis / Groq
```

ECS/Fargate is the canonical staging, production, and rollback architecture.
The low-traffic public demo uses one task per service and reviewed soft/deep
power controls to bound idle cost. Executable Lightsail artifacts have been
removed from the active tree and remain archived in Git history; Lightsail is
not a current release path or requirement.

### Production container rules

- Multi-stage build
- Production dependencies only
- Run as non-root user
- No source maps containing secrets
- Liveness and readiness endpoints
- Secrets injected at runtime

### Scaling rule

Use one frontend, API, and worker task for the MVP. ECS desired counts are one
while active and zero only during an explicit cost stop. Increase concurrency
only after shared-state limitations and measured load justify it.

## 16. Health Checks

### `/health/live`

Returns `200` as soon as the API listener is active. The listener binds
`0.0.0.0` on the validated runtime `PORT` before network dependencies connect,
so platform liveness remains independent of MongoDB, Redis, and BullMQ startup.

### `/health/ready`

Checks:

- MongoDB connectivity
- Redis connectivity
- Encryption storage readiness
- API billing/analytics queue-producer readiness

Until all required runtime dependencies are ready, `/health/ready` returns
`503` and every `/api/v1` route is rejected with a safe startup/unavailable
error before business handlers execute.

Provider health remains routing/operational state and is intentionally not a
base API readiness dependency.

### `/health/detailed`

Deferred from public exposure. If implemented for admin use, it must require super-administrator permission and must not reveal secrets.

## 17. Configuration Design

All environment variables are validated at startup.

### Configuration groups

- Server and environment
- MongoDB
- Redis
- JWT and refresh-token settings
- Encryption master key
- Provider credentials and model names
- Retry and circuit-breaker values
- PII thresholds and weights
- Queue concurrency
- Email provider
- CORS origins
- Metrics toggle

The process must fail startup when a required production configuration is missing.

## 18. Implementation Sequence

### Week 1 — Core foundation

- Repository structure
- Environment validation
- MongoDB and Redis connections
- Standard response and error handling
- Request ID and Pino logging
- Organisation, user, refresh-token, conversation, message, and request-log models
- Login, refresh, logout
- One provider adapter
- Basic non-streaming chat

### Week 2 — Routing and resilience

- Remaining provider adapters
- Capability registry
- Error normalization
- Retry and backoff
- Circuit breaker
- Static provider health
- Basic routing and fallback

### Week 3 — PII, policy, retention, and jobs

- PII detector and classifier
- Risk scoring
- Policy engine
- Redis idempotency
- Secure prompt-cache contract only; implementation deferred to Phase 9 prerequisites
- Retention writer
- BullMQ queues and workers
- Audit log

### Week 4 — Streaming and admin

- SSE chat
- Conversation UI
- Admin dashboard APIs and UI
- Alerts
- Cursor pagination
- Search filters
- RBAC checks

### Week 5 — hardening and deployment

- Metrics
- Health endpoints
- Docker Compose
- Multi-stage Dockerfile
- AWS ECS/Fargate staging, production, and rollback deployment
- End-to-end tests
- Security review
- Documentation cleanup

## 19. Testing Strategy Summary

The full testing strategy will be a separate document. Minimum system-design coverage is:

### Unit tests

- PII patterns and masking
- Risk scoring
- Policy precedence
- Intent classification
- Routing score
- Retryable error classification
- Circuit transitions
- Retention document construction
- Permission checks

### Integration tests

- Login and refresh rotation
- Refresh-token reuse
- Tenant-scoped conversation access
- Idempotent chat request
- Cache eligibility
- Provider fallback
- Audit creation
- Billing worker idempotency
- MongoDB TTL where enabled

### End-to-end tests

- Normal streamed chat
- Masked prompt
- Blocked prompt
- Provider failure and fallback
- Budget block
- Organisation admin dashboard
- Team-lead filtering

## 20. Architecture Decision Summary

| Decision | MVP choice | Reason |
|---|---|---|
| Backend organisation | Feature-based modular monolith | Simple to understand and deploy |
| API framework | Express with TypeScript | Familiar and fast for solo development |
| Primary database | MongoDB | Flexible event/log structures |
| Cache and queue | Redis | One dependency for cache, health, idempotency, BullMQ |
| Async jobs | BullMQ | Built-in retry and visibility |
| Provider integration | Adapter pattern | Keeps routing provider-independent |
| Streaming | SSE | One-way token stream, simpler than WebSockets |
| Messaging | BullMQ job publication | Simpler than separate Pub/Sub plus queues |
| Pagination | Cursor-based | Stable and index-friendly |
| Content protection | AES-256-GCM | Authenticated encryption |
| Deployment | Docker, ECR, and ECS/Fargate | Separate long-running API and worker containers with immutable digest promotion |

## 21. Known Limitations

1. Circuit-breaker state is not fully shared across multiple API instances.
2. Budget enforcement can have small concurrency races at high parallel load.
3. Regex PII detection can produce false positives and false negatives.
4. Intent classification is heuristic.
5. Cost calculations are estimated from configured provider prices.
6. Mid-stream provider fallback is visible to the user.
7. Prompt-cache implementation is deferred to Phase 9 prerequisites; its approved future contract prohibits caching any detected or masked sensitive content.
8. Full-text search over encrypted content is unsupported.
9. The MVP is not a compliance certification.
10. BYOK and advanced enterprise functions remain deferred.

## 22. Open Technical Questions

These must be resolved before or during implementation without expanding feature scope.

1. Which three providers are practical using available free or low-cost development access?
2. Which provider and model will be the default fallback floor?
3. Will MongoDB be local-only during MVP or use a managed development cluster?
4. Which secure frontend hosting method will be used for the demo?
5. Which provider, sender, timeout, error mapping, and template content will be
   approved before the Phase 8 email implementation?
6. What maximum prompt size will the API accept?
7. Should organisation admins be permitted to view decrypted conversation content? Current design says no.
8. What exact PII regex set will be accepted after false-positive testing?
9. Which provider pricing snapshot will be configured for estimated cost?
10. Will custom TTL retention be completed in MVP or left after metadata/encrypted modes?

## 23. Requirement-to-Component Traceability

| PRD area | Primary component |
|---|---|
| Authentication and sessions | Auth component, RefreshToken collection |
| Tenant isolation | Organisation middleware and scoped repositories |
| User and team roles | RBAC middleware and User collection |
| Chat and conversations | Conversation, Message, Chat orchestration |
| PII detection | PII pipeline |
| Policy decisions | Policy engine |
| Provider support | Provider adapters and capability registry |
| Intelligent routing | Routing engine |
| Resilience | Retry, circuit breaker, fallback chain |
| Streaming | SSE controller |
| Caching and idempotency | Redis services |
| Retention | Retention writer and encryption service |
| Audit | Audit component and AuditLog collection |
| Billing | Billing worker and Billing collection |
| Anomaly alerts | Anomaly worker and Alert collection |
| Admin dashboard | Admin APIs and frontend pages |
| Observability | Pino, metrics, health endpoints |
| Deployment | Docker Compose and ECS/Fargate release proof |

## 24. Definition of System-Design Completion

The SDD is complete when:

- Every approved MVP capability maps to a component.
- The synchronous request order is unambiguous.
- Tenant ownership is enforced in every data-access path.
- PII and policy checks occur before provider routing.
- Masked text, not original text, is sent to providers.
- Blocked prompts have no provider-call path.
- Provider-specific SDK details remain inside adapters.
- Failure and fallback behaviour is defined.
- Redis responsibilities and failure modes are separated.
- Retention enforcement occurs before persistence construction.
- Audit data excludes raw sensitive content.
- Deployment units and limitations are documented.
- No roadmap feature is presented as part of the MVP.

## 25. SDD Self-Audit

### 25.1 Scope audit

**Result: PASS**

- No new user-facing product feature was introduced.
- Approval workflows, SSO, ML classifiers, Kafka, multi-region design, distributed circuit state, and seamless mid-stream fallback remain deferred.
- BYOK remains outside the beginner MVP.

### 25.2 Security-order audit

**Result: PASS**

The documented request order is:

```text
Authentication -> tenant context -> validation -> idempotency
-> PII -> policy -> cache -> routing -> provider -> streaming
-> retention -> asynchronous jobs
```

A blocked request cannot reach cache, routing, or provider code.

### 25.3 Tenant-isolation audit

**Result: PASS**

- Tenant ID comes from trusted authentication context.
- Tenant-owned repository methods require `orgId`.
- Dashboard, logs, audit, conversations, billing, and alerts are organisation scoped.
- Team-lead access adds a team filter.

### 25.4 Beginner-complexity audit

**Result: PASS WITH RECORDED LIMITATIONS**

Complexity was reduced by:

- Using a modular monolith
- Using BullMQ directly rather than adding Kafka or a separate event-stream platform
- Keeping one API and one worker service
- Using rule-based classifiers
- Keeping routing weights fixed
- Keeping circuit state local for the initial single-instance MVP
- Excluding decrypted admin content review

### 25.5 Reliability audit

**Result: PASS FOR MVP**

- Retry and circuit-breaker rules are defined.
- Fallback ordering is defined.
- Redis and MongoDB failure behaviour is documented.
- Mid-stream fallback limitation is explicit.
- Worker jobs are retryable and idempotent.

### 25.6 Data-protection audit

**Result: PASS**

- Metadata-only mode stores no prompt or response content.
- Encrypted mode uses authenticated encryption.
- Encryption failure never falls back to plaintext.
- PII values are excluded from logs and audit metadata.
- Cache is disabled for any detected PII.

### 25.7 Internal-consistency findings

1. The original architecture discussed Redis Pub/Sub plus BullMQ. This SDD simplifies the MVP to direct BullMQ job publication because a separate Pub/Sub layer would add complexity without changing beginner MVP behaviour.
2. The original architecture listed custom retention in MVP language in some places while also describing only metadata and encrypted modes as core. This SDD makes metadata-only and encrypted storage mandatory and treats custom TTL as optional after those work.
3. The original architecture includes BYOK in the production model. It is explicitly deferred here to honor the beginner solo-developer constraint.
4. The original architecture allows multiple horizontally scaled instances but also uses in-memory circuit state. This SDD recommends a single API instance for the first MVP and records shared state as a limitation.
5. The PRD includes a minimal super-administrator role. This SDD prevents that role from automatically reading organisation content.

### 25.8 Final assessment

**APPROVED AS THE SYSTEM-DESIGN BASELINE FOR A BEGINNER SOLO-DEVELOPER MVP.**

The design is sufficiently detailed to begin repository setup and the later Technical Design Document without adding product scope.

## 26. Zero-Cost Public Admin Demo Session

The zero-cost recruiter demo may expose a one-click public admin session only
when `PUBLIC_ADMIN_DEMO_ENABLED=true`. The API resolves the fixed trusted
`novastack` / `admin-demo@novastack.demo` identity from MongoDB and issues a
six-minute access token marked `PUBLIC_ADMIN_DEMO`. It accepts no tenant,
identity, role, permission, or password input and creates no refresh-token
record or persistent browser session.

The public demo uses the existing login rate-limit window and attempt count in
an isolated opaque per-IP Redis namespace. Current database user,
organisation, role, and permission state remain authoritative on every
request. Read-only admin pages and normal owner-scoped chat remain available,
but every privileged admin mutation and audit export is rejected by backend
authorization with `PUBLIC_DEMO_READ_ONLY`. Standard password-authenticated
`ORG_ADMIN` sessions are unchanged.

The frontend checks `/health/ready` before requesting the session, polls every
four seconds for at most two minutes, and starts its countdown only from the
backend-issued expiry after successful authentication. The countdown is UX;
JWT expiry is authoritative.
