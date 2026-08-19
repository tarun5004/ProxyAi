# ProxiAI Security Design and Threat Model

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | Security Design and Threat Model |
| Version | 1.0 |
| Status | MVP Security Baseline |
| Intended audience | Solo developer, reviewer, tester, security reviewer, interviewer |
| Primary inputs | `01_PRD.md`, `02_SDD.md`, `03_TDD.md`, `04_DATABASE_DESIGN.md`, `05_OPENAPI_SPEC.md`, and ProxiAI Architecture Document v2.0 |
| Scope | Beginner-friendly five-week MVP |
| Scope rule | No new product feature is introduced by this document |
| Review frequency | Before each production deployment and after any major authentication, storage, provider, or tenant-isolation change |

## 2. Purpose

This document defines the security architecture, trust boundaries, assets, attacker-controlled inputs, abuse cases, security invariants, and mitigations for the ProxiAI MVP.

ProxiAI sits between employees and external LLM providers. It therefore handles data that may be confidential, personally identifiable, commercially sensitive, or credential-like. The most important security responsibility is not merely protecting the application itself; it is preventing unauthorised prompt data from crossing organisation and provider boundaries.

This document is intentionally scoped for a solo beginner developer. It prioritises controls that are practical to implement and verify in the MVP:

- Strong tenant isolation
- Authentication and refresh-token rotation
- Permission-based route authorization
- PII and secret detection before provider routing
- Policy enforcement before external transmission
- Safe encryption of stored content
- Redaction of logs and metrics
- Append-only audit records
- Provider credential protection
- Secure API, cookie, CORS, and rate-limit configuration
- Dependency, container, and deployment hygiene

It does not claim that ProxiAI is SOC 2, ISO 27001, PCI DSS, HIPAA, or any other certified system. The design supports evidence collection and safer engineering practices, but certification requires organisational controls, operating procedures, and independent assessment.

## 3. Security Scope Guardrails

### 3.1 Included in MVP security scope

- React frontend
- Express and TypeScript backend
- MongoDB
- Redis
- BullMQ workers
- Supported LLM provider adapters
- JWT access tokens
- Rotating refresh tokens
- Employee, team lead, organisation-admin, and super-admin authorization
- PII detection, classification, scoring, masking, and blocking
- Prompt and response encryption for encrypted-retention mode
- Prompt cache and idempotency keys
- Request logs and append-only audit logs
- Admin dashboard and CSV audit export
- Docker and GCP Cloud Run deployment
- Pino logging and Prometheus metrics
- Resend notifications and Razorpay integration only where already approved by the MVP documents

### 3.2 Explicitly deferred

The following are not added to the MVP:

- SSO or SAML
- Customer-managed encryption keys
- Hardware security modules
- Full GCP Secret Manager integration if local encrypted storage is used for the first demo
- BYOK management UI or production BYOK workflow
- Custom policy language
- Approval workflow
- ML-based data-loss prevention
- Multi-region active-active deployment
- Web application firewall management
- Tamper-evident object-lock audit storage
- Dedicated SIEM integration
- Continuous penetration-testing platform
- Formal compliance certification
- Seamless mid-stream provider switching
- Distributed circuit-breaker state

## 4. System Security Context

### 4.1 Primary runtime components

1. **Browser frontend** — accepts user credentials and prompts, displays streamed responses, and calls the backend.
2. **ProxiAI API** — authenticates users, validates requests, enforces permissions, scans prompts, applies policy, routes requests, streams responses, and writes security-relevant events.
3. **BullMQ workers** — process billing, analytics, anomaly, email, and health-check jobs asynchronously.
4. **MongoDB** — stores organisation configuration, users, sessions, conversation metadata, encrypted messages, request logs, audit records, billing rollups, alerts, and provider health history.
5. **Redis** — stores prompt-cache entries, idempotency state, rate-limit counters, provider-health state, and BullMQ data.
6. **External LLM providers** — receive only prompts allowed by policy and return model output.
7. **Email and payment providers** — receive only the minimum information required for approved workflows.
8. **Cloud Run and container runtime** — host the API and worker processes.
9. **Operator/admin environment** — deploys the service and manages runtime secrets and configuration.

### 4.2 Security-sensitive request flow

The required order is:

1. Receive HTTPS request.
2. Assign request and trace identifiers.
3. Validate origin, content type, size, and schema.
4. Authenticate the user.
5. Resolve the organisation from the authenticated identity.
6. Confirm user and organisation are active.
7. Enforce permission and feature-flag requirements.
8. Check rate limit and idempotency.
9. Run PII and secret detection on the original prompt.
10. Classify detected spans and calculate the risk score.
11. Apply policy: `ALLOW`, `ALLOW_WITH_MASK`, or `BLOCK`.
12. For `BLOCK`, stop processing before routing or provider invocation.
13. For `ALLOW_WITH_MASK`, discard the original prompt from the provider-call context and use only masked text.
14. Check cache eligibility and routing inputs.
15. Select an eligible provider.
16. Invoke the provider through timeout, retry, and circuit-breaker controls.
17. Stream only safe response data to the authenticated user.
18. Apply retention policy before constructing persistence data.
19. Publish asynchronous jobs containing only the minimum required fields.
20. Write redacted operational logs and append-only audit events.

Any implementation that changes this order requires security review.

## 5. Security Objectives

| ID | Objective |
|---|---|
| SO-001 | Prevent one organisation from reading, changing, exporting, or influencing another organisation's data. |
| SO-002 | Prevent blocked or unmasked sensitive prompt content from being sent to an external provider. |
| SO-003 | Protect account sessions against token theft, replay, and refresh-token reuse. |
| SO-004 | Prevent unauthorised administrative actions through server-side permission enforcement. |
| SO-005 | Prevent raw prompts, responses, credentials, and tokens from appearing in application logs, metrics, errors, or audit metadata. |
| SO-006 | Protect stored prompt and response content using authenticated encryption. |
| SO-007 | Ensure audit records identify security-relevant actions without storing prohibited content. |
| SO-008 | Limit abuse, duplicate paid requests, denial-of-service impact, and uncontrolled external-provider cost. |
| SO-009 | Fail safely when MongoDB, Redis, workers, encryption, or providers are unavailable. |
| SO-010 | Keep the production container, dependencies, environment, and secrets reasonably hardened for an MVP. |

## 6. Assets to Protect

### 6.1 Critical assets

| Asset | Why it matters | Required protection |
|---|---|---|
| User credentials | Account takeover enables data and admin access | One-way password hashing, TLS, no logging |
| Access and refresh tokens | Token theft enables session impersonation | Short TTL, secure cookies, hashing, rotation, revocation |
| Organisation identity | Incorrect resolution causes cross-tenant access | Derived from trusted auth context only |
| Prompts and responses | May contain confidential or personal data | Policy checks, encryption, retention enforcement, redaction |
| Provider API credentials | Exposure permits unauthorised usage and cost | Secret abstraction, encryption, no client exposure, no logs |
| Encryption master key | Loss exposes stored content; deletion makes content unrecoverable | Runtime secret, restricted access, backup/rotation procedure |
| Policy thresholds | Tampering can allow sensitive data exfiltration | Admin-only changes, validation, audit logging |
| Retention settings | Tampering can retain prohibited data or delete evidence | Admin-only changes, validation, audit logging |
| Audit logs | Required to investigate security events | Append-only application design, restricted read/export |
| Billing and budget state | Tampering can cause cost abuse or service denial | Worker idempotency, authorised changes, reconciliation |
| Redis idempotency state | Prevents duplicate provider calls | Tenant-scoped keys, strict TTL, fail-safe behaviour |
| Source code and CI configuration | May contain vulnerabilities or deployment secrets | Repository controls, secret scanning, review |

### 6.2 Supporting assets

- Provider health data
- Conversation metadata
- User role and permission assignments
- Team assignments
- Alert records
- Queue jobs and retry state
- Container images
- Deployment service account
- Domain and TLS configuration
- Operational dashboards

## 7. Actors and Threat Agents

| Actor | Expected capability | Security concern |
|---|---|---|
| Employee | Send prompts and view own conversations | Attempts to access other users or bypass policy |
| Team lead | View approved team-level data | Scope expansion beyond assigned team |
| Organisation admin | Configure org settings and view authorised admin data | Account compromise has high tenant impact |
| Super admin | Platform-level operations | Highest privilege; cross-tenant misuse risk |
| External unauthenticated attacker | Reach public endpoints | Credential attacks, injection, DoS, endpoint discovery |
| Malicious tenant user | Valid account inside one organisation | Cross-tenant access, prompt exfiltration, cost abuse |
| Compromised browser/session | Acts as authenticated user | Token replay, prompt theft, unwanted actions |
| Malicious prompt author | Controls prompt text | DLP evasion, injection strings, oversized payloads |
| Compromised provider | Receives allowed prompt and returns untrusted text | Malicious output, tracking, availability failures |
| Dependency or supply-chain attacker | Influences packages or build artifacts | Code execution or secret theft |
| Cloud/operator mistake | Misconfigures environment or access | Public database, leaked secrets, broad service-account rights |
| Worker replay or duplicate delivery | Reprocesses the same event | Double billing, duplicate alerts, inconsistent aggregates |

## 8. Trust Boundaries

### TB-01: Browser to ProxiAI API

The browser and every value it sends are untrusted. This includes headers, cookies, access tokens, prompt text, conversation identifiers, cursors, filter values, and client-generated request IDs.

Required controls:

- HTTPS only in production
- Strict schema validation
- Request-size limits
- Authentication and authorization
- CORS allowlist
- Secure cookie settings
- Rate limiting
- No trust in client-supplied `orgId`, role, permissions, price, provider cost, or user ID

### TB-02: ProxiAI API to MongoDB

The API may write security-sensitive state. Database queries must always include tenant scope where applicable.

Required controls:

- Private or access-controlled database endpoint
- TLS connection
- Least-privilege database user
- Schema validation
- Explicit tenant filters
- No direct use of unvalidated query objects from clients
- Restricted application rights on audit records where practical

### TB-03: ProxiAI API to Redis

Redis is not a source of user identity or permanent truth. Data in Redis may be absent, stale, or manipulated if infrastructure is compromised.

Required controls:

- Authenticated/private connection
- TLS where supported
- Namespaced keys
- Tenant identifiers in tenant-owned keys
- TTLs
- No raw high-risk prompt data in cache
- Safe fallback behaviour

### TB-04: ProxiAI to LLM providers

This is the main data-egress boundary. Anything sent across it leaves the ProxiAI-controlled environment.

Required controls:

- Policy before provider call
- Masking before routing
- Provider allowlist
- Timeout and retry classification
- Minimal metadata
- No internal auth tokens or secrets in provider headers except the provider credential
- Provider response treated as untrusted content

### TB-05: API to BullMQ workers

Queue payloads can be duplicated and may remain stored in Redis temporarily.

Required controls:

- Minimal event payloads
- No raw prompt or response unless a specific approved worker requires it; MVP workers do not
- Stable event IDs
- Idempotent processors
- Retry limits
- Failure logging without payload leakage

### TB-06: Application to logging, metrics, and dashboards

Operational telemetry often has broader access and longer retention than application data.

Required controls:

- Pino redaction
- No prompt or response content
- No API keys, cookies, authorization headers, or tokens
- No high-cardinality user or organisation labels in Prometheus
- Restricted dashboard access

### TB-07: Deployment operator to cloud runtime

Deployment users can influence images, environment variables, and secrets.

Required controls:

- Least-privilege service accounts
- Separate development and production secrets
- No secrets in images or repository
- Controlled deployment access
- Image provenance and dependency checks where practical

## 9. Attacker-Controlled Inputs

The following inputs must be treated as hostile:

- Email and password fields
- Access tokens and refresh cookies
- Prompt content
- Conversation title and message identifiers
- `clientRequestId`
- Provider selection requested by the client
- Search filters
- Date ranges
- Pagination cursors
- CSV export filters
- User-agent and forwarded IP headers
- Uploaded configuration values, if any are later introduced
- Razorpay webhook body and signature
- Provider HTTP status, headers, streamed chunks, and error messages
- Email-provider callback data
- Environment variables in non-production developer environments
- Queue payloads from previously failed or manually replayed jobs

No value becomes trusted merely because it originated from the ProxiAI frontend.

## 10. Security Invariants

These rules must always remain true.

| ID | Invariant |
|---|---|
| SI-001 | Every tenant-owned database read and write is scoped to the authenticated organisation. |
| SI-002 | A client cannot select its organisation by passing `orgId` in a normal user or org-admin request. |
| SI-003 | A blocked prompt never reaches cache storage, routing, a provider adapter, or message-content persistence. |
| SI-004 | When masking is required, only the masked prompt is sent to the provider. |
| SI-005 | Raw sensitive spans are not stored in audit metadata. |
| SI-006 | The server enforces every role, permission, team scope, and feature flag. |
| SI-007 | Refresh tokens are stored as hashes, are single-use, and belong to a revocable family. |
| SI-008 | Unknown server errors never expose stack traces, internal paths, database errors, or provider credentials to clients. |
| SI-009 | Prompt and response content is never used as a Prometheus label. |
| SI-010 | Encryption failure prevents content persistence; it never falls back to plaintext storage. |
| SI-011 | No-storage or metadata-only behaviour, where enabled, is enforced before constructing content writes. |
| SI-012 | Queue retries cannot apply the same billing or alert side effect multiple times. |
| SI-013 | Provider output is displayed as text and not executed as trusted HTML or code. |
| SI-014 | Audit export requires explicit permission and is itself audited. |
| SI-015 | Secrets are never returned to the browser after being configured. |

## 11. Threat Modeling Method

The threat catalogue uses STRIDE categories:

- **S — Spoofing:** pretending to be another user or system
- **T — Tampering:** unauthorised modification
- **R — Repudiation:** denying an action without sufficient evidence
- **I — Information disclosure:** exposure of confidential data
- **D — Denial of service:** preventing legitimate use or creating uncontrolled cost
- **E — Elevation of privilege:** gaining permissions beyond those assigned

Risk ratings are qualitative for the MVP:

- **Critical:** likely to cause cross-tenant disclosure, credential compromise, or unrestricted admin access
- **High:** serious tenant-level data, security, or cost impact
- **Medium:** limited impact or requires additional conditions
- **Low:** minor impact with straightforward recovery

## 12. Threat Catalogue and Mitigations

### TM-001 — Cross-tenant object access

| Field | Value |
|---|---|
| STRIDE | I, E |
| Risk | Critical |
| Scenario | An authenticated user changes a conversation, log, alert, user, or export identifier to access another organisation's object. |
| Primary cause | Query uses `_id` without `orgId`, or trusts client-supplied tenant identity. |
| Prevention | Resolve `orgId` from auth context; use `{ _id, orgId }` in every tenant query; add repository helpers requiring tenant context; deny absent tenant context. |
| Detection | Audit denied access attempts; integration tests with two organisations; alert on repeated forbidden object requests. |
| Verification | Automated negative tests for every object endpoint and export path. |

### TM-002 — Team-lead scope bypass

| Field | Value |
|---|---|
| STRIDE | I, E |
| Risk | High |
| Scenario | A team lead accesses users or logs outside the assigned team. |
| Prevention | Apply both `orgId` and permitted `teamId`/user set in server-side queries; never rely on hidden UI controls. |
| Detection | Audit administrative reads where practical; test same-org, different-team denial. |
| MVP note | Team-scoped views should remain narrow; do not implement complex custom scopes. |

### TM-003 — Access-token theft or replay

| Field | Value |
|---|---|
| STRIDE | S |
| Risk | High |
| Scenario | A stolen access token is used until expiry. |
| Prevention | Fifteen-minute TTL; HTTPS; do not store access tokens in logs or URLs; prefer in-memory frontend storage; strict CSP and XSS prevention. |
| Detection | Authentication audit events and unusual activity alerts where available. |
| Residual risk | Stateless access tokens cannot be instantly revoked in the MVP; short expiry limits exposure. |

### TM-004 — Refresh-token theft and reuse

| Field | Value |
|---|---|
| STRIDE | S, E |
| Risk | Critical |
| Scenario | An attacker steals a refresh cookie and exchanges it. |
| Prevention | Store only hash in MongoDB; `HttpOnly`, `Secure`, `SameSite` cookie; seven-day expiry; one-time rotation. |
| Detection | Reuse detection when an already-used token appears. |
| Response | Revoke the entire token family, clear cookies, force login, write audit event. |

### TM-005 — Password compromise

| Field | Value |
|---|---|
| STRIDE | S |
| Risk | High |
| Scenario | Credential stuffing or leaked password grants access. |
| Prevention | Approved Argon2id hashing; login rate limits; generic login errors; minimum new-password rules; no plaintext passwords. |
| Detection | Failed-login counters and audit records without password values. |
| MVP limitation | MFA is deferred and must not be claimed. |

### TM-006 — PII or secret detection bypass

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | High |
| Scenario | Obfuscated sensitive data is not detected and is sent externally. |
| Prevention | Pattern normalisation, tested detectors, conservative credential patterns, organisation keyword list only if already supported, block thresholds. |
| Detection | Security test corpus and manual review of false negatives. |
| Residual risk | Regex detection cannot guarantee complete DLP coverage; this limitation must be visible to users and reviewers. |

### TM-007 — Masking bug sends original prompt

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | Critical |
| Scenario | Policy returns `ALLOW_WITH_MASK`, but routing or provider code still receives the original prompt. |
| Prevention | Create a distinct `approvedPrompt` value after policy evaluation; provider interfaces accept only the approved request object; avoid keeping the raw prompt in downstream context. |
| Detection | Unit test with a sentinel secret and fake provider adapter asserting it never receives the original value. |
| Verification | Required release-gate test. |

### TM-008 — Policy bypass through manual provider selection

| Field | Value |
|---|---|
| STRIDE | E, I |
| Risk | High |
| Scenario | User selects a provider manually and bypasses PII or budget policy. |
| Prevention | Policy evaluation always occurs before manual or automatic routing; manual choice affects routing only after policy allows the request. |
| Detection | Audit policy decision and routing reason. |

### TM-009 — Prompt or response leakage through logs

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | Critical |
| Scenario | Debug logging serialises request bodies, provider payloads, tokens, or encrypted fields. |
| Prevention | Pino redact configuration; explicit safe log objects; disable raw body logging; code review rule against `logger.info(req.body)` and provider error dumps. |
| Detection | Automated log-leak tests using sentinel values; scan logs after integration tests. |

### TM-010 — Secret leakage through errors

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | High |
| Scenario | Provider SDK or database error is returned to the browser with credentials or internal details. |
| Prevention | Normalise provider errors; typed application errors; generic unknown error response; redact error objects before logging. |
| Detection | Contract tests for 500, provider-auth, MongoDB, and Redis failures. |

### TM-011 — Weak or incorrect content encryption

| Field | Value |
|---|---|
| STRIDE | I, T |
| Risk | Critical |
| Scenario | Static IV reuse, unauthenticated encryption, wrong key handling, or plaintext fallback exposes stored content. |
| Prevention | AES-256-GCM; fresh random 96-bit IV per value; authentication tag; versioned ciphertext envelope; key from runtime secret; fail closed. |
| Detection | Encryption round-trip and tamper tests; reject modified tag/ciphertext. |
| Residual risk | A single MVP master key has broad impact; managed per-org keys are roadmap only. |

### TM-012 — Encryption key loss or accidental rotation

| Field | Value |
|---|---|
| STRIDE | D |
| Risk | High |
| Scenario | Existing encrypted messages become undecryptable. |
| Prevention | Version key identifiers; document backup and rotation procedure; never overwrite old key before data migration. |
| Detection | Startup configuration check and scheduled decrypt health test using a non-sensitive canary. |
| MVP note | Do not implement automatic rotation without a tested migration path. |

### TM-013 — Prompt-cache cross-tenant leakage

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | Critical |
| Scenario | Two organisations generate the same prompt hash and receive another tenant's cached response. |
| Prevention | Derive an opaque HMAC key that binds trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and policy/config fingerprint; validate tenant binding on read; never share entries across organisations. |
| Detection | Multi-tenant cache integration tests. |

### TM-014 — Sensitive prompt cached despite policy

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | High |
| Scenario | A PII-containing or masked request is cached and retained in Redis. |
| Prevention | Cache only `ALLOW` with risk score zero and zero detected spans; reject `ALLOW_WITH_MASK`, `BLOCK`, masked prompts, and `METADATA_ONLY`; prohibit plaintext Redis responses; defer implementation until encrypted or access-checked safe-reference storage exists. |
| Detection | Tests asserting no Redis key is created for any detected span. |

### TM-015 — Idempotency bypass or collision

| Field | Value |
|---|---|
| STRIDE | T, D |
| Risk | High |
| Scenario | Reusing or guessing another user's client request ID returns or interferes with a request. |
| Prevention | Opaque HMAC key binds trusted `orgId`, `userId`, and client request ID. An opaque request fingerprint binds canonical non-sensitive request fields plus an HMAC of exact prompt bytes. Fingerprint mismatch and every completed duplicate return `409 DUPLICATE_REQUEST`; no response is replayed. |
| Detection | Tests across users and organisations using identical IDs. |

### TM-016 — Duplicate BullMQ processing

| Field | Value |
|---|---|
| STRIDE | T, R |
| Risk | High |
| Scenario | At-least-once delivery causes billing to be deducted twice or duplicate alerts. |
| Prevention | Stable `{ orgId, requestId, jobType }` processing ledger; append-only `RequestLog`; deterministic source-derived monthly rollup; bounded retries; workers designed as idempotent. |
| Detection | Duplicate-event integration tests and reconciliation metrics. |

### TM-017 — NoSQL injection or query operator injection

| Field | Value |
|---|---|
| STRIDE | T, I, E |
| Risk | High |
| Scenario | Client submits `$ne`, `$where`, regex abuse, or arbitrary object structures in filters. |
| Prevention | Zod schemas with strict scalar types; construct query objects field-by-field; never spread request query/body directly into MongoDB filters or updates. |
| Detection | Security tests using MongoDB operator payloads. |

### TM-018 — Mass assignment

| Field | Value |
|---|---|
| STRIDE | E, T |
| Risk | High |
| Scenario | User includes `role`, `permissions`, `orgId`, `plan`, or policy fields in a normal profile update. |
| Prevention | Explicit allowlisted DTOs and update objects; separate admin endpoints; strict schemas rejecting unknown fields. |
| Detection | Tests for prohibited extra properties. |

### TM-019 — Cross-site scripting through provider output

| Field | Value |
|---|---|
| STRIDE | S, I, E |
| Risk | High |
| Scenario | Provider response contains HTML or script that executes in the admin or chat UI. |
| Prevention | Render as escaped text; do not use `dangerouslySetInnerHTML`; sanitise any future Markdown renderer; use CSP. |
| Detection | Frontend tests with script and event-handler payloads. |

### TM-020 — CSRF against refresh, logout, or cookie-authenticated endpoints

| Field | Value |
|---|---|
| STRIDE | S, T |
| Risk | Medium |
| Scenario | Another site causes browser to send refresh cookie. |
| Prevention | `SameSite=Lax` or `Strict` where compatible; allowlisted CORS; validate `Origin` for state-changing cookie endpoints; POST only. |
| Detection | Cross-origin integration tests. |
| Note | Bearer-token endpoints are less exposed to classic CSRF because browsers do not attach the authorization header automatically. |

### TM-021 — CORS misconfiguration

| Field | Value |
|---|---|
| STRIDE | I, E |
| Risk | High |
| Scenario | Wildcard or reflected origins allow hostile websites to call credentialed APIs. |
| Prevention | Exact frontend-origin allowlist; never use `*` with credentials; environment validation; reject missing/unexpected origins where appropriate. |
| Detection | Startup log of configured origins without secrets and automated preflight tests. |

### TM-022 — Denial of service using large prompts or streams

| Field | Value |
|---|---|
| STRIDE | D |
| Risk | High |
| Scenario | Oversized payloads, many concurrent streams, or very long provider responses exhaust memory and connections. |
| Prevention | JSON/body size limit; prompt length/token estimate limits; per-user/org rate limit; provider timeout; stream abort on client disconnect; concurrency limits. |
| Detection | Request-size metrics, rate-limit events, load tests. |

### TM-023 — Provider-cost abuse

| Field | Value |
|---|---|
| STRIDE | D, T |
| Risk | High |
| Scenario | Valid or compromised accounts generate excessive paid requests. |
| Prevention | Monthly budget check before routing; per-user/org rate limits; idempotency; cheaper-provider routing near budget limit; server-calculated cost. |
| Detection | Budget threshold alerts, anomaly detection, provider usage reconciliation. |

### TM-024 — Retry storm and provider amplification

| Field | Value |
|---|---|
| STRIDE | D |
| Risk | High |
| Scenario | A failing provider causes simultaneous retries and additional expense. |
| Prevention | Retry only timeouts, 429, and selected 5xx; maximum attempts; exponential backoff and jitter; circuit breaker; no retry on auth/validation errors. |
| Detection | Retry counters and circuit-state metrics. |

### TM-025 — SSRF through configurable provider URLs

| Field | Value |
|---|---|
| STRIDE | I, E |
| Risk | High |
| Scenario | Attacker causes backend to call cloud metadata or internal services. |
| Prevention | MVP uses hardcoded/allowlisted provider base URLs; do not accept arbitrary endpoint URLs from clients or organisation settings; block redirects where SDK permits. |
| Detection | Tests rejecting non-allowlisted hosts. |

### TM-026 — Malicious provider response or instruction

| Field | Value |
|---|---|
| STRIDE | T, I |
| Risk | Medium |
| Scenario | Provider returns text asking the user to reveal secrets or containing unsafe links/code. |
| Prevention | Treat model output as untrusted text; do not automatically execute tools, HTML, commands, or links; clearly identify provider-generated content. |
| MVP note | ProxiAI does not implement agentic tool execution, which substantially reduces this threat. |

### TM-027 — Audit-log tampering or deletion

| Field | Value |
|---|---|
| STRIDE | T, R |
| Risk | High |
| Scenario | Attacker or bug edits/deletes evidence of an action. |
| Prevention | No normal update/delete service or route; separate model/repository; restrict DB role where practical; audit export checks. |
| Detection | Monitor unexpected mutation operations; backup strategy. |
| Residual risk | Application-level append-only storage is not cryptographically tamper-proof. |

### TM-028 — Audit export data leakage

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | High |
| Scenario | Unauthorised user exports tenant audit data, or spreadsheet formula injection executes when CSV opens. |
| Prevention | Explicit export permission; org-scoped query; date/size limits; audit the export; prefix dangerous CSV cells beginning with `=`, `+`, `-`, or `@`; safe filename. |
| Detection | Export audit records and volume monitoring. |

### TM-029 — Forged webhook

| Field | Value |
|---|---|
| STRIDE | S, T |
| Risk | High |
| Scenario | Attacker forges a payment event to change subscription state. |
| Prevention | Verify Razorpay signature using raw request body; timestamp/replay controls where supported; process event ID idempotently; do not trust client payment status. |
| Detection | Log safe webhook event IDs and signature-failure counts. |
| Scope note | Applies only if the approved MVP enables payment webhooks. |

### TM-030 — Queue payload leakage

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | High |
| Scenario | Raw prompts or credentials persist in BullMQ job payloads or failed-job dashboards. |
| Prevention | Queue only IDs and safe metadata; workers retrieve authorised records when required; never include secrets or raw prompt content. |
| Detection | Inspect queue payload schemas and Bull Board during testing. |

### TM-031 — Health endpoint information disclosure

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | Medium |
| Scenario | Public health response exposes database names, provider keys, internal hosts, or exception text. |
| Prevention | Public liveness/readiness return only status; detailed dependency endpoint requires admin permission and still returns sanitised data. |
| Detection | Contract tests for failure responses. |

### TM-032 — Dependency or build compromise

| Field | Value |
|---|---|
| STRIDE | T, E, I |
| Risk | High |
| Scenario | Malicious or vulnerable npm dependency executes during build/runtime. |
| Prevention | Commit lockfiles; use `npm ci`; minimise dependencies; run audit/scanning; update deliberately; avoid untrusted install scripts where possible. |
| Detection | CI dependency scan and review of critical advisories. |

### TM-033 — Secrets embedded in source, image, or frontend

| Field | Value |
|---|---|
| STRIDE | I |
| Risk | Critical |
| Scenario | API key or encryption key is committed, copied into Docker layer, or bundled into React. |
| Prevention | `.env` ignored; `.env.example` contains placeholders only; secret scanning; runtime injection; build arguments never contain secrets; only `VITE_` public values in frontend. |
| Detection | Repository and image secret scan before deployment. |

### TM-034 — Container privilege abuse

| Field | Value |
|---|---|
| STRIDE | E |
| Risk | Medium |
| Scenario | Remote code execution gains excessive container or host privilege. |
| Prevention | Non-root `node` user; production-only dependencies; minimal image; read-only filesystem where feasible; no privileged mode; no Docker socket mount. |
| Detection | Runtime platform logs and image scan. |

### TM-035 — Client disconnect leaves expensive provider request running

| Field | Value |
|---|---|
| STRIDE | D |
| Risk | Medium |
| Scenario | User closes stream but backend continues paying for generation. |
| Prevention | Use `AbortController`; listen for request/response close; cancel provider call where SDK supports it; stop writing to closed stream. |
| Detection | Compare disconnect and provider-completion metrics. |

### TM-036 — Untrusted forwarded IP headers

| Field | Value |
|---|---|
| STRIDE | S, R |
| Risk | Medium |
| Scenario | Attacker spoofs IP used for audit or rate limiting. |
| Prevention | Configure Express `trust proxy` specifically for Cloud Run/proxy environment; do not blindly trust arbitrary forwarding chains. |
| Detection | Deployment tests and comparison with platform request logs. |

## 13. Authentication Security Design

### 13.1 Password storage

- Use the approved Argon2id profile only; never fall back to bcrypt or
  plaintext storage.
- Store only password hashes.
- Never log password values or hashes.
- Use generic authentication failure message: `Invalid email or password`.
- Apply rate limiting by IP and account identifier without revealing account existence.

### 13.2 Access tokens

- Signed using HS256 with protected-header `typ: at+jwt`.
- Use dedicated `JWT_ACCESS_SECRET` material containing at least 32 decoded
  random bytes; never reuse it for another purpose.
- TTL: 15 minutes.
- Require issuer `proxiai`, audience `proxiai-api`, access-token type `access`,
  subject, separate session ID, issued time, expiry, and unique token ID.
- Role values use uppercase persistence enums. Permission values use canonical
  lowercase namespaced `UserPermission` values without transformation.
- Do not place full permissions or mutable organisation configuration in a long-lived token without revalidation.
- Validate algorithm explicitly; never accept `none` or an unexpected algorithm.

### 13.3 Refresh tokens

- High-entropy random values.
- Stored in `HttpOnly`, `Secure`, `SameSite` cookie in production.
- Store only a cryptographic hash in MongoDB.
- One-time use with `usedAt` and token-family tracking.
- On reuse, revoke the full family and require reauthentication.
- Logout revokes the current family or session and clears the cookie.

### 13.4 Session checks

Every protected request must confirm:

- Token signature and expiry are valid.
- User exists and is active.
- Organisation exists and is active.
- Required permission is present.
- Team scope is applied where relevant.
- Requested feature is enabled for the plan.

## 14. Authorization and Tenant Isolation Design

### 14.1 Tenant identity

The API obtains tenant identity from the authenticated user/session. It must not trust `orgId` from request body, query, route parameter, SSE payload, or cursor for standard tenant APIs.

Super-admin cross-tenant operations, if retained at all in the MVP, must use separate routes, explicit permission, explicit target organisation, and audit logging. They must not reuse ordinary organisation-admin handlers with a hidden override.

### 14.2 Repository pattern

Tenant repositories should require an explicit trusted context:

```ts
interface TenantContext {
  orgId: string;
  userId: string;
  permissions: UserPermission[];
}
```

A safe object lookup has this shape:

```ts
await Conversation.findOne({
  _id: conversationId,
  orgId: ctx.orgId,
  userId: ctx.userId,
});
```

An unsafe lookup is:

```ts
await Conversation.findById(conversationId);
```

unless an immediate, unavoidable, and tested tenant check follows before any data is used or returned. The preferred approach is to scope the query itself.

### 14.3 Permission enforcement

- Permissions are checked in route middleware and again in service logic for high-impact actions.
- Frontend route guards are convenience only.
- Role assignment, budget changes, retention changes, policy changes, audit exports, and alert resolution require explicit permissions.
- A user must not assign a role or permission greater than their own authority.

## 15. Prompt Security and Data-Egress Controls

### 15.1 PII pipeline

The MVP pipeline is:

1. Normalise text for detection without changing the original display value.
2. Detect candidate spans.
3. Classify each span.
4. Calculate an explainable risk score.
5. Produce safe metadata containing category, position if needed, and score — not raw value.
6. Apply organisation thresholds.
7. Return `ALLOW`, `ALLOW_WITH_MASK`, or `BLOCK`.

### 15.2 Masking rules

- Replace the full detected value, not only part of it.
- Use category markers such as `[EMAIL_REDACTED]` and `[CREDENTIAL_REDACTED]`.
- Handle overlapping spans deterministically.
- Apply replacements from the end of the string toward the start to avoid index shifts.
- Do not include raw matched values in errors, logs, audit events, or metrics.

### 15.3 Provider-call rule

The provider adapter receives a new approved request object built after policy evaluation. The original raw prompt must not be available as a fallback field inside the adapter request.

### 15.4 Provider response handling

- Treat output as untrusted text.
- Do not execute returned code.
- Do not render returned HTML directly.
- Do not follow provider-supplied URLs server-side.
- Enforce output and stream limits where the provider supports them.

## 16. Data Protection Design

### 16.1 Data classification

| Classification | Examples | Storage rule |
|---|---|---|
| Public | Product name, public documentation | Normal storage allowed |
| Internal | Provider health, non-sensitive configuration | Access-controlled storage |
| Confidential | Prompt metadata, billing, user activity | Tenant-scoped, restricted access |
| Restricted | Prompt/response content, credentials, tokens, secrets | Encrypt or never store; never log |

### 16.2 Encryption at rest

For encrypted content:

- Algorithm: AES-256-GCM.
- Unique random IV for every encrypted value.
- Store ciphertext, IV, authentication tag, and key version.
- Use canonical encoding such as Base64.
- Include stable additional authenticated data where practical, for example organisation and record identifiers, to make ciphertext swapping detectable.
- Do not silently return empty content when authentication fails; treat it as a data-integrity/security error.

### 16.3 Retention enforcement

Retention is enforced before content persistence:

- `METADATA_ONLY`: no prompt or response ciphertext is constructed.
- `ENCRYPTED_STORAGE`: approved content is encrypted before writing.
- `CUSTOM_RETENTION`, only if implemented from the approved plan: encrypted content has validated expiry and TTL index.
- `NO_STORAGE`, if later enabled: content write is not constructed at all.

### 16.4 Deletion limitations

MongoDB TTL deletion is asynchronous and not guaranteed at the exact expiry second. Documentation and UI must not promise immediate cryptographic deletion at the configured timestamp.

### 16.5 Phase 5 chat-content boundary

- Phase 5 persists message metadata only and never stores plaintext prompt or response content.
- `contentAvailable: false` omits `content`; `contentEnc`, ciphertext, IVs, authentication tags, and key versions are never returned by the message API.
- Phase 9 owns AES-256-GCM content persistence and authorised decryption for `ENCRYPTED_STORAGE`. `METADATA_ONLY` continues to expose no content.
- Only a successfully completed stream may become eligible for Phase 9 persistence. Partial or interrupted assistant output is not persisted.
- Conversation title changes are manual, owner-scoped, and permission-checked. Prompt-derived and LLM-generated titles are prohibited.
- Attachments are deferred. No file ingestion, multipart parsing, storage, preview, or provider forwarding is allowed until MIME/size allowlists, malware scanning, tenant ownership, provider capability, retention, and deletion are approved.

## 17. Secrets Management

### 17.1 MVP rules

- Provider credentials, JWT secret, encryption key, MongoDB URI, Redis URI, email key, and payment secret are runtime secrets.
- They never appear in source code, `.env.example`, logs, screenshots, documentation examples, client bundles, or API responses.
- Development and production use separate credentials.
- Secrets must have enough entropy and be rotated after suspected exposure.

### 17.2 Secret abstraction

Application code should depend on a `SecretManager` interface. The MVP may use environment-injected secrets or encrypted storage as already approved, but callers must not know the storage mechanism.

### 17.3 BYOK guardrail

BYOK is deferred for the beginner MVP. Do not create partially secure BYOK storage or UI merely because the architecture mentions a roadmap. When implemented later, it requires dedicated threat review, encryption-key management, masking in UI, credential validation, access audit, and rotation.

## 18. API Security Controls

### 18.1 Validation

- Use strict Zod schemas.
- Reject unknown fields for security-sensitive requests.
- Validate identifiers, enum values, date ranges, cursor format, string length, arrays, and numeric bounds.
- Normalise email addresses consistently.
- Never pass raw request objects into MongoDB updates.

### 18.2 Request limits

Suggested MVP starting limits, configurable after testing:

| Control | Starting rule |
|---|---|
| JSON body | 256 KB maximum for normal APIs |
| Prompt | Product-defined character/token limit compatible with supported providers |
| Search limit | Maximum 100 records, default 25 |
| Date range | Maximum bounded export/search range |
| Login rate | Strict per IP and account identifier |
| Chat rate | Per user and organisation, plan-aware |
| Concurrent streams | Small bounded number per user |

The exact prompt limit must be aligned with the provider capability registry and documented as an assumption until measured.

Login rate limits use HMAC-SHA-256 opaque key components derived from the
resolved request IP and normalized organisation-slug/email pair. Raw IP,
email, and slug values never appear in Redis keys. The HMAC uses dedicated
`AUTH_RATE_LIMIT_SECRET` material. Forwarded IP headers remain untrusted unless
the deployment explicitly configures a trusted proxy. Redis failure blocks
login with a generic dependency-unavailable response.

### 18.3 CORS and cookies

- Exact origin allowlist.
- Credentials enabled only for the approved frontend origin.
- Refresh cookie is `HttpOnly`, `Secure`, and appropriately `SameSite`.
- Do not put tokens in query strings.
- Validate `Origin` on refresh, logout, and webhook-independent state-changing cookie routes.

### 18.4 Security headers

Use a maintained middleware such as Helmet with reviewed settings:

- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- Frame-ancestors or equivalent clickjacking protection
- HSTS in production after HTTPS is confirmed
- Permissions-Policy with unnecessary browser capabilities disabled

### 18.5 Error handling

Client responses may contain:

- Stable application error code
- Safe human-readable message
- Request ID
- Field-level validation details without sensitive values

They must not contain:

- Stack traces
- SQL/Mongo errors
- Redis keys
- Provider SDK response body
- Internal hostnames
- File paths
- Tokens or credentials
- Raw prompt values

## 19. Redis and Queue Security

### 19.1 Redis key rules

Keys use namespaced prefixes and tenant scope:

```text
cache:prompt:{opaqueHmac(canonicalCacheInput)}
chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}
rate:user:{orgId}:{userId}:{window}
health:{providerId}
```

The prompt-cache HMAC input binds trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and policy/config fingerprint. The idempotency fingerprint stores only an opaque HMAC and never raw prompt content. Do not normalize whitespace or casing without an approved contract. Never expose raw prompts, PII, masked prompts, email addresses, tokens, or secrets in key names or values.

`COMPLETED` idempotency records are non-replayable tombstones. A crash after provider execution may have started can leave `PROCESSING` until expiry and permit a later retry; automatic reconciliation is not approved, and durable recovery/replay remains deferred to Phase 9 safe storage.

### 19.2 Failure behaviour

| Redis use | If Redis is unavailable |
|---|---|
| Prompt cache | Fail open by skipping cache |
| Health cache | Use conservative static provider information |
| Rate limiter | Prefer a safe local/deny strategy for high-risk endpoints; document exact implementation |
| Idempotency | Fail closed for billable chat submission to avoid duplicate provider calls |
| BullMQ | User-facing provider response may still complete, but asynchronous state is degraded and must be surfaced operationally |

### 19.3 Worker rules

- Jobs carry IDs and safe metadata, not prompt content.
- Each processor validates payload schema.
- `requestId` is the canonical correlation ID; Phase 7 does not add `traceId`.
- Billing uses a separate tenant-scoped async ledger and never mutates append-only `RequestLog` records.
- Request outcome payloads always carry an explicit allowlisted `status` and
  `policyAction`; workers never infer outcomes from absent usage or provider
  fields.
- `request.blocked` is analytics-only, contains `BLOCKED` plus `BLOCK`, and
  forbids provider, model, usage, cost, prompt, response, PII, and secret fields.
- `request.completed` permits only `COMPLETED`, `FAILED`, or `INTERRUPTED` with
  `ALLOW` or `ALLOW_WITH_MASK`; provider/model identifiers are required and
  optional usage remains actual-provider data only.
- Usage and cost remain optional; unknown values are omitted and never synthesized as zero.
- Each side effect has an idempotency key, and retry count is bounded to approved transient failures.
- Invalid payloads, unknown usage, and unavailable pricing are terminal outcomes rather than retry loops.
- Exhausted jobs remain visible in BullMQ's failed set, which is the MVP dead-letter mechanism.
- Failed jobs are visible in Bull Board only in controlled environments.
- Bull Board must not be publicly exposed in production.

## 20. Logging, Metrics, and Audit Security

### 20.1 Safe logging

Allowed examples:

- Request ID
- Route template
- HTTP status
- Duration
- Provider identifier
- Token counts
- Cost amount
- Cache hit boolean
- PII category names and score
- Policy action
- Circuit state

Prohibited examples:

- Prompt and response text
- Detected raw PII spans
- Authorization header
- Cookies
- Passwords
- Refresh tokens
- API keys
- Encryption key, IV/tag pairs with corresponding ciphertext in debug dumps
- Full provider error bodies

### 20.2 Prometheus metrics

Do not use these as labels:

- `orgId`
- `userId`
- Email
- Conversation ID
- Request ID
- Prompt content
- Error text

Use bounded labels such as route template, method, status class, provider ID, queue name, and known error category.

### 20.3 Audit events

Audit at minimum:

- Login success and failure
- Logout
- Refresh-token reuse
- Policy allow/mask/block decision
- User activation/deactivation
- Role or team assignment change
- Budget change
- Retention change
- Policy-threshold change
- Audit export
- Secret configuration or rotation, without secret value
- Feature-flag or plan change where implemented

Audit metadata contains safe before/after summaries, not full sensitive objects.

P2-04 emits structured `auth.login_succeeded`, `auth.login_failed`, and
`auth.login_operational_error` events only. Durable append-only audit
persistence remains Phase 9.

## 21. Deployment and Infrastructure Security

### 21.1 Docker image

- Multi-stage build.
- Production dependencies only.
- Run as non-root `node` user.
- Do not copy `.env`, test secrets, git history, or local data into image.
- Use a supported Node version and pin the major/minor strategy deliberately.
- Add `.dockerignore`.
- Scan image before production deployment where practical.

### 21.2 Cloud Run

- HTTPS endpoint only.
- Least-privilege runtime service account.
- Secrets injected at runtime.
- Do not grant runtime service account unnecessary project-wide roles.
- Limit maximum instances to control cost during MVP.
- Configure request timeout compatible with SSE while preventing unbounded connections.
- Ensure worker deployment does not silently scale to zero when continuous queue consumption is required.

### 21.3 MongoDB and Redis

- Not publicly reachable without authentication and network controls.
- TLS enabled where supported.
- Separate production credentials.
- Backups protected and access-controlled.
- Redis persistence choice documented based on queue requirements.

### 21.4 Administrative access

- Production console access is restricted.
- Avoid shared accounts.
- Record deployment and configuration changes in source control or change notes without secrets.
- Rotate secrets when a developer machine or repository is suspected to be compromised.

## 22. Security Test Plan

### 22.1 Unit tests

- Password hashing and verification
- JWT algorithm and expiry validation
- Refresh-token rotation and family revocation
- Permission middleware
- Tenant query helper
- PII detectors and masking
- Risk scoring and policy thresholds
- Encryption round-trip, random IV, and tamper rejection
- Provider error classification
- Retry eligibility
- CSV formula neutralisation
- Log redaction helper

### 22.2 Integration tests

1. Organisation A cannot access Organisation B conversation by ID.
2. Organisation A cannot access Organisation B request log, billing, alert, user, or audit export.
3. Team lead cannot access another team's records.
4. Employee cannot call admin endpoints.
5. Disabled user cannot continue using a still-valid access token.
6. Used refresh token revokes its family when reused.
7. Blocked sentinel secret never reaches fake provider.
8. Masked sentinel secret reaches fake provider only as redacted text.
9. PII request does not create prompt-cache key.
10. Identical prompt in two organisations produces isolated cache entries.
11. Duplicate `clientRequestId` creates one provider call.
12. NoSQL operator payload is rejected.
13. Extra `role`, `orgId`, or `permissions` fields are rejected.
14. Provider error does not leak SDK body.
15. Unknown server error returns generic message and request ID.
16. Queue duplicate does not double-count billing.
17. Audit export is permission-protected, tenant-scoped, and formula-safe.
18. Detailed health endpoint is protected and sanitised.
19. Cross-origin credentialed request from unapproved origin fails.
20. Client disconnect aborts provider generation where supported.

### 22.3 Frontend tests

- Provider output is escaped.
- No use of `dangerouslySetInnerHTML` for chat output.
- Access token is not placed in URL.
- Refresh cookie is not accessed from JavaScript.
- Admin controls hidden for UX and still rejected by backend when called directly.
- Error UI does not display stack or raw provider errors.

### 22.4 Deployment checks

- Production image runs as non-root.
- `.env` is not in image.
- Frontend bundle contains no server secrets.
- Public health endpoints reveal no dependency details.
- Bull Board is not publicly reachable.
- Database and Redis require authentication.
- CORS production allowlist contains only approved origins.

## 23. Security Release Gates

Deployment must stop if any of these fail:

- Cross-tenant negative test
- Permission negative test
- Blocked-prompt provider-call test
- Masked-prompt original-value test
- Refresh-token reuse test
- Encryption tamper test
- Log sentinel leak test
- Secret scan
- Critical dependency vulnerability review
- Production CORS validation
- Non-root container check

For an MVP demo that is not publicly exposed, unresolved medium risks may be documented and accepted. Critical tenant-isolation, credential, prompt-egress, plaintext-storage, or secret-leak risks must not be accepted.

## 24. Incident Response Playbooks

### 24.1 Suspected provider-key leak

1. Disable affected provider adapter or feature flag.
2. Rotate the provider credential.
3. Review provider usage and ProxiAI audit/operational logs.
4. Check repository, image, CI logs, and frontend bundle for exposure.
5. Restore service with the new key.
6. Document cause and preventive change.

### 24.2 Suspected refresh-token theft

1. Revoke the token family or all sessions for the user.
2. Force re-login.
3. Review login, refresh, IP, and administrative activity.
4. Reset password if account compromise is possible.
5. Preserve audit evidence.

### 24.3 Cross-tenant exposure

1. Disable affected endpoint immediately.
2. Preserve logs and deployment version.
3. Determine affected organisations, records, and time range.
4. Fix the query and add regression tests across all similar repositories.
5. Rotate relevant credentials if exposed.
6. Follow organisational legal and notification procedures; do not improvise public claims.

### 24.4 Encryption-key exposure

1. Stop content writes and reads if necessary.
2. Restrict access to the compromised key.
3. Introduce a new key version.
4. Re-encrypt existing data through a controlled migration before retiring the old key.
5. Review all accesses to the secret.

### 24.5 Redis or queue compromise

1. Isolate Redis.
2. Rotate credentials.
3. Treat cached content and queued metadata as potentially exposed.
4. Clear untrusted idempotency/cache data when safe.
5. Reconcile billing and alerts from durable request records.

## 25. Security Responsibilities

For a solo project, the same developer performs multiple roles, but the responsibilities remain distinct:

| Responsibility | Required action |
|---|---|
| Product owner | Approve data retention and user-visible security limitations |
| Developer | Implement controls and tests |
| Security reviewer | Review high-risk flows before public deployment, even if performed as a structured self-review |
| Operator | Protect secrets, databases, deployment access, and backups |
| Tester | Run negative tenant, authorization, PII, and error-leak tests |

A solo developer should use checklists and automated tests to compensate for lack of independent review, but should not describe self-review as an external security audit.

## 26. MVP Security Implementation Order

### Step 1 — Foundation

- Environment validation
- Secret-free repository and `.env.example`
- Pino redaction
- Typed errors
- Helmet and CORS
- Request-size and schema validation

### Step 2 — Identity and tenancy

- Password hashing
- JWT access token
- Refresh rotation and reuse detection
- Active user/org checks
- Permission middleware
- Tenant-scoped repositories
- Two-organisation isolation tests

### Step 3 — Prompt egress controls

- PII detection
- Classification and scoring
- Masking
- Policy engine
- Fake-provider security tests
- Provider allowlist and error normalisation

### Step 4 — Protected persistence

- AES-256-GCM helper
- Retention enforcement before writes
- Safe RequestLog and AuditLog schemas
- Prompt-cache eligibility rules
- Idempotency key isolation

### Step 5 — Async and admin security

- Minimal queue payloads
- Idempotent workers
- Admin permission checks
- Safe cursor/filter validation
- Formula-safe CSV export
- Sanitised health endpoints

### Step 6 — Deployment hardening

- Multi-stage non-root image
- Runtime secrets
- Cloud Run service account review
- Database/Redis access controls
- Secret and dependency scans
- Release-gate checklist

## 27. Known MVP Security Limitations

1. Regex-based PII detection can miss obfuscated or context-dependent sensitive data.
2. A single encryption master key has broad impact.
3. Access-token revocation is not immediate unless an additional session check is performed on each request.
4. Audit logs are append-only by application design but are not cryptographically tamper-evident.
5. In-memory circuit-breaker state is not shared across multiple API instances.
6. BullMQ and Redis add availability and operational dependencies.
7. The solo developer cannot provide true independent security review.
8. No MFA or enterprise SSO is included.
9. Provider data handling remains subject to each provider's service terms and controls.
10. Security controls support safer operation but do not create compliance certification.

## 28. Open Security Questions

These questions must be resolved before a public production launch:

| ID | Question | MVP handling |
|---|---|---|
| OQ-SEC-001 | Which exact third provider is supported alongside Groq and Gemini? | Configure only reviewed provider adapters. |
| OQ-SEC-002 | Where will the encryption master key be stored for the deployed demo? | Use Cloud Run secret injection or equivalent runtime secret. |
| OQ-SEC-003 | Will access-token requests check current user/session state on every call? | Prefer active-user lookup or short-lived cached session state. |
| OQ-SEC-004 | What are final prompt-size and concurrent-stream limits? | Choose conservative limits after local load testing. |
| OQ-SEC-005 | Is Razorpay part of the five-week implementation or documentation-only? | Do not expose webhook until signature verification and idempotency tests pass. |
| OQ-SEC-006 | Is the detailed health endpoint necessary for MVP? | Omit rather than expose an under-protected endpoint. |
| OQ-SEC-007 | What backup and key-recovery process will protect encrypted production data? | Document before storing real confidential content. |
| OQ-SEC-008 | Which roles may view prompt/response content, if any? | Default to the original employee only; admin dashboards use metadata. |

## 29. Security Traceability Matrix

| Security objective | Main controls | Main tests |
|---|---|---|
| SO-001 Tenant isolation | Trusted tenant context, scoped queries, RBAC | Cross-org and cross-team negative tests |
| SO-002 Egress protection | PII pipeline, policy before routing, masked request object | Block and mask sentinel-provider tests |
| SO-003 Session protection | Short access TTL, hashed rotating refresh tokens, reuse detection | Refresh-family tests |
| SO-004 Admin authorization | Permissions, active account checks, server-side feature flags | Direct admin endpoint denial tests |
| SO-005 Telemetry safety | Redaction, safe log objects, bounded metrics | Sentinel log scan |
| SO-006 Stored-data protection | AES-256-GCM, fail-closed encryption, retention enforcement | Tamper and plaintext-absence tests |
| SO-007 Auditability | Append-only audit service, export auditing | Mutation-denial and export tests |
| SO-008 Abuse/cost control | Limits, idempotency, budget guard, circuit breaker | Duplicate, rate, and retry tests |
| SO-009 Safe degradation | Explicit Redis/DB/provider failure rules | Dependency-failure integration tests |
| SO-010 Deployment hardening | Non-root image, runtime secrets, least privilege | Image, secret, and configuration checks |

## 30. Security Definition of Done

The security baseline is complete when:

- [ ] Every tenant-owned query is demonstrably organisation-scoped.
- [ ] Cross-organisation and cross-team tests pass.
- [ ] Role and permission negative tests pass.
- [ ] Passwords are strongly hashed.
- [ ] Refresh tokens are hashed, rotated, and reuse-detected.
- [ ] Blocked prompts never call a provider.
- [ ] Masked prompts never expose the original value downstream.
- [ ] Prompt/response content is absent from logs, metrics, audit metadata, and queue payloads.
- [ ] Encrypted content uses AES-256-GCM with unique IVs and fails closed.
- [ ] Cache and idempotency keys are tenant-scoped.
- [ ] Duplicate jobs cannot double-apply billing or alerts.
- [ ] CSV exports are permission-protected, scoped, and formula-safe.
- [ ] CORS, cookies, headers, and request limits are configured for production.
- [ ] Production image runs as non-root and contains no secrets.
- [ ] Critical dependency and secret-scan findings are resolved.
- [ ] Known limitations and open questions are documented honestly.

## 31. Security Self-Audit

### 31.1 Scope audit — PASS

The document does not add SSO, MFA, BYOK, ML-based DLP, Kafka, multi-region deployment, a policy language, agent tool execution, or new business features. Roadmap topics are described only as deferred controls or limitations.

### 31.2 Beginner and solo-developer audit — PASS

The design uses controls that can be implemented incrementally with the approved stack. It avoids creating a separate microservice security architecture and gives a strict implementation sequence.

### 31.3 Tenant-isolation audit — PASS

Tenant identity is derived from authentication context, every tenant query is required to include `orgId`, team scope is explicit, and multi-tenant negative tests are release gates.

### 31.4 Prompt-egress audit — PASS

PII scanning and policy occur before routing, blocked prompts stop immediately, and masked requests create a distinct approved prompt that is the only value passed to provider adapters.

### 31.5 Authentication audit — PASS

The design includes strong password hashing, short-lived access tokens, hashed refresh tokens, rotation, family revocation, reuse detection, secure cookies, and generic failure messages.

### 31.6 Data-protection audit — PASS with documented limitation

AES-256-GCM, unique IVs, authentication tags, fail-closed behaviour, and pre-write retention enforcement are required. The single master-key impact remains an explicit MVP limitation.

### 31.7 Telemetry and audit audit — PASS

Raw prompt content, credentials, tokens, and sensitive spans are prohibited from logs, metrics, audit metadata, Redis key names, and queue payloads. Prometheus high-cardinality tenant/user labels are also prohibited.

### 31.8 Availability and abuse audit — PASS for MVP

Rate limits, request bounds, budget checks, idempotency, retry classification, jitter, circuit breaking, stream cancellation, and queue idempotency are included without claiming enterprise-scale availability.

### 31.9 Compliance-claim audit — PASS

The document explicitly avoids claiming SOC 2, ISO 27001, or other certification and distinguishes technical evidence support from certified compliance.

### 31.10 Final assessment

**Approved as the security design and repository-scoped threat-model baseline for the ProxiAI beginner solo-developer MVP.**

The highest-priority release risks are:

1. Cross-tenant query mistakes
2. Original prompt leakage after a masking decision
3. Tokens or prompt content appearing in logs
4. Incorrect refresh-token reuse handling
5. Plaintext fallback after encryption failure
6. Non-idempotent billing workers
7. Secrets embedded in source, image, or frontend bundle

These risks must be covered by automated tests before public deployment.

---

Repository: ProxiAI
Version: Architecture v2.0 / MVP documentation baseline v1.0
