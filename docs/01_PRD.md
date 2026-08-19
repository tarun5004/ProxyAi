# ProxiAI Product Requirements Document (PRD)

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | Product Requirements Document |
| Version | 1.0 |
| Status | MVP Baseline |
| Intended audience | Solo developer, reviewer, tester, interviewer |
| Primary source | ProxiAI Architecture Document v2.0 |
| Scope rule | Only features already present in the architecture source are included |
| Delivery approach | Five-week solo-developer MVP |

## 2. Executive Summary

ProxiAI is a multi-tenant AI gateway that sits between employees and external Large Language Model providers. Instead of employees directly sending prompts to different AI vendors, ProxiAI receives the prompt, checks it for sensitive information, applies organisation policy, selects an eligible provider, streams the response, and records usage and audit information.

The MVP is intentionally limited for a beginner solo developer. It focuses on a working end-to-end flow rather than full enterprise scale. The first version will include authentication, organisation isolation, chat, three provider adapters, basic PII detection, policy decisions, simple intelligent routing, circuit breaker and fallback, Server-Sent Events streaming, Redis-based idempotency, MongoDB persistence, basic audit logs, background jobs, a small admin dashboard, Docker-based local setup, and a simple Cloud Run deployment path. Secure prompt-cache and response-replay contracts are documented, but their implementation is deferred until Phase 9 provides approved encrypted payload or access-checked safe-reference storage.

The MVP will not include advanced machine-learning classification, Kafka, SAML/SSO, multi-region deployment, sophisticated approval workflows, distributed circuit-breaker state, or seamless mid-stream provider splicing.

## 3. Product Problem

### 3.1 Lack of AI usage visibility

Organisations cannot easily see which employees are using which AI providers, how many requests are being sent, how much token usage is being consumed, or what the approximate cost is.

### 3.2 Sensitive-data leakage risk

Employees may accidentally paste email addresses, phone numbers, credentials, API keys, government identifiers, or confidential business terms into an external AI service.

### 3.3 Provider dependency

If a selected provider becomes unavailable, slow, rate-limited, or blocked, employees may be unable to continue working.

### 3.4 No consistent policy enforcement

Without a gateway, each employee uses external AI tools independently. The organisation cannot consistently block risky prompts, mask sensitive values, or apply budget rules.

### 3.5 No audit trail

The organisation needs a record of important actions such as policy decisions, login events, configuration changes, and data exports.

### 3.6 Uncontrolled cost

AI requests can continue even when an organisation has reached its internal monthly token budget.

## 4. Product Vision

ProxiAI will provide one controlled and observable entry point for organisation AI usage.

### 4.1 Product principles

1. Security and policy checks happen before external provider calls.
2. Blocked content is never sent to an external provider.
3. Every organisation can access only its own data.
4. Provider-specific code is isolated behind adapters.
5. Failure of one provider should not break all user requests.
6. Important actions must be traceable through logs or audit records.
7. MVP features must be realistic for one beginner solo developer.
8. Complex production improvements are deferred until the MVP works.

## 5. MVP Goals

### 5.1 Business goals

- Give an organisation a single gateway for employee AI requests.
- Provide visibility into requests, providers, token usage, latency, and failures.
- Prevent clearly risky content from being sent externally.
- Reduce downtime through provider fallback.

### 5.2 User goals

- Employees can sign in and send prompts.
- Employees can receive streamed responses.
- Employees receive clear messages when a prompt is masked, blocked, retried, or failed.
- Admins can view organisation-level usage and alerts.

### 5.3 Technical goals

- Use a feature-based TypeScript project structure.
- Support three provider adapters through one shared interface.
- Use MongoDB for persistent data.
- Use Redis for idempotency, queue processing, and health state. Enable response-content caching only after the Phase 9 safe-storage prerequisites exist.
- Use BullMQ for asynchronous work.
- Run locally using Docker Compose.

### 5.4 MVP success criteria

| Metric | MVP target |
|---|---|
| Tenant isolation | No cross-organisation data access in tested API routes |
| Policy ordering | PII and policy checks complete before provider selection |
| Block enforcement | 100% of blocked test prompts prevented from reaching providers |
| Fallback | Requests move to the next healthy provider when the selected provider fails |
| Duplicate coordination | Atomic tenant/user-scoped reservations prevent concurrent duplicates while Redis state exists; post-provider crash/expiry risk is an accepted MVP limitation |
| Streaming | User sees response chunks before the complete response finishes |
| Audit coverage | All listed MVP audit actions create an audit record |
| Local setup | Backend, frontend, MongoDB, and Redis start through Docker Compose |

Performance targets beyond these are treated as implementation observations rather than strict guarantees during the beginner MVP.

## 6. Users and Roles

### 6.1 Employee

Can:

- Sign in and sign out.
- Create conversations.
- Send prompts.
- View their own conversations.
- Select an allowed provider when manual routing is enabled.

Cannot:

- View another employee's conversations.
- View organisation-wide billing or audit data.
- Change organisation policy.

### 6.2 Team Lead

Can:

- Use employee features.
- View request activity for users assigned to the same team.

The MVP team-lead view may be basic and limited to filtered request logs.

### 6.3 Organisation Administrator

Can:

- Manage users and roles.
- View organisation usage and request logs.
- View alerts.
- Configure budget, retention mode, and policy thresholds.
- Export organisation audit logs.

### 6.4 ProxiAI Super Administrator

Can:

- View platform-level health.
- Manage provider configuration.

The MVP should keep this role minimal and should not create a full platform-management console.

## 7. Core User Journeys

### 7.1 Normal prompt flow

1. Employee signs in.
2. Employee opens or creates a conversation.
3. Employee sends a prompt with a client-generated request ID.
4. Backend validates authentication and organisation context.
5. Redis checks the idempotency key.
6. PII detection scans the prompt.
7. Policy engine returns `ALLOW`.
8. Cache is checked when the prompt is eligible.
9. Routing engine selects a provider.
10. Provider is called through retry and circuit-breaker protection.
11. Response tokens are streamed through SSE.
12. Request-completed event is published.
13. Background workers update billing, analytics, anomaly, and audit data.

### 7.2 Masked prompt flow

1. PII is detected.
2. Risk score reaches the mask threshold but not the block threshold.
3. Policy returns `ALLOW_WITH_MASK`.
4. The masked prompt is sent to the provider.
5. The original sensitive values are not included in provider input, cache, normal logs, or audit metadata.
6. User receives a notice that sensitive content was masked.

### 7.3 Blocked prompt flow

1. PII or secret detection produces a high risk score.
2. Policy returns `BLOCK`.
3. No provider is selected or called.
4. User receives a safe explanation.
5. An audit record is created with category, score, rule, user, organisation, and timestamp, but not raw sensitive text.

### 7.4 Provider failure flow

1. Routing selects the best eligible provider.
2. Provider request fails with a retryable error.
3. Retry with backoff and jitter runs.
4. If retries fail, the circuit-breaker failure count is updated.
5. The next eligible provider is selected.
6. The request continues through the fallback chain.
7. If all providers fail before streaming begins, the user receives a provider-unavailable error.
8. If a provider fails during streaming, the current stream ends with a retry notice and the user can retry the request.

### 7.5 Budget exhaustion flow

1. Organisation usage reaches or exceeds the configured monthly token budget.
2. Policy returns `BLOCK` with reason `budget_exceeded`.
3. No provider is called.
4. Admin receives an alert.

## 8. MVP Scope

### 8.1 Included

| Area | MVP implementation |
|---|---|
| Authentication | Email/password login, JWT access token, refresh-token rotation, logout |
| Roles | Employee, team lead, organisation admin, super admin |
| Chat | Conversations, messages, SSE streaming |
| Providers | Three adapters using one shared provider interface |
| PII | Regex-based detection, static classification, weighted risk score |
| Policy | Allow, mask, block |
| Routing | Manual selection and simple intent/budget/latency/health score |
| Resilience | Retry, backoff, jitter, circuit breaker, fallback chain |
| Redis | Idempotency and provider health state; prompt-cache implementation deferred to Phase 9 prerequisites |
| Retention | Metadata Only and Encrypted Storage; custom TTL support if practical |
| Background jobs | Billing, analytics, anomaly, provider health, and failed-enqueue recovery; email delivery moves to Phase 8 pending provider approval |
| Audit | Append-only audit records for important actions |
| Dashboard | Basic KPIs, logs, filters, cursor pagination, alerts |
| Observability | Pino logs and core Prometheus metrics |
| Deployment | Docker Compose and manual Cloud Run deployment |

### 8.2 Not included in MVP

- Machine-learning intent classification.
- NER-based PII detection.
- SSO or SAML.
- Kafka.
- Multi-region deployment.
- Multi-node Redis locking.
- Shared circuit-breaker state across many API instances.
- Seamless provider switching in the middle of a streamed response.
- Full custom approval workflow.
- Full-text search inside encrypted prompt content.
- Advanced payment automation.
- Formal SOC 2 or ISO 27001 certification.

## 9. Functional Requirements

## 9.1 Authentication

### FR-AUTH-001 — Login

The system shall allow an active user to log in using valid credentials.

**Acceptance criteria**

- Given valid credentials, when the user logs in, then an access token and refresh token are issued.
- Given invalid credentials, when login is attempted, then access is denied without revealing whether the email exists.
- A login success or failure event is written to the audit log.

### FR-AUTH-002 — Access token

The system shall use a short-lived JWT access token for authenticated API requests.

### FR-AUTH-003 — Refresh-token rotation

A refresh token shall be one-time use.

**Acceptance criteria**

- When a valid refresh token is exchanged, it is marked used and replaced.
- When an already-used token is submitted again, the token family is revoked.

### FR-AUTH-004 — Logout

Logout shall revoke the active refresh session and clear the authentication cookie.

## 9.2 Organisation isolation

### FR-ORG-001 — Tenant-scoped access

Every protected database query shall include the authenticated organisation ID unless it is an explicitly authorised platform-level operation.

### FR-ORG-002 — Organisation settings

An organisation admin shall be able to configure:

- Monthly token budget.
- PII mask threshold.
- PII block threshold.
- Retention mode.
- Enabled features for the organisation plan.

## 9.3 User and role management

### FR-USER-001 — User creation

An organisation admin shall be able to create or invite users inside the same organisation.

### FR-USER-002 — Role assignment

An organisation admin shall be able to assign employee, team-lead, or organisation-admin roles.

### FR-USER-003 — Team assignment

A user may be assigned to a team so team leads can access team-scoped data.

## 9.4 Conversations and chat

### FR-CHAT-001 — Create conversation

An employee shall be able to create a new conversation.

### FR-CHAT-002 — Send prompt

An authenticated employee shall be able to send a prompt inside a conversation.

Required input:

- Conversation ID.
- Prompt text.
- Client-generated request ID.
- Optional manual provider choice.

### FR-CHAT-003 — Stream response

The backend shall stream provider response chunks to the client using SSE.

### FR-CHAT-004 — Conversation history

A user shall be able to view their own conversation list and messages according to the organisation retention mode.

### FR-CHAT-005 — Client disconnect

If the client disconnects, the server shall stop writing to the response stream and safely end request processing where possible.

## 9.5 PII and sensitive-data detection

### FR-PII-001 — Detect sensitive patterns

The MVP detector shall identify configured patterns for:

- Email addresses.
- Phone numbers.
- Payment-card-like numbers.
- Government-ID-like numbers.
- IP addresses.
- API keys and common credential formats.
- Connection-string-like values.
- Organisation-configured confidential keywords.

### FR-PII-002 — Classify detected spans

Each detected span shall be assigned one category:

- `CONTACT_INFO`
- `FINANCIAL`
- `GOVERNMENT_ID`
- `CREDENTIAL`
- `INTERNAL_SECRET`
- `BUSINESS_CONFIDENTIAL`

### FR-PII-003 — Calculate risk score

The system shall calculate a simple weighted risk score between 0 and 100.

### FR-PII-004 — Mask sensitive text

When masking is required, detected spans shall be replaced with category placeholders before the provider call.

### FR-PII-005 — Protect raw values

Raw detected sensitive values shall not be stored in audit metadata or application logs.

## 9.6 Policy engine

### FR-POLICY-001 — Evaluate before routing

The policy engine shall complete before provider selection.

### FR-POLICY-002 — Allow

The policy engine shall return `ALLOW` when risk and budget rules permit the request.

### FR-POLICY-003 — Allow with mask

The policy engine shall return `ALLOW_WITH_MASK` when the mask threshold is reached but the block threshold is not reached.

### FR-POLICY-004 — Block

The policy engine shall return `BLOCK` when the block threshold is reached or the budget is exhausted.

### FR-POLICY-005 — Explain decision

Each policy decision shall include a machine-readable reason code.

The MVP does not implement `REQUIRE_APPROVAL` because it would require an additional approval workflow that is not realistic for the first solo-developer release.

## 9.7 Provider abstraction

### FR-PROVIDER-001 — Shared adapter contract

Each provider shall implement:

- Provider ID.
- Capability declaration.
- Non-streaming completion.
- Streaming completion.
- Health check.
- Cost estimation.

### FR-PROVIDER-002 — Error normalization

Provider-specific errors shall be converted into common categories such as:

- Timeout.
- Rate limit.
- Authentication failure.
- Validation failure.
- Provider server error.

### FR-PROVIDER-003 — Three providers

The MVP shall support three configured provider adapters.

## 9.8 Routing

### FR-ROUTING-001 — Manual routing

When manual routing is allowed, the selected provider shall be used if it passes policy, capability, and health checks.

### FR-ROUTING-002 — Intent classification

The MVP shall use rules and keywords to classify prompts into:

- Simple question.
- Summarisation.
- Code generation.
- Code debugging.
- Data analysis.
- Creative writing.
- Unknown.

### FR-ROUTING-003 — Candidate filtering

Providers shall be excluded when they do not support the required context size, streaming requirement, plan, or current health state.

### FR-ROUTING-004 — Weighted selection

Eligible providers shall be scored using:

- Intent or capability match.
- Relative latency.
- Relative cost.
- Health score.

### FR-ROUTING-005 — Budget-aware routing

When the remaining budget is low, high-cost providers may be excluded. When the budget is exhausted, the request shall be blocked.

### FR-ROUTING-006 — Routing explanation

The selected provider and routing reason shall be written to the request log.

## 9.9 Retry, circuit breaker, and fallback

### FR-RES-001 — Retry retryable failures

Timeouts, rate limits, and provider 5xx errors may be retried up to the configured maximum.

### FR-RES-002 — Do not retry invalid requests

Authentication, authorisation, and validation failures shall not be retried.

### FR-RES-003 — Exponential backoff and jitter

Retry delay shall increase between attempts and include random jitter.

### FR-RES-004 — Circuit-breaker states

Each provider shall have `CLOSED`, `OPEN`, and `HALF_OPEN` states.

### FR-RES-005 — Fallback chain

After retries are exhausted or a circuit is open, the routing engine shall try the next eligible provider.

### FR-RES-006 — Mid-stream failure

If a provider fails after streaming starts, the stream shall emit a clear error or retry event and then end. Automatic seamless splicing is outside MVP scope.

## 9.10 Deferred cache and implemented idempotency

### FR-CACHE-001 — Prompt cache contract (implementation deferred)

Eligible prompts may be cached only after Phase 9 provides approved encrypted payload or access-checked safe-reference storage, policy/config fingerprinting, and cache-hit accounting semantics. P6 defines the contract but does not implement cache reads, writes, or response storage.

A prompt shall not be cached when:

- PII risk score is greater than zero.
- Retention mode does not permit content storage.

### FR-CACHE-002 — Future cache hit

When the deferred cache is safely implemented, a valid cache hit shall skip provider-adapter execution and use the approved existing SSE event catalog.

### FR-IDEMP-001 — Idempotency key

The API shall use a client-generated request ID scoped by trusted organisation and user identity through an opaque HMAC Redis key.

### FR-IDEMP-002 — Duplicate request

A matching in-progress duplicate returns `409 REQUEST_IN_PROGRESS`. A completed duplicate or fingerprint mismatch returns `409 DUPLICATE_REQUEST`; completed requests are non-replayable tombstones and no response body is stored in P6.

### FR-IDEMP-003 — Accepted crash limitation

Atomic reservation, tenant isolation, fingerprint protection, fail-closed Redis behavior, and the 300/3600-second TTL contract are proven. If a process crashes after provider execution may have started, the `PROCESSING` record can expire and permit a later retry. The MVP accepts this limitation and does not claim zero duplicate paid calls under that failure mode.

## 9.11 Retention

### FR-RET-001 — Metadata Only

The system shall store provider, model, token usage, cost, latency, PII score, routing reason, and timestamps without prompt or response text.

### FR-RET-002 — Encrypted Storage

The system shall store prompt and response content only in encrypted form.

### FR-RET-003 — Custom retention

When custom retention is enabled, the stored record shall include an expiry date suitable for a MongoDB TTL index.

### FR-RET-004 — Enforce before write

Retention mode shall determine the persistence payload before the database write is constructed.

`NO_STORAGE` is documented as a future production mode and is not required for the first beginner MVP.

## 9.12 Billing and budget

### FR-BILL-001 — Usage event

Every completed non-cached provider request shall produce a safe usage event. Token usage is included only when the provider returns a complete actual usage set. Estimated cost is included only when an approved pricing configuration exists. Unknown usage or cost remains unknown and must never be synthesized or written as zero.

### FR-BILL-002 — Monthly rollup

A background worker shall update monthly organisation and user totals.

### FR-BILL-003 — Budget warning

An alert shall be created when usage reaches the configured warning threshold.

### FR-BILL-004 — Budget block

New billable requests shall be blocked after budget exhaustion.

The MVP may use estimated provider cost rather than invoice-grade billing accuracy.

## 9.13 Anomaly alerts

### FR-ALERT-001 — Simple anomaly detection

When `Organisation.featureFlags.anomalyDetection` is enabled, a background
worker shall compare the user's current UTC-day known token total with the
average from prior active days in the previous seven UTC days. An active
baseline day is a day whose token usage is fully known. Unknown-usage days are
excluded and are never treated as zero. At least three prior active days are
required; otherwise no anomaly decision is made.

Request-level, request-volume, blocked-request-rate, and provider-error anomaly
detection are outside the MVP contract.

### FR-ALERT-002 — Create alert

When current daily known tokens are greater than two times the approved
seven-day active-day average, one tenant-scoped `HIGH`, `OPEN` anomaly alert
shall be created for that organisation, user, and observed UTC day.

Only one unresolved `{ orgId, userId, observedDay, ANOMALY }` alert may exist.
Re-evaluation updates or resolves that same alert and must not create a
duplicate. P7-07 does not enqueue email or notification work.

### FR-ALERT-003 — Resolve alert

An organisation admin shall be able to mark an alert as resolved.

Alert listing, resolution, and reopening are Phase 8 administration work. They
are not part of the Phase 7 anomaly worker.

## 9.14 Audit logging

### FR-AUDIT-001 — Append-only audit record

The application shall not expose update or delete operations for audit records.

### FR-AUDIT-002 — Audited actions

The MVP shall audit:

- Login success and failure.
- Logout.
- Refresh-token reuse detection.
- Policy allow, mask, and block decisions.
- User and role changes.
- Budget changes.
- Retention changes.
- Policy-threshold changes.
- Audit export.

### FR-AUDIT-003 — Audit metadata

An audit record shall include organisation, actor, action, resource, timestamp, IP address, user agent, and safe metadata.

## 9.15 Admin dashboard

### FR-ADMIN-001 — KPI summary

The dashboard shall display:

- Requests today.
- Requests this month.
- Token usage.
- Estimated cost.
- Provider health.
- Error rate.
- Average latency.
- Cache hit ratio.
- Fallback count or rate.
- Active alerts.
- Budget remaining.

### FR-ADMIN-002 — Request-log list

The admin shall be able to view organisation request logs using cursor-based pagination.

### FR-ADMIN-003 — Filters

The MVP shall support filters for:

- User.
- Provider.
- Date range.
- PII-only requests.
- Routing reason.

### FR-ADMIN-004 — Audit export

An organisation admin shall be able to export organisation audit records as CSV.

## 9.16 Background jobs

### FR-JOB-001 — BullMQ queues

The MVP shall include queues for:

- Billing.
- Analytics.
- Anomaly detection.
- Provider health checks.
- Failed-enqueue recovery.

Phase 7 has an explicit waiver for email delivery. The safe `alert.created`
contract remains approved, but provider/configuration/template implementation
moves to Phase 8 after those decisions are approved.

### FR-JOB-002 — Retry failed jobs

Jobs shall use a limited retry count with exponential backoff.

### FR-JOB-003 — Failed-job visibility

Failed jobs shall remain in BullMQ's failed set and emit safe structured logs.
Local inspection may use BullMQ APIs or CLI tooling in a controlled developer
environment. Bull Board is optional Phase 10 observability tooling and must
never be public.

## 9.17 Health endpoints

### FR-HEALTH-001 — Liveness

`/health/live` shall confirm that the application process is running.

### FR-HEALTH-002 — Readiness

`/health/ready` shall check MongoDB, Redis, and at least one healthy provider.

### FR-HEALTH-003 — Detailed health

A protected detailed endpoint may show dependency-level state for administrators.

## 10. Business Rules

| ID | Rule |
|---|---|
| BR-001 | Every normal user request is restricted to the authenticated organisation. |
| BR-002 | Policy evaluation happens before provider selection. |
| BR-003 | A blocked prompt is never sent to any provider. |
| BR-004 | A masked request sends only masked text to the provider. |
| BR-005 | Raw credentials and sensitive values are never written to normal logs or audit metadata. |
| BR-006 | Manual provider choice cannot bypass policy, plan, capability, or health checks. |
| BR-007 | An exhausted budget prevents new billable provider calls. |
| BR-008 | While a valid `PROCESSING` or `COMPLETED` record exists, a repeated matching idempotency key must not produce another provider call; post-provider crash/expiry risk is explicitly accepted. |
| BR-009 | Future prompt-cache keys must be opaque and trusted-organisation scoped; cache implementation is deferred to Phase 9 prerequisites. |
| BR-010 | Future prompt caching is restricted to `ALLOW`, risk score `0`, and zero detected spans; masked and metadata-only content caching are prohibited. |
| BR-011 | Refresh tokens are one-time use. |
| BR-012 | Refresh-token reuse revokes the token family. |
| BR-013 | Audit records are append-only at application level. |
| BR-014 | Unknown server errors return a generic client message. |
| BR-015 | Backend permission checks are mandatory even when frontend controls are hidden. |

## 11. Non-Functional Requirements

### NFR-SEC-001 — Transport security

Production traffic shall use HTTPS.

### NFR-SEC-002 — Secret handling

API keys, JWT secrets, and encryption keys shall not be committed to source control.

### NFR-SEC-003 — Input validation

All external API inputs shall be validated using a shared schema-validation approach.

### NFR-SEC-004 — Secure cookies

Refresh-token cookies shall use `httpOnly`, `Secure` in production, and an appropriate `SameSite` policy.

### NFR-SEC-005 — Log redaction

The logger shall redact authorisation headers, API keys, encrypted content fields, and other configured secret fields.

### NFR-REL-001 — Provider isolation

Failure of one provider adapter shall not crash the process or prevent fallback to another provider.

### NFR-REL-002 — Async isolation

Failure of billing, analytics, anomaly, or email processing shall not fail an already completed user response.

### NFR-PERF-001 — Fast synchronous checks

PII detection and policy evaluation should remain lightweight and should not call an external model in the MVP.

### NFR-SCALE-001 — Stateless API preference

The API shall avoid storing user session state in process memory except temporary circuit-breaker state in the MVP.

### NFR-OBS-001 — Request correlation

Every API response and structured log entry shall include a request ID.

### NFR-OBS-002 — Core metrics

The MVP shall expose request duration, provider latency, provider errors, circuit state, cache hits, and queue depth metrics.

### NFR-MAINT-001 — Feature-based structure

Related routes, services, schemas, and types shall be grouped by feature.

### NFR-DEPLOY-001 — Container execution

The production container shall run as a non-root user and include only production dependencies and compiled output.

### NFR-PRIV-001 — Retention-aware storage

Prompt and response content shall only be persisted when the configured retention mode allows it.

## 12. Data Requirements

| Entity | Purpose | Important MVP fields |
|---|---|---|
| Organisation | Tenant configuration | orgId, name, plan, retentionMode, budget, thresholds, featureFlags |
| User | Identity and permissions | orgId, email, passwordHash, role, permissions, teamId, active |
| RefreshToken | Session rotation | userId, familyId, tokenHash, usedAt, revoked, expiresAt |
| Conversation | Chat thread | orgId, userId, title, lastMessageAt, messageCount |
| Message | User and assistant messages | conversationId, orgId, role, contentEnc, tokenCount, createdAt |
| RequestLog | Technical and usage record | orgId, userId, provider, model, tokens, cost, latency, PII score, routing reason, cacheHit, createdAt |
| AuditLog | Security and administrative history | orgId, actorId, action, resource, metadata, IP, userAgent, occurredAt |
| Billing | Monthly rollups | orgId, period, userId, tokens, estimated cost, request count, byProvider |
| Alert | Budget, PII, or anomaly alert | orgId, userId, type, message, resolved, createdAt |
| ProviderHealth | Provider availability | provider, state, failureCount, average latency, lastCheckedAt |

## 13. API Requirements

The API shall use `/api/v1` URL versioning.

All normal JSON responses shall follow one of these shapes:

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    nextCursor?: string;
    requestId: string;
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

Minimum API groups:

- `/api/v1/auth`
- `/api/v1/conversations`
- `/api/v1/chat`
- `/api/v1/admin/users`
- `/api/v1/admin/logs`
- `/api/v1/admin/audit`
- `/api/v1/admin/alerts`
- `/api/v1/admin/settings`
- `/health`
- `/metrics`

## 14. Error Handling

| Scenario | Expected response |
|---|---|
| Invalid input | `400 VALIDATION_ERROR` |
| Invalid or expired access token | `401 UNAUTHENTICATED` |
| Missing permission | `403 FORBIDDEN` |
| Feature unavailable for plan | `403 FEATURE_DISABLED` |
| Conversation not found in same organisation | `404 NOT_FOUND` |
| Duplicate processing request | Existing processing status or result |
| Budget exhausted | `402 BUDGET_EXCEEDED` or documented equivalent |
| PII blocked | `403 POLICY_BLOCKED` |
| Provider unavailable | `503 PROVIDER_UNAVAILABLE` |
| All providers unavailable | `503 ALL_PROVIDERS_UNAVAILABLE` |
| Unexpected server error | `500 INTERNAL_ERROR` without stack trace |
| SSE stream interruption | SSE `error` event followed by stream close |

## 15. Security Requirements

1. Passwords shall be stored only as strong password hashes.
2. Access tokens shall have a short expiration.
3. Refresh tokens shall be stored as hashes.
4. Organisation ID shall be taken from authenticated context, not trusted from client input.
5. All admin endpoints shall use permission middleware.
6. Provider API keys shall be stored outside source control.
7. BYOK is not required for the first MVP implementation.
8. Prompt and response content shall not appear in ordinary logs.
9. Audit exports shall require organisation-admin permission.
10. MongoDB queries shall use validated values and Mongoose query objects rather than dynamic operators from client input.
11. Rate limiting shall be applied to authentication and chat routes.
12. Production containers shall not run as root.
13. The project shall not claim compliance certification.

## 16. Dashboard Requirements

### 16.1 Employee view

- Conversation list.
- Chat screen.
- Streamed assistant response.
- Clear status for masked, blocked, retrying, or failed requests.

### 16.2 Admin view

- KPI cards.
- Provider-health summary.
- Recent request logs.
- Filters and cursor pagination.
- Active alerts.
- Organisation settings for budget, retention, and PII thresholds.
- Basic user and role management.

The MVP dashboard should prioritise functionality over advanced visual design.

## 17. Five-Week Delivery Plan

### Week 1 — Core foundation

Deliverables:

- Backend and frontend project setup.
- MongoDB and Redis connections.
- Feature-based folder structure.
- Organisation and user models.
- Login, refresh rotation, and logout.
- Standard response envelope and error middleware.
- One provider adapter.
- Basic conversation and request logging.

Exit criteria:

- User can log in and make one non-streaming provider request.
- Organisation data is isolated in tested routes.

### Week 2 — Providers and resilience

Deliverables:

- Three provider adapters.
- Capability registry.
- Rule-based intent classifier.
- Basic routing score.
- Retry with backoff and jitter.
- Circuit breaker.
- Fallback chain.
- Provider-health cache.

Exit criteria:

- A simulated primary-provider failure falls back to another provider.

### Week 3 — PII, policy, Redis, and jobs

Deliverables:

- Regex-based PII detector.
- Classification and risk score.
- Allow, mask, and block decisions.
- Idempotency.
- Prompt cache.
- Request-completed event.
- BullMQ workers for billing, analytics, anomaly, email, and health checks.
- Append-only audit log.

Exit criteria:

- High-risk test content is blocked.
- Medium-risk content is masked.
- Duplicate request IDs do not create duplicate provider calls.

### Week 4 — Streaming and dashboard

Deliverables:

- SSE streaming.
- Conversation history.
- Admin KPIs.
- Request-log filters.
- Cursor pagination.
- Alert list and resolution.
- Basic user and role management.

Exit criteria:

- Employee receives streamed tokens.
- Admin can review organisation usage and alerts.

### Week 5 — observability and deployment

Deliverables:

- Pino logging and redaction.
- Core Prometheus metrics.
- Basic Grafana dashboard.
- Liveness and readiness endpoints.
- Multi-stage Dockerfile.
- Docker Compose local environment.
- Manual GCP Cloud Run deployment instructions.
- Final testing and README.

Exit criteria:

- Project starts from documented steps.
- Main MVP journeys pass manual and automated tests.

## 18. Risks and Mitigations

| Risk | Impact | MVP mitigation |
|---|---|---|
| Too many features for one developer | High | Follow the five-week order and do not start roadmap work |
| Provider APIs differ | High | Keep each provider behind one adapter interface |
| Free-tier API limits | Medium | Use fallback and clear configuration errors |
| False-positive PII detection | Medium | Use visible mask/block reason and simple configurable thresholds |
| False-negative PII detection | High | Document regex limitations and avoid claiming complete protection |
| Redis unavailable | Medium | Skip cache, show safe duplicate-handling behaviour, and log worker failures |
| MongoDB unavailable | High | Readiness fails and new requests return a controlled error |
| Mid-stream provider failure | Medium | End stream with clear retry message; do not attempt complex splicing |
| Cost estimates are inaccurate | Medium | Label cost as estimated and keep pricing config centralised |
| Secret leakage | High | Redaction, environment configuration, and no secrets in repository |
| Cross-tenant bug | Critical | Central organisation middleware and tenant-isolation tests |
| Cloud Run cold start | Low for MVP | Accept scale-to-zero for demo deployment |

## 19. Assumptions

1. One developer will build the MVP in approximately five weeks.
2. The developer has basic knowledge of Node.js, Express, React, TypeScript, MongoDB, and Redis.
3. Provider accounts and API keys are available for development.
4. Three providers can be configured, but their exact names may depend on available free or trial access.
5. Cost values are estimates based on configured provider pricing.
6. The first deployment is a demo or portfolio deployment, not a regulated production environment.
7. One Cloud Run region is sufficient for the MVP.
8. Team-lead functionality is basic and can use request-log filtering rather than a separate complex module.

## 20. Open Questions

1. Which exact three providers will be used in the MVP?
2. Which provider will act as the lowest-cost fallback?
3. What default monthly token budget should a new organisation receive?
4. What default PII mask and block thresholds should be used?
5. Which encryption library and key format will be used for stored message content?
6. Will the first frontend use EventSource directly or `fetch` with a readable stream for authenticated SSE?
7. Which email provider, sender, timeout, error mapping, and template content
   will be approved before the deferred Phase 8 email implementation?
8. Is Razorpay required in the first working MVP, or can subscription plans be assigned manually for the demo?

## 21. MVP Acceptance Checklist

### Authentication

- [ ] Active user can log in.
- [ ] Invalid login is rejected safely.
- [ ] Refresh token rotates after use.
- [ ] Reused refresh token revokes its family.
- [ ] Logout revokes the session.

### Tenant isolation

- [ ] User cannot access another organisation's conversation.
- [ ] Admin cannot access another organisation's logs.
- [ ] Organisation ID from request body cannot override authenticated organisation.

### PII and policy

- [ ] Normal prompt is allowed.
- [ ] Medium-risk prompt is masked.
- [ ] High-risk prompt is blocked.
- [ ] Blocked prompt does not call any provider.
- [ ] Raw detected value is absent from logs and audit metadata.

### Routing and resilience

- [ ] Manual provider selection works when eligible.
- [ ] Automatic routing returns a routing reason.
- [ ] Retryable failure is retried.
- [ ] Invalid request is not retried.
- [ ] Circuit opens after configured failures.
- [ ] Fallback provider is used after primary failure.

### Redis

- [x] Atomic tenant/user-scoped reservation admits one concurrent winner while Redis state exists.
- [x] Fingerprint mismatch, Redis failure, TTLs, and non-replayable completed tombstones follow the approved contract.
- [ ] **DEFERRED —** Eligible prompt-cache hit skips provider execution after Phase 9 safe-storage/accounting prerequisites exist.
- [ ] **DEFERRED —** Prompt-cache implementation proves no sensitive or masked content is cached.
- **Accepted limitation:** a post-provider process crash followed by `PROCESSING` expiry may permit a later duplicate paid call.

### Chat

- [ ] Conversation can be created.
- [ ] Response is streamed through SSE.
- [ ] Stream completion event is sent.
- [ ] Mid-stream failure returns a clear SSE error event.

### Data and audit

- [ ] Metadata-only mode stores no prompt or response content.
- [ ] Encrypted-storage mode stores encrypted content.
- [ ] Policy decisions are audited.
- [ ] Admin changes are audited.
- [ ] Audit export is restricted to organisation admin.

### Background jobs

- [ ] Billing rollup job runs.
- [ ] Health-check job updates provider state.
- [ ] Anomaly job can create an alert.
- [ ] Failed jobs are visible in development.

### Dashboard and deployment

- [ ] Admin dashboard shows core KPIs.
- [ ] Request logs support cursor pagination.
- [ ] Filters work for user, provider, date, and PII.
- [ ] Docker Compose starts required services.
- [ ] Liveness and readiness endpoints return correct status.

## 22. Definition of Done

The ProxiAI MVP is complete when:

1. All required MVP acceptance checklist items pass.
2. No known critical cross-tenant access defect remains.
3. Blocked prompts are confirmed not to reach providers.
4. Secrets are absent from source control and logs.
5. The main request path works from login to streamed response.
6. Provider fallback is demonstrated using a simulated failure.
7. Admin can view usage, logs, provider health, budget, and alerts.
8. The project starts locally using documented Docker Compose steps.
9. Core automated tests pass.
10. README and environment-variable documentation are complete.

## 23. Glossary

| Term | Meaning |
|---|---|
| LLM | Large Language Model |
| Provider | External AI service used to generate responses |
| Adapter | Provider-specific implementation of the common provider interface |
| PII | Personally Identifiable Information |
| Policy engine | Component that allows, masks, or blocks a request |
| Circuit breaker | Resilience pattern that temporarily stops calls to a failing provider |
| Fallback | Trying another eligible provider after a failure |
| SSE | Server-Sent Events, used to stream response chunks to the browser |
| Idempotency | Preventing the same client request from being processed twice |
| Tenant | One organisation using the platform |
| Audit log | Append-only record of security-sensitive or administrative actions |

## 24. PRD Self-Audit

This PRD was checked against the following rules:

- No new major product feature was added beyond the supplied architecture.
- Enterprise-only complexity was removed or moved outside MVP.
- `REQUIRE_APPROVAL` was excluded from MVP because no approval workflow exists in the beginner scope.
- `NO_STORAGE` was excluded from the first MVP because it requires a carefully separated pass-through path.
- BYOK was not made an MVP requirement.
- Advanced ML, Kafka, SSO, multi-region, distributed locking, and seamless mid-stream fallback were excluded.
- Every included feature supports the main ProxiAI request flow.
- Security ordering is explicit: authentication, idempotency, PII, policy, cache, routing, provider call, streaming, then asynchronous side effects.
- Retention is enforced before persistence.
- Raw sensitive values are prohibited from logs and audit metadata.
- All organisation data is tenant-scoped.
- The five-week plan is ordered by technical dependency.

### Final audit result

**Status: Approved as a beginner solo-developer MVP baseline.**

The main remaining risk is scope size. During implementation, the developer should complete each week's exit criteria before starting the next week's optional work.
