# ProxiAI Testing Strategy

**Document ID:** PX-TEST-008  
**Version:** 1.0  
**Status:** Approved MVP Baseline  
**Project:** ProxiAI — Enterprise AI Gateway & Audit Platform  
**Audience:** Solo Developer, Reviewer, QA Reviewer, Security Reviewer  
**Related Documents:** `01_PRD.md`, `02_SDD.md`, `03_TDD.md`, `04_DATABASE_DESIGN.md`, `05_OPENAPI_SPEC.md`, `06_SECURITY_THREAT_MODEL.md`, `07_DEPLOYMENT_ARCHITECTURE.md`

---

## 1. Purpose

This document defines how ProxiAI will be tested before each development milestone and before the MVP release.

The strategy is intentionally designed for a beginner solo developer. It gives priority to the parts of the system where one mistake can create the highest impact:

- cross-organisation data exposure;
- sending blocked sensitive content to an external provider;
- duplicate billable LLM calls;
- incorrect authentication or refresh-token handling;
- failure of provider fallback;
- storing content in the wrong retention mode;
- leaking secrets or prompt data into logs;
- incorrect billing and budget calculations;
- background jobs being silently lost;
- a deployment that appears healthy while dependencies are unavailable.

The goal is not to create a huge enterprise QA department process. The goal is to build a small, repeatable test system that gives strong confidence in the MVP.

---

## 2. Testing Principles

### 2.1 Test by Risk, Not by File Count

The most critical workflows receive the deepest testing even if their implementation is small.

Priority order:

1. tenant isolation;
2. policy enforcement and sensitive-data protection;
3. authentication and session security;
4. paid request duplication prevention;
5. provider routing, retry, circuit breaking, and fallback;
6. retention and encryption;
7. billing and budget enforcement;
8. asynchronous job reliability;
9. API contract correctness;
10. user interface behaviour.

### 2.2 Prefer Deterministic Tests

Automated tests must not depend on live LLM providers unless explicitly marked as optional smoke tests.

Normal test suites will use provider fakes or mocks so that they are:

- fast;
- repeatable;
- free of provider cost;
- independent of network conditions;
- able to simulate exact errors such as timeout, 429, 500, stream interruption, and invalid credentials.

### 2.3 Test Security Controls as Behaviour

Security requirements are not considered complete only because middleware exists. Tests must prove the outcome.

Example:

- weak test: `requirePermission()` middleware is registered;
- strong test: a team lead cannot retrieve a user from another team and receives a safe `403` response.

### 2.4 Every Production Incident Class Needs a Regression Test

Whenever a defect is fixed, a test must be added that fails before the fix and passes after it.

### 2.5 Keep the MVP Tooling Small

The recommended test stack is:

- **Vitest** for unit and integration test execution;
- **Supertest** for Express API tests;
- **mongodb-memory-server** for isolated MongoDB integration tests where practical;
- **Testcontainers** only for Redis/BullMQ integration tests that need real Redis semantics;
- **React Testing Library** for frontend component and page behaviour;
- **Playwright** for a small set of critical end-to-end flows;
- **MSW** for frontend API mocking;
- **k6** or a small Node load script for basic performance checks.

Do not add multiple competing frameworks for the same job.

---

## 3. Scope

### 3.1 In Scope for MVP Testing

- authentication and logout;
- JWT access-token validation;
- refresh-token rotation and token-family reuse detection;
- organisation isolation;
- role and permission enforcement;
- conversation and message handling;
- PII detection, classification, risk scoring, masking, and blocking;
- policy evaluation order;
- provider adapter contract;
- intent classification rules;
- routing and provider scoring;
- retry, timeout, circuit breaker, and fallback;
- SSE response streaming through authenticated `fetch`;
- idempotency;
- prompt caching;
- retention modes implemented in the MVP;
- AES-256-GCM encryption and decryption;
- audit logging;
- request logging without raw content;
- BullMQ jobs;
- usage and billing rollups;
- budget threshold and budget exhaustion behaviour;
- anomaly detection;
- admin dashboard endpoints;
- cursor pagination and filtering;
- health endpoints;
- Docker build and deployment smoke testing;
- frontend critical paths.

### 3.2 Out of Scope for MVP Testing

The following are not required because they are not part of the approved beginner MVP:

- SAML or enterprise SSO;
- MFA;
- BYOK provider implementation;
- machine-learning PII detection;
- machine-learning intent classification;
- Kafka;
- Kubernetes;
- multi-region disaster recovery;
- distributed circuit-breaker state across many API instances;
- seamless model replacement after partial streaming;
- custom enterprise policy language;
- full compliance certification testing;
- large-scale penetration testing by an external vendor.

These items must not appear as passed MVP capabilities.

---

## 4. Quality Objectives

| ID | Objective | MVP Exit Target |
|---|---|---|
| QO-001 | Prevent cross-tenant access | 100% of tenant-isolation tests pass |
| QO-002 | Prevent blocked content from reaching providers | 100% of block-path tests pass |
| QO-003 | Prevent plaintext fallback after encryption failure | 100% of encryption-failure tests pass |
| QO-004 | Prevent duplicate billable calls | 100% of idempotency tests pass |
| QO-005 | Maintain stable public API contracts | All contract tests pass |
| QO-006 | Recover from supported provider failures | Fallback tests pass for timeout, 429, and 5xx |
| QO-007 | Keep secrets and prompt content out of logs | Automated log-redaction tests pass |
| QO-008 | Apply correct retention mode | All retention matrix tests pass |
| QO-009 | Correctly enforce monthly budget | Boundary and concurrency tests pass |
| QO-010 | Detect failed async jobs | Failed jobs are visible and retried |
| QO-011 | Provide usable chat experience | Critical Playwright flow passes |
| QO-012 | Deploy a runnable production image | Container smoke tests pass |

---

## 5. Test Levels

## 5.1 Static Validation

Static validation runs before runtime tests.

Checks:

- TypeScript compilation;
- ESLint;
- formatting check;
- environment schema validation;
- forbidden imports or architecture rules where configured;
- dependency vulnerability scan;
- secret scan;
- OpenAPI syntax validation;
- Dockerfile linting where available.

Suggested commands:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm audit --omit=dev
```

Static validation must not replace behavioural testing.

## 5.2 Unit Tests

Unit tests cover pure logic with no real database, Redis, queue, or provider network call.

High-value unit test targets:

- PII regex detectors;
- category classification;
- risk scoring;
- masking;
- policy decision rules;
- intent classification;
- provider eligibility filtering;
- routing score calculation;
- cost calculation;
- exponential-backoff delay bounds;
- retryable-error classification;
- circuit-breaker state transitions;
- cursor encode/decode;
- API response helpers;
- encryption utility;
- permission resolution;
- retention log-entry builder;
- anomaly threshold calculation.

Target: strong branch coverage on business-critical pure logic.

## 5.3 Component Tests

Component tests verify one service or module with its dependencies replaced by controlled fakes.

Examples:

- `PolicyEngine` with fake organisation configuration;
- `RoutingEngine` with fake provider registry and health values;
- `ChatService` with fake provider adapters;
- `RefreshTokenService` with an in-memory repository fake;
- `BillingWorker` with fake request-completed events;
- frontend `ChatBox` with mocked stream chunks.

## 5.4 Integration Tests

Integration tests use real application modules and selected real infrastructure dependencies.

Examples:

- Express route + middleware + service + MongoDB;
- idempotency logic against real Redis;
- BullMQ producer and worker using real Redis;
- MongoDB TTL-index definition verification;
- refresh-token rotation using real persistence;
- billing-worker idempotency;
- audit append-only restrictions at the repository layer.

## 5.5 API Contract Tests

API tests verify the behaviour documented in `05_OPENAPI_SPEC.md`.

Every public endpoint must be checked for:

- request validation;
- authentication;
- authorisation;
- success response shape;
- expected error response shape;
- `requestId` presence;
- status code;
- content type;
- tenant scoping;
- pagination metadata where relevant.

## 5.6 End-to-End Tests

End-to-end tests cover only the highest-value workflows. The MVP should not attempt hundreds of brittle browser tests.

Required E2E flows:

1. login and send a normal prompt;
2. send a prompt that is masked before provider submission;
3. send a prompt that is blocked;
4. simulate primary provider failure and confirm fallback;
5. verify duplicate send does not create a second provider call;
6. admin views usage dashboard;
7. team lead cannot see another team’s records;
8. refresh-token rotation continues the session;
9. reused refresh token invalidates the family;
10. logout removes session access.

## 5.7 Performance Tests

Performance testing is limited but meaningful.

MVP tests:

- PII pipeline latency on representative prompt sizes;
- policy-engine latency;
- routing-decision latency;
- dashboard query response time with seeded data;
- cursor pagination over a realistic local data volume;
- concurrent chat-start requests using fake providers;
- Redis idempotency under concurrent duplicate submissions;
- worker processing throughput for a controlled event batch.

No claim of internet-scale performance should be made from local tests.

## 5.8 Security Tests

Security tests are derived from `06_SECURITY_THREAT_MODEL.md`.

Mandatory automated checks:

- cross-tenant object access;
- cross-team access;
- missing permission;
- forged or expired JWT;
- refresh-token reuse;
- NoSQL operator injection;
- oversized request body;
- XSS payload handling;
- CORS rejection;
- CSV formula injection prevention;
- secret redaction;
- prompt redaction;
- blocked prompt not reaching provider;
- masked prompt replacing original provider input;
- encryption failure not persisting plaintext;
- webhook signature rejection if Razorpay webhook is included.

---

## 6. Test Environment Strategy

## 6.1 Local Developer Environment

Used for most test execution.

Components:

- API process;
- frontend process;
- MongoDB test database;
- Redis test instance;
- BullMQ workers;
- fake provider server or in-process fake adapters.

Rules:

- test data must not use real personal data;
- test provider credentials must not be required for normal test runs;
- local test databases must use names clearly ending in `_test`;
- destructive test cleanup must verify the database name before deletion.

## 6.2 CI Environment

Every pull request or merge request should run:

1. dependency install using lockfile;
2. type check;
3. lint;
4. unit tests;
5. API integration tests;
6. Redis/BullMQ integration tests;
7. frontend tests;
8. OpenAPI validation;
9. production Docker build;
10. secret scan.

Playwright E2E may run on every merge to `main` if execution time is too high for every commit.

## 6.3 Staging Environment

Staging uses separate:

- database;
- Redis instance;
- application secrets;
- provider test credentials;
- frontend URL;
- callback/webhook configuration.

Staging tests verify actual deployment configuration and optional provider connectivity.

## 6.4 Production Smoke Testing

Production smoke tests must be non-destructive.

Allowed checks:

- frontend loads;
- `/health/live` returns healthy;
- `/health/ready` confirms required dependencies;
- login page renders;
- a dedicated synthetic test account can log in;
- one low-cost provider request can run if approved;
- logs contain the request ID and no prompt content;
- worker heartbeat is current.

Do not run destructive security tests against production.

---

## 7. Test Data Strategy

### 7.1 Organisation Fixtures

Create at least:

- `org_free_alpha`;
- `org_pro_beta`;
- `org_enterprise_gamma` only if needed for roadmap configuration checks;
- one inactive organisation.

### 7.2 User Fixtures

Create:

- employee in Alpha;
- employee in Beta;
- team lead in Alpha Team A;
- employee in Alpha Team B;
- organisation admin in Alpha;
- organisation admin in Beta;
- super admin only for platform-level tests;
- inactive user;
- user with an intentionally restricted permission set.

### 7.3 Prompt Fixtures

Maintain named, reusable fixtures:

- normal question;
- long summarisation prompt;
- code-debugging prompt;
- email address;
- phone number;
- government-ID-like value;
- payment-card-like value;
- API key;
- connection string;
- mixed PII categories;
- false-positive candidate;
- Unicode and multilingual content;
- HTML/script payload;
- extremely long prompt;
- repeated prompt for cache testing.

Never include real API keys or real personal identifiers.

### 7.4 Provider Responses

Fake-provider scenarios:

- successful non-stream response;
- successful stream;
- slow response;
- timeout;
- HTTP 429;
- HTTP 500;
- invalid authentication error;
- malformed provider response;
- stream fails before first token;
- stream fails after partial output;
- provider reports token usage;
- provider omits usage, requiring estimated usage.

---

## 8. Test Doubles and Provider Simulation

Define a reusable `FakeProviderAdapter` implementing the production `ProviderAdapter` contract.

Suggested controls:

```ts
interface FakeProviderBehaviour {
  mode:
    | 'success'
    | 'timeout'
    | 'rate_limit'
    | 'server_error'
    | 'auth_error'
    | 'stream_error_before_first_token'
    | 'stream_error_after_partial';
  latencyMs?: number;
  chunks?: string[];
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}
```

The fake must record:

- number of calls;
- exact prompt received;
- provider request ID;
- start and completion times;
- whether streaming was requested.

This call record is necessary to prove:

- blocked prompts generated zero calls;
- masked prompts sent only masked text;
- idempotent duplicates generated one call;
- fallback called providers in the correct order.

---

## 9. Authentication and Session Test Plan

| ID | Scenario | Expected Result | Level |
|---|---|---|---|
| AUTH-001 | Valid login | Access token issued; refresh cookie set securely | API integration |
| AUTH-002 | Wrong password | Generic authentication failure; no account details leaked | API integration |
| AUTH-003 | Inactive user | Login rejected | API integration |
| AUTH-004 | Inactive organisation | Login rejected | API integration |
| AUTH-005 | Expired access token | Protected endpoint returns `401` | API contract |
| AUTH-006 | Forged JWT signature | Request rejected | Security integration |
| AUTH-007 | Valid refresh token | Old token marked used; new token issued | Integration |
| AUTH-008 | Refresh token used twice | Entire token family revoked | Integration |
| AUTH-009 | Revoked refresh token | Refresh rejected | Integration |
| AUTH-010 | Logout | Current session token revoked and cookie cleared | E2E |
| AUTH-011 | Refresh cookie missing | Safe `401` response | API contract |
| AUTH-012 | Refresh cookie flags | `HttpOnly`, `Secure` in production, appropriate `SameSite` | Configuration test |
| AUTH-013 | Password stored | Strong hash exists; plaintext absent | Repository integration |
| AUTH-014 | Login log safety | Password and tokens absent from logs | Security test |

Boundary checks:

- access token expires exactly at configured time;
- refresh token expires exactly at configured time;
- token family revocation affects all tokens in the family;
- simultaneous refresh attempts result in one success and one reuse/invalid response according to implementation policy.

---

## 10. Tenant Isolation and RBAC Test Plan

Tenant isolation is a release-blocking test category.

### 10.1 Mandatory Object Access Tests

For every tenant-owned endpoint:

1. create resource under Organisation A;
2. authenticate as equivalent role from Organisation B;
3. attempt access using Organisation A resource ID;
4. verify no data is returned;
5. verify error does not reveal resource details;
6. verify no update or deletion occurred.

Apply to:

- conversations;
- messages;
- request logs;
- billing summaries;
- alerts;
- audit logs;
- users;
- teams;
- policy configuration;
- retention configuration.

### 10.2 Role Matrix

| Capability | Employee | Team Lead | Org Admin | Super Admin |
|---|---:|---:|---:|---:|
| Send chat request | Yes | Yes | Yes | As explicitly supported |
| View own conversations | Yes | Yes | Yes | As explicitly supported |
| View team usage | No | Own team | All org | Platform-scoped only |
| View organisation billing | No | No unless granted | Yes | Platform-scoped only |
| Change policy | No | No | Yes | Platform-scoped only |
| Change retention | No | No | Yes | Platform-scoped only |
| Export audit log | No | No | Yes | Platform-scoped only |
| Resolve alerts | No | Limited only if designed | Yes | Platform-scoped only |

Every `Yes`, `No`, and scoped permission must have at least one automated test.

---

## 11. PII and Policy Test Plan

## 11.1 Detection Tests

Each detector requires:

- positive example;
- negative example;
- near-match example;
- whitespace or punctuation variation;
- multiple occurrences;
- mixed-category prompt;
- Unicode text around the value.

## 11.2 Classification Tests

Verify detected spans are classified into the correct categories:

- `CONTACT_INFO`;
- `FINANCIAL`;
- `GOVERNMENT_ID`;
- `CREDENTIAL`;
- `INTERNAL_SECRET`;
- `BUSINESS_CONFIDENTIAL` where supported.

## 11.3 Risk-Score Tests

Verify:

- empty spans produce score `0`;
- one category uses its configured weight;
- multiple categories sum correctly;
- score is capped at `100`;
- duplicate-span handling matches the documented rule;
- category changes affect the score predictably.

## 11.4 Policy Decision Tests

| ID | Condition | Expected Decision |
|---|---|---|
| POLICY-001 | Budget exceeded | `BLOCK` |
| POLICY-002 | Risk at or above block threshold | `BLOCK` |
| POLICY-003 | Risk at or above mask threshold and below block threshold | `ALLOW_WITH_MASK` |
| POLICY-004 | Risk below thresholds | `ALLOW` |
| POLICY-005 | Missing required policy config | Fail safely using documented defaults or reject configuration |
| POLICY-006 | Manual provider selected but policy blocks | No provider call |
| POLICY-007 | Mask decision | Provider receives masked prompt only |
| POLICY-008 | Block decision | Provider-call count remains zero |
| POLICY-009 | Audit record | Decision, rule, score, categories stored without raw sensitive value |

`REQUIRE_APPROVAL` is not an MVP implementation requirement and must not be tested as delivered functionality.

---

## 12. Routing, Retry, Circuit Breaker, and Fallback Test Plan

## 12.1 Provider Eligibility

Verify providers are removed when:

- context length exceeds capability;
- required streaming is unsupported;
- provider health is unavailable or circuit is open;
- budget rules exclude expensive providers;
- provider is disabled by plan or feature flag.

## 12.2 Scoring

Test each input independently:

- capability match;
- latency;
- cost;
- health;
- intent classification;
- tie-break by cost;
- deterministic tie behaviour.

## 12.3 Retry

| Error | Retry? |
|---|---:|
| Timeout | Yes |
| Network reset | Yes |
| HTTP 429 | Yes, respecting configured policy |
| HTTP 500/502/503 | Yes |
| Invalid API key | No |
| Invalid request | No |
| Content/policy rejection | No |

Verify:

- maximum attempt count;
- increasing delay;
- jitter stays inside configured range;
- final error is normalized;
- retries do not create duplicate business log entries.

## 12.4 Circuit Breaker

Required state-transition tests:

1. starts `CLOSED`;
2. successful call remains `CLOSED`;
3. failures below threshold remain `CLOSED`;
4. threshold failure changes to `OPEN`;
5. `OPEN` requests short-circuit without provider call;
6. cooldown changes to `HALF_OPEN`;
7. successful half-open trial changes to `CLOSED`;
8. failed half-open trial returns to `OPEN`.

Use fake timers to avoid real waiting.

## 12.5 Fallback

Verify:

- primary success does not call fallback;
- retry exhaustion before first token calls secondary;
- open primary circuit immediately calls secondary;
- secondary failure calls tertiary;
- all providers unavailable returns documented error;
- fallback reason appears in request metadata;
- routing event and provider-failed event are emitted once;
- fallback does not bypass policy evaluation.

---

## 13. Streaming Test Plan

The client uses authenticated `fetch()` response-body streaming rather than browser `EventSource`.

Required tests:

- correct `text/event-stream` content type;
- token chunks arrive in order;
- multiple chunks build the final assistant message;
- `done` event closes the logical stream;
- usage metadata is included in the final event;
- pre-stream validation error returns normal JSON;
- error before first token may trigger fallback;
- error after partial stream sends a visible stream error and does not silently splice providers;
- client disconnect stops or aborts provider processing where supported;
- malformed stream event is handled safely by frontend;
- HTML/script text is rendered as text, not executed;
- reconnect does not create a duplicate paid call when the same client request ID is used.

---

## 14. Redis, Cache, and Idempotency Test Plan

## 14.1 Prompt Cache

Verify:

- normalized equivalent prompt uses same key if that is the documented rule;
- organisation ID is part of the cache key;
- same prompt in different organisations never shares data;
- PII score greater than zero prevents caching;
- disallowed retention mode prevents caching;
- valid cache hit skips provider call;
- expired cache entry causes provider call;
- Redis cache failure fails open and calls provider;
- cached response metadata identifies cache hit;
- cache does not store secrets or unencrypted restricted content.

## 14.2 Idempotency

Verify:

- first request creates processing state;
- concurrent duplicate request does not call provider twice;
- completed duplicate returns stored result/reference;
- same client request ID in another organisation is independent;
- TTL expiry allows a later new request according to contract;
- invalid reuse with different payload is rejected;
- Redis failure follows the documented fail-closed behaviour for paid request creation;
- abandoned processing key has a recovery strategy.

Concurrency test:

- send 10 simultaneous requests with the same organisation and client request ID;
- assert exactly one provider call;
- assert all callers receive a consistent final result or documented in-progress response.

---

## 15. Database, Retention, and Encryption Test Plan

## 15.1 Schema and Index Tests

Verify required indexes exist for:

- organisation identifier uniqueness;
- user email within tenant as designed;
- request log organisation/time query;
- message conversation/time query;
- billing organisation/period query;
- audit organisation/time query;
- refresh-token hash;
- retention `expiresAt` TTL where applicable.

## 15.2 Retention Matrix

| Mode | Prompt Stored | Response Stored | Metadata Stored | Expected Test |
|---|---:|---:|---:|---|
| Metadata Only | No | No | Yes | No content fields present |
| Encrypted Storage | Encrypted | Encrypted | Yes | Ciphertext exists; plaintext absent |
| Custom Retention, if implemented | Encrypted | Encrypted | Yes | `expiresAt` set and TTL index present |
| No Storage | Roadmap unless explicitly implemented | Roadmap | Minimal billing event only | Must not be claimed as MVP-complete |

## 15.3 Encryption

Verify:

- encrypt then decrypt returns original text;
- same plaintext produces different ciphertext because of unique IV;
- authentication tag tampering fails decryption;
- wrong key fails decryption;
- IV length is correct;
- plaintext is not persisted;
- key is not stored in MongoDB document;
- encryption error fails the write instead of storing plaintext;
- logs do not contain key, plaintext, IV/tag combination as a reusable secret package.

## 15.4 Audit Append-Only Behaviour

Verify:

- insert succeeds for authorised internal writer;
- application has no public update endpoint;
- application has no public delete endpoint;
- repository update/delete methods are absent or blocked;
- metadata excludes raw prompt and response;
- export is permission-protected;
- CSV values beginning with `=`, `+`, `-`, or `@` are neutralised.

---

## 16. Billing, Budget, and Anomaly Test Plan

## 16.1 Billing

Verify:

- token totals aggregate correctly;
- input/output token separation is correct where used;
- provider cost uses configured pricing and decimal-safe arithmetic;
- fallback records actual selected provider;
- cache hit does not create provider cost;
- failed request accounting follows documented rule;
- replayed `request.completed` event does not double bill;
- monthly period boundary is calculated using documented timezone;
- two users in same organisation aggregate correctly;
- different organisations remain isolated.

## 16.2 Budget

Boundary tests:

- just below threshold;
- exactly at 80%;
- just above 80%;
- exactly at 100%;
- above 100% due to concurrent in-flight requests;
- new request after exhaustion;
- monthly reset;
- organisation with no configured budget if allowed.

Expected controls:

- threshold notification is not sent repeatedly for every request;
- exhausted budget blocks before provider call;
- audit event identifies budget rule;
- provider call count remains zero on block.

## 16.3 Anomaly Detection

Verify:

- correct seven-day or configured rolling average;
- zero historical average handled safely;
- current use below threshold creates no alert;
- use above threshold creates one alert;
- repeated event does not create duplicate active alert if deduplication is required;
- resolved alert is updated only by authorised user;
- anomaly email job is queued;
- raw prompt content is absent from alert and email payload.

---

## 17. BullMQ and Background Worker Test Plan

Queues in MVP:

- analytics;
- billing;
- email;
- anomaly;
- health check;
- retention/archive only if required by implemented mode.

For each queue verify:

- valid job can be added;
- worker consumes job;
- success is recorded;
- transient failure retries;
- retry delay follows configuration;
- maximum attempts are enforced;
- permanent failure becomes visible in failed jobs;
- handler is idempotent;
- malformed payload is rejected safely;
- payload does not contain raw prompt or response unless explicitly and safely required;
- correlation/request ID is preserved;
- worker logs do not leak secrets;
- worker heartbeat or health signal is updated.

A test must simulate worker restart after a job has been accepted but before completion.

---

## 18. Admin Dashboard and Search Test Plan

Verify dashboard metrics against known seeded data:

- requests today;
- requests this month;
- total tokens;
- total cost;
- budget remaining;
- provider usage;
- provider health;
- cache-hit ratio;
- fallback rate;
- active alerts;
- error rate where implemented.

Search and filter tests:

- employee filter;
- provider filter;
- date range;
- PII-only filter;
- combination of filters;
- no-result response;
- invalid date range;
- invalid cursor;
- permission boundary;
- tenant boundary.

Cursor pagination tests:

- first page;
- next page;
- final page;
- stable ordering when two records share timestamp;
- no duplicate records across pages;
- no missing records across pages;
- cursor tampering produces safe validation error.

---

## 19. Frontend Test Plan

## 19.1 Component Tests

Cover:

- login form validation;
- error banner;
- chat input disabled state;
- streaming message rendering;
- mask-warning display;
- policy-block message;
- provider/fallback status display;
- dashboard KPI cards;
- pagination controls;
- alert badge;
- loading, empty, and error states;
- role-based navigation visibility.

Frontend visibility is not treated as security enforcement; backend permission tests remain mandatory.

## 19.2 Accessibility Checks

Minimum MVP checks:

- keyboard access to login and chat;
- visible focus state;
- input labels;
- error messages connected to fields;
- status updates announced appropriately for streaming where practical;
- adequate heading order;
- no colour-only meaning;
- buttons have accessible names.

Use automated accessibility tooling as a helper, followed by manual keyboard checks.

## 19.3 Browser Coverage

MVP support:

- latest stable Chrome;
- latest stable Edge;
- latest stable Firefox where possible.

Safari testing is recommended if accessible but not a release blocker for the solo MVP unless the product specifically targets it.

---

## 20. API Contract Checklist

For each endpoint verify:

- route and HTTP method;
- version prefix `/api/v1`;
- input schema;
- unknown-field handling;
- required authentication;
- required permission;
- tenant resolution from authenticated context;
- success envelope;
- error envelope;
- request ID;
- status code;
- response content type;
- pagination shape;
- date/time format;
- decimal cost format;
- no stack trace;
- no raw secret;
- no unexpected prompt/response content.

OpenAPI validation should compare implementation responses with schema where practical.

---

## 21. Failure Injection Matrix

| Dependency | Injected Failure | Expected Behaviour |
|---|---|---|
| MongoDB | Connection unavailable before request | Readiness fails; protected data operation returns controlled error |
| MongoDB | Write fails after provider success | User result handling follows documented policy; failure logged without content leakage |
| Redis cache | Unavailable | Cache skipped; normal provider path continues |
| Redis idempotency | Unavailable | New paid request fails closed as documented |
| Redis/BullMQ | Queue unavailable | User response is not corrupted; side-effect failure is visible and logged |
| Provider primary | Timeout | Retry then fallback |
| Provider primary | 429 | Retry policy then fallback |
| Provider primary | Invalid key | No retry; fallback only if policy permits configuration failure fallback |
| Provider stream | Fails before first token | Fallback allowed |
| Provider stream | Fails after partial text | Visible stream error; no silent splice |
| Encryption | Encrypt operation fails | No plaintext write |
| Email provider | Unavailable | Email job retries; chat request unaffected |
| Worker | Crashes during job | Job retries or becomes visible as failed |

---

## 22. Performance and Capacity Baseline

The MVP should record baseline results rather than claiming enterprise scale.

Suggested local/staging scenarios:

### PERF-001: Pure Decision Pipeline

- 1,000 PII + policy + routing evaluations using in-memory data;
- capture p50, p95, and maximum;
- no provider network call.

### PERF-002: Concurrent Fake Chat Starts

- 25 concurrent users;
- fake provider with controlled latency;
- verify error rate and response-start time.

### PERF-003: Idempotency Burst

- 20 concurrent identical request IDs;
- exactly one provider invocation.

### PERF-004: Admin Log Pagination

- seed at least 50,000 request-log records locally if machine resources allow;
- query first, middle cursor sequence, and filtered pages;
- record timings and query plan.

### PERF-005: Worker Batch

- enqueue 1,000 lightweight billing events;
- verify no duplicate rollups and record throughput.

Performance failures become release blockers only when they violate explicitly approved MVP thresholds or reveal correctness defects.

---

## 23. Test Coverage Policy

A single overall percentage is not enough.

Recommended gates:

- critical pure modules such as policy, scoring, routing, retry, circuit breaker, encryption, and permission logic: **90% branch coverage target**;
- backend overall: **75% line coverage target**;
- frontend overall: **60% line coverage target**;
- all critical workflows must have explicit scenario tests regardless of coverage percentage.

Coverage exclusions must be limited and justified, such as generated files or framework bootstrap code.

Coverage is a warning signal, not proof of correctness.

---

## 24. Defect Severity and Release Rules

| Severity | Definition | Release Rule |
|---|---|---|
| Critical | Cross-tenant exposure, secret leak, blocked prompt sent externally, auth bypass, plaintext persistence | Release prohibited |
| High | Duplicate paid calls, wrong billing, fallback failure for supported case, audit loss, budget bypass | Release prohibited |
| Medium | Important workflow defect with workaround, incorrect dashboard metric, non-critical browser issue | Fix before release unless explicitly accepted |
| Low | Cosmetic issue or minor documentation mismatch | May be deferred with tracking |

Any flaky test in a critical security or billing area is treated as a real defect until proven otherwise.

---

## 25. CI Quality Gates

A change may merge only when:

- TypeScript compilation passes;
- lint passes;
- unit tests pass;
- integration tests pass;
- tenant-isolation suite passes;
- policy-egress suite passes;
- authentication suite passes;
- OpenAPI validation passes;
- secret scan passes;
- production Docker image builds;
- no critical dependency vulnerability remains without documented acceptance.

Before production release additionally require:

- Playwright critical-path suite passes in staging;
- deployment smoke tests pass;
- database indexes verified;
- worker processing verified;
- rollback steps reviewed;
- release checklist signed by the developer.

---

## 26. Five-Week Testing Plan

## Week 1 — Core Proxy

Build and test:

- test framework setup;
- API test helper;
- test database isolation;
- authentication tests;
- tenant fixtures;
- provider fake;
- standard response and error tests;
- basic request-log tests.

Exit gate:

- login and one fake-provider request pass through API integration tests;
- cross-tenant conversation access is blocked.

## Week 2 — Routing and Resilience

Build and test:

- provider adapter contract;
- capability filtering;
- intent rules;
- routing score;
- retry;
- circuit breaker;
- fallback;
- provider error normalization.

Exit gate:

- timeout, 429, and 5xx scenarios behave correctly;
- all-provider failure returns controlled error.

## Week 3 — Policy, PII, and Events

Build and test:

- PII fixtures;
- detector/classifier/scorer tests;
- policy decision tests;
- masked and blocked provider-call assertions;
- BullMQ integration harness;
- billing and anomaly worker idempotency.

Exit gate:

- blocked content produces zero provider calls;
- masked content sends no original sensitive value;
- replayed event does not double bill.

## Week 4 — Streaming and Dashboard

Build and test:

- streaming parser and API tests;
- partial failure behaviour;
- frontend component tests;
- cursor pagination;
- filters;
- dashboard metrics;
- core Playwright flows.

Exit gate:

- authenticated stream works;
- fallback before first token works;
- dashboard values match seeded data.

## Week 5 — Observability and Deployment

Build and test:

- log redaction;
- metrics labels;
- health endpoints;
- Docker image;
- CI pipeline;
- staging deployment;
- smoke tests;
- basic performance baseline;
- final security regression suite.

Exit gate:

- all critical quality gates pass;
- production image runs as non-root;
- readiness detects MongoDB/Redis/provider health as designed;
- no critical or high defect remains open.

---

## 27. Required Test Files and Suggested Structure

```text
backend/
  src/
  tests/
    unit/
      pii/
      policy/
      routing/
      providers/
      auth/
      crypto/
    integration/
      api/
      mongodb/
      redis/
      bullmq/
      security/
    fixtures/
      organisations.ts
      users.ts
      prompts.ts
      providerResponses.ts
    helpers/
      testApp.ts
      fakeProvider.ts
      auth.ts
      database.ts
      redis.ts

frontend/
  src/
  tests/
    components/
    pages/
    helpers/
  e2e/
    auth.spec.ts
    chat.spec.ts
    admin.spec.ts
    security-boundaries.spec.ts
```

Keep tests close enough to the feature to remain understandable, but avoid duplicate fixture definitions across many files.

---

## 28. Entry and Exit Criteria

## 28.1 Entry Criteria for Feature Testing

- acceptance criteria exist;
- API or service contract is defined;
- test data is identified;
- external dependencies can be faked;
- expected error behaviour is documented;
- feature is available in a test environment.

## 28.2 Exit Criteria for a Feature

- unit tests pass;
- integration tests pass where required;
- permission and tenant tests pass;
- negative cases pass;
- logs are reviewed for sensitive-data leakage;
- API documentation matches implementation;
- no critical/high defect remains;
- regression test added for every fixed defect.

## 28.3 MVP Release Exit Criteria

- all CI quality gates pass;
- all mandatory E2E flows pass in staging;
- security release gates pass;
- billing and idempotency concurrency tests pass;
- deployment smoke tests pass;
- rollback procedure is usable;
- known limitations are documented;
- test evidence is retained in CI output or release notes.

---

## 29. Traceability Matrix

| Product Area | Primary Test Sections | Release Critical |
|---|---|---:|
| Authentication | 9 | Yes |
| Tenant isolation and RBAC | 10 | Yes |
| PII and policy | 11 | Yes |
| Routing and resilience | 12 | Yes |
| Streaming | 13 | Yes |
| Cache and idempotency | 14 | Yes |
| Database and retention | 15 | Yes |
| Billing and anomaly | 16 | Yes |
| Background jobs | 17 | Yes |
| Dashboard and pagination | 18 | Medium/High |
| Frontend UX | 19 | Medium |
| API contract | 20 | Yes |
| Dependency failure handling | 21 | Yes |
| Performance baseline | 22 | Medium |
| Deployment | 25–26 | Yes |

---

## 30. Known MVP Testing Limitations

- Live provider behaviour cannot be fully controlled; most automated tests use fakes.
- Regex PII detection will have false positives and false negatives.
- Local load testing does not prove cloud-scale capacity.
- MongoDB TTL deletion is asynchronous and may not occur exactly at expiry time.
- Single-instance circuit-breaker testing does not validate distributed-state consistency.
- Full penetration testing is not included.
- Disaster-recovery testing is limited to backup/restore procedure validation.
- Browser coverage may be constrained by available devices.
- Email deliverability testing verifies job and provider acceptance, not guaranteed inbox placement.

These limitations must be disclosed rather than hidden.

---

## 31. Open Testing Decisions

1. Confirm whether Vitest will be used for both frontend and backend or Jest is already established in the repository.
2. Confirm whether Testcontainers is acceptable in local and CI environments.
3. Decide the exact monthly budget timezone.
4. Decide whether failed provider requests count toward request limits.
5. Confirm how duplicate requests in `processing` state are returned to the client.
6. Confirm exact PII masks for each category.
7. Confirm whether dashboard p95 latency is calculated from Prometheus or persisted aggregates in MVP.
8. Confirm worker hosting choice so heartbeat tests can match deployment behaviour.
9. Confirm whether Custom Retention is included in the MVP build or remains optional after Metadata Only and Encrypted Storage.
10. Confirm whether Razorpay payment flows are part of the first MVP release or only subscription-plan configuration is demonstrated.

Unresolved decisions must be marked in relevant tests and must not be guessed silently.

---

## 32. Testing Definition of Done

Testing for the ProxiAI MVP is complete only when:

- critical business rules have automated tests;
- all tenant-owned endpoints have cross-tenant negative tests;
- blocked and masked prompt paths are verified using provider-call records;
- refresh-token rotation and reuse detection are tested;
- duplicate requests are proven to produce one paid provider call;
- retention and encryption matrix tests pass;
- billing event replay does not double count;
- provider fallback is verified before stream start;
- partial-stream failure is visible and controlled;
- BullMQ retry/failure behaviour is observable;
- API response contracts match the OpenAPI document;
- logs and metrics contain no forbidden sensitive fields;
- staging E2E suite passes;
- production Docker image builds and runs as non-root;
- no critical or high defect remains open;
- known limitations are documented honestly.

---

## 33. Self-Audit

### 33.1 Scope Audit — PASS

The strategy covers only features already defined in the approved ProxiAI MVP documentation. It does not add SSO, MFA, Kafka, Kubernetes, ML classifiers, BYOK, or other roadmap features.

### 33.2 Beginner Solo-Developer Audit — PASS

The toolset is intentionally small. The strategy limits browser E2E tests to critical paths and relies on deterministic provider fakes to reduce cost and complexity.

### 33.3 Tenant-Isolation Audit — PASS

Cross-tenant negative testing is mandatory for every tenant-owned endpoint and is a release-blocking gate.

### 33.4 Sensitive-Data Audit — PASS

The strategy verifies that blocked prompts never reach providers, masked prompts replace original content, encryption never falls back to plaintext, and logs, metrics, queues, alerts, and audit entries exclude restricted raw content.

### 33.5 Authentication Audit — PASS

Login, access-token validation, refresh rotation, token-family reuse detection, revocation, logout, cookie flags, and token-log redaction are covered.

### 33.6 Reliability Audit — PASS FOR MVP

Retry, circuit breaking, fallback, Redis failure modes, worker retry, queue failure visibility, and dependency failure injection are covered. Distributed multi-instance circuit-breaker testing remains correctly deferred.

### 33.7 Billing and Duplicate-Call Audit — PASS

Idempotency concurrency tests and billing event replay tests explicitly protect against duplicate provider cost and duplicate rollups.

### 33.8 API Consistency Audit — PASS

The strategy requires validation of versioning, envelopes, status codes, request IDs, pagination, decimal values, and OpenAPI conformance.

### 33.9 Deployment Audit — PASS

The production image build, non-root execution, readiness, worker heartbeat, staging smoke tests, and rollback review are included.

### 33.10 Honesty Audit — PASS

The document does not claim that local tests prove enterprise scale, full compliance, perfect PII detection, or multi-region resilience.

---

## 34. Final Approval

**Status:** Approved as the testing and quality baseline for the ProxiAI beginner solo-developer MVP.

The minimum release rule is simple:

> ProxiAI must not be released while any known defect can expose another organisation’s data, send blocked sensitive content to a provider, persist restricted plaintext, bypass authentication or budget controls, or create duplicate paid provider calls.
