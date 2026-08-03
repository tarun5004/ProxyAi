# ProxiAI Observability Documentation

**Document ID:** OBS-001  
**Project:** ProxiAI — Enterprise AI Gateway & Audit Platform  
**Version:** 1.0  
**Status:** Approved for MVP Baseline  
**Audience:** Solo Developer, Reviewer, Operations, QA, Security Reviewer  
**Last Updated:** July 2026  

---

# 1. Purpose

This document defines the observability approach for the ProxiAI MVP.

Observability helps answer:

- What happened during a request?
- Why was a request slow?
- Which provider is failing?
- Are background jobs stuck?
- Is the organisation budget updating correctly?
- Are users being blocked by policy?
- Is the API healthy?
- Is Redis or MongoDB unavailable?
- Did a deployment cause an error spike?
- Are logs leaking sensitive data?

This document does not add any new product feature. It defines how the approved ProxiAI system should be monitored, logged, measured, and diagnosed.

---

# 2. Observability Scope

The MVP observability stack includes:

- structured application logs with Pino;
- request IDs;
- trace IDs propagated across API and workers;
- Prometheus-compatible metrics;
- one basic Grafana dashboard;
- API health endpoints;
- worker heartbeat;
- BullMQ queue visibility;
- provider health tracking;
- release and deployment correlation;
- basic alert rules.

The MVP does not require:

- full distributed OpenTelemetry tracing;
- enterprise SIEM integration;
- multi-region monitoring;
- advanced anomaly-detection infrastructure;
- long-term log analytics platform;
- full SLO automation;
- automatic incident remediation;
- customer-facing status page.

---

# 3. Observability Principles

1. Never log raw prompts or responses.
2. Never log passwords, tokens, cookies, API keys, or encryption keys.
3. Every request must have a `requestId`.
4. Every async workflow must propagate a `traceId` or correlation ID.
5. Logs, metrics, and health checks must answer different operational questions.
6. Metrics must avoid high-cardinality labels.
7. Alerts should be actionable and limited.
8. Health endpoints must not expose sensitive dependency details publicly.
9. Dashboard numbers may be eventually consistent.
10. Observability failures must not block normal chat requests unless security depends on them.
11. Production incidents must be traceable to a deployment SHA.
12. The solution must remain realistic for a beginner solo developer.

---

# 4. Observability Tool Responsibilities

| Tool | Main Question | Output |
|---|---|---|
| Pino | What exactly happened? | Structured JSON logs |
| Request ID | Which log lines belong to one HTTP request? | Request correlation |
| Trace ID | Which async jobs belong to the same business flow? | Cross-process correlation |
| Prometheus | What is the system trend? | Time-series metrics |
| Grafana | How can humans view those trends? | Dashboards |
| Bull Board | Are queues healthy? | Queue depth and failed jobs |
| Health Endpoints | Can the process receive traffic? | Liveness and readiness |
| Provider Health Store | Which providers are available? | Current state and latency |
| OpenTelemetry Roadmap | Where did time go across boundaries? | Distributed traces |

---

# 5. Logging Architecture

ProxiAI uses Pino for structured JSON logging.

Recommended logger:

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      '*.password',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
      '*.secret',
      '*.prompt',
      '*.response',
      '*.promptEnc',
      '*.responseEnc',
      '*.contentEnc',
      '*.encryptionKey'
    ],
    censor: '[REDACTED]'
  }
});
```

---

# 6. Log Levels

| Level | Use |
|---|---|
| `fatal` | Process cannot continue |
| `error` | Operation failed and needs investigation |
| `warn` | Degraded behavior or recoverable failure |
| `info` | Important normal business or operational event |
| `debug` | Detailed development diagnostics |
| `trace` | Very detailed local troubleshooting only |

Production recommendation:

```text
LOG_LEVEL=info
```

Use `debug` temporarily only when necessary.

---

# 7. Standard Log Fields

Every application log should use consistent fields.

| Field | Purpose |
|---|---|
| `timestamp` | Event time |
| `level` | Log severity |
| `service` | API or worker |
| `environment` | local, staging, production |
| `version` | Release version |
| `commitSha` | Deployment commit |
| `requestId` | HTTP request correlation |
| `traceId` | Cross-process correlation |
| `orgIdHash` | Optional privacy-safe org reference |
| `userIdHash` | Optional privacy-safe user reference |
| `route` | Normalized route |
| `method` | HTTP method |
| `event` | Stable event name |
| `provider` | Provider ID when relevant |
| `queue` | BullMQ queue name |
| `jobId` | Background job ID |
| `durationMs` | Operation duration |
| `errorCode` | Stable internal error code |
| `message` | Human-readable safe message |

Avoid raw `orgId` and `userId` in external log systems where possible.

---

# 8. Request ID Flow

Every incoming HTTP request receives a request ID.

Preferred behavior:

1. Accept a valid incoming `X-Request-Id` only from trusted internal callers.
2. Otherwise generate a UUID.
3. Attach it to `req`.
4. Return it in every success and error response.
5. Include it in all request-scoped logs.
6. Add it to queued job payload metadata.

Example middleware:

```ts
export function requestIdMiddleware(req, res, next) {
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  req.log = logger.child({
    requestId,
    service: 'api'
  });

  next();
}
```

---

# 9. Trace ID Flow

A trace ID identifies one complete business flow.

Example:

```text
User chat request
→ provider call
→ billing job
→ analytics job
→ anomaly job
→ email job
```

All these operations should share the same `traceId`.

For MVP, the trace ID can be generated manually and added to:

- request context;
- provider-call logs;
- RequestLog metadata;
- BullMQ job payload metadata;
- worker child loggers.

Full OpenTelemetry context propagation is roadmap-only.

---

# 10. Logging Events Catalog

Use stable event names.

## Authentication Events

```text
auth.login.succeeded
auth.login.failed
auth.logout_succeeded
auth.logout_operational_error
auth.refresh.succeeded
auth.refresh.failed
auth.refresh.reuse_detected
auth.user.inactive
```

## Chat Events

```text
chat.request.received
chat.request.validated
chat.stream.started
chat.stream.completed
chat.stream.interrupted
chat.request.duplicate
chat.request.failed
```

## PII and Policy Events

```text
pii.scan.completed
policy.allow
policy.mask
policy.block
policy.budget_block
```

## Routing and Provider Events

```text
routing.provider.selected
routing.provider.excluded
provider.request.started
provider.request.completed
provider.request.failed
provider.retry
provider.fallback
provider.circuit.opened
provider.circuit.half_open
provider.circuit.closed
```

## Cache and Idempotency Events

```text
cache.prompt.hit
cache.prompt.miss
cache.prompt.error
idempotency.created
idempotency.duplicate
idempotency.completed
idempotency.error
```

## Persistence Events

```text
persistence.metadata.completed
persistence.encrypted.completed
persistence.failed
audit.write.completed
audit.write.failed
```

## Queue Events

```text
queue.job.enqueued
queue.job.started
queue.job.completed
queue.job.failed
queue.job.retried
worker.heartbeat
```

## Deployment Events

```text
app.started
app.ready
app.not_ready
app.shutdown.started
app.shutdown.completed
release.deployed
```

---

# 11. Safe Logging Examples

## Good

```ts
req.log.info({
  event: 'routing.provider.selected',
  provider: selected.id,
  intent,
  durationMs,
  routingReason
}, 'Provider selected');
```

## Bad

```ts
req.log.info({
  prompt,
  apiKey,
  userEmail,
  providerResponse
}, 'Request completed');
```

## Good Error Log

```ts
req.log.error({
  event: 'provider.request.failed',
  provider,
  errorCode: normalizedError.code,
  retryable: normalizedError.retryable,
  durationMs
}, 'Provider request failed');
```

## Bad Error Log

```ts
req.log.error(error);
```

Raw provider errors may contain request bodies, keys, or headers.

---

# 12. Log Redaction Rules

The following values must always be redacted:

- passwords;
- access tokens;
- refresh tokens;
- cookies;
- authorization headers;
- API keys;
- database connection strings;
- encryption keys;
- raw prompts;
- raw responses;
- encrypted content payloads;
- reset tokens;
- provider SDK request objects;
- full payment webhook bodies when sensitive.

---

# 13. HTTP Access Logging

Each request should produce one completion log.

Example:

```json
{
  "event": "http.request.completed",
  "requestId": "uuid",
  "method": "POST",
  "route": "/api/v1/chat/stream",
  "statusCode": 200,
  "durationMs": 1420,
  "responseStarted": true
}
```

Do not log:

- full URL query strings containing user input;
- request body;
- authorization header;
- cookie;
- prompt text.

---

# 14. Streaming Logs

Streaming requests need separate lifecycle logs:

1. `chat.stream.started`
2. `chat.stream.first_token`
3. `chat.stream.completed`
4. or `chat.stream.interrupted`

Useful fields:

- `timeToFirstTokenMs`;
- `totalDurationMs`;
- `provider`;
- `fallbackUsed`;
- `tokenCount`;
- `cacheHit`;
- `errorCode`.

Do not log token text.

---

# 15. Provider Logging

Provider-call logs should capture:

- provider ID;
- model ID;
- request start;
- timeout;
- retry attempt;
- retryable classification;
- fallback;
- latency;
- input token count;
- output token count;
- estimated cost;
- circuit state.

Do not capture:

- provider key;
- raw provider request;
- raw provider response;
- provider authorization headers.

---

# 16. Background Worker Logging

Each worker creates a child logger.

Example:

```ts
const jobLog = logger.child({
  service: 'worker',
  queue: job.queueName,
  jobId: job.id,
  traceId: job.data.traceId
});
```

Worker events:

```text
queue.job.started
queue.job.completed
queue.job.failed
queue.job.retried
```

Include:

- attempt number;
- duration;
- safe error code;
- retry status;
- processed event ID.

---

# 17. Audit Log vs Application Log

These are different.

## Application Log

Used for:

- debugging;
- operations;
- performance;
- incident investigation.

May be rotated or deleted according to operational retention.

## Audit Log

Used for:

- security-relevant actions;
- policy decisions;
- admin changes;
- exports;
- authentication events.

Audit logs are append-only at the application layer.

Application logs must not be used as the only compliance audit source.

---

# 18. Metrics Architecture

Prometheus-compatible metrics are exposed through:

```text
GET /metrics
```

This endpoint should be:

- restricted from public access where possible;
- protected by network or authentication controls;
- excluded from normal public API documentation;
- free of sensitive labels.

---

# 19. Metric Naming Rules

Use Prometheus naming conventions:

- lowercase;
- snake_case;
- base unit suffix;
- counters end in `_total`;
- duration uses seconds;
- size uses bytes;
- ratio is a gauge.

Good:

```text
http_requests_total
http_request_duration_seconds
provider_requests_total
queue_jobs_failed_total
```

Bad:

```text
HTTPRequests
requestLatencyMs
user_123_cost
```

---

# 20. HTTP Metrics

## Counters

```text
http_requests_total{method,route,status_class}
http_errors_total{route,error_code}
```

## Histograms

```text
http_request_duration_seconds{method,route}
http_response_size_bytes{route}
```

## Streaming Metrics

```text
chat_streams_started_total
chat_streams_completed_total
chat_streams_interrupted_total{reason}
chat_time_to_first_token_seconds{provider}
chat_stream_duration_seconds{provider}
```

---

# 21. Provider Metrics

```text
llm_provider_requests_total{provider,model,outcome}
llm_provider_errors_total{provider,error_type}
llm_provider_retries_total{provider}
llm_provider_fallbacks_total{from_provider,to_provider}
llm_provider_latency_seconds{provider}
llm_provider_time_to_first_token_seconds{provider}
llm_provider_input_tokens_total{provider}
llm_provider_output_tokens_total{provider}
llm_provider_estimated_cost_usd_total{provider}
llm_provider_circuit_state{provider}
```

Circuit state values:

```text
0 = CLOSED
1 = HALF_OPEN
2 = OPEN
```

---

# 22. Policy and PII Metrics

```text
pii_scans_total{outcome}
pii_scan_duration_seconds
pii_detections_total{category}
policy_decisions_total{decision}
policy_blocks_total{reason}
policy_masks_total{category}
budget_blocks_total
```

Do not use raw detected values as labels.

---

# 23. Cache and Idempotency Metrics

```text
prompt_cache_requests_total{result}
prompt_cache_errors_total
prompt_cache_hit_ratio
idempotency_requests_total{result}
idempotency_errors_total
```

Suggested `result` values:

```text
hit
miss
ineligible
duplicate
created
completed
```

---

# 24. Database Metrics

Application-level metrics:

```text
mongodb_operations_total{operation,outcome}
mongodb_operation_duration_seconds{operation}
mongodb_connection_state
mongodb_write_failures_total{collection}
```

Do not add collection names dynamically beyond the known fixed list.

---

# 25. Redis Metrics

Application-level metrics:

```text
redis_operations_total{operation,outcome}
redis_operation_duration_seconds{operation}
redis_connection_state
redis_errors_total{operation}
```

Operational Redis metrics may come from managed-service monitoring or exporter tooling later.

---

# 26. Queue Metrics

```text
queue_jobs_enqueued_total{queue}
queue_jobs_started_total{queue}
queue_jobs_completed_total{queue}
queue_jobs_failed_total{queue}
queue_jobs_retried_total{queue}
queue_job_duration_seconds{queue}
queue_depth{queue,state}
worker_heartbeat_timestamp_seconds{worker}
```

Suggested queue states:

```text
waiting
active
delayed
failed
completed
```

Avoid job IDs as metric labels.

---

# 27. Billing Metrics

```text
billing_events_processed_total{outcome}
billing_duplicate_events_total
billing_rollup_update_duration_seconds
budget_remaining_percent
budget_threshold_events_total{threshold}
```

`orgId` must not be used as a public Prometheus label in the MVP.

Organisation-specific budget values belong in application data and admin APIs, not global metric labels.

---

# 28. Audit Metrics

```text
audit_events_written_total{action_group,outcome}
audit_write_failures_total
audit_exports_total{outcome}
```

Do not use actor IDs or resource IDs as labels.

---

# 29. Health Metrics

```text
application_ready
application_live
dependency_health{dependency}
provider_health{provider}
```

Suggested dependency values:

- `mongodb`
- `redis`
- `worker`
- `provider_registry`

---

# 30. High-Cardinality Label Rules

Do not use these as Prometheus labels:

- `requestId`;
- `traceId`;
- `userId`;
- `orgId`;
- email;
- conversation ID;
- message ID;
- prompt hash;
- IP address;
- error stack;
- raw URL.

These belong in logs, not metrics.

---

# 31. Grafana Dashboard Structure

The MVP should have one dashboard with multiple sections.

Recommended dashboard title:

```text
ProxiAI MVP Operations
```

Sections:

1. API Overview
2. Chat Performance
3. Provider Health
4. Policy and PII
5. Cache and Idempotency
6. Queue Health
7. Database and Redis
8. Billing Processing
9. Release Health

---

# 32. Dashboard Panel — API Overview

Recommended panels:

- requests per minute;
- success rate;
- 4xx rate;
- 5xx rate;
- p50 latency;
- p95 latency;
- readiness status;
- current deployment SHA.

---

# 33. Dashboard Panel — Chat Performance

Recommended panels:

- active chat streams;
- completed streams;
- interrupted streams;
- p50 time to first token;
- p95 time to first token;
- p95 total stream duration;
- cache hit ratio;
- fallback rate.

---

# 34. Dashboard Panel — Provider Health

Recommended panels:

- provider circuit state;
- provider request rate;
- provider error rate;
- provider p95 latency;
- provider retry count;
- fallback count;
- input/output token trend;
- estimated provider cost trend.

---

# 35. Dashboard Panel — Policy and PII

Recommended panels:

- ALLOW count;
- MASK count;
- BLOCK count;
- PII detections by category;
- PII scan p95 duration;
- budget blocks;
- mask-to-block ratio.

No sensitive content should appear.

---

# 36. Dashboard Panel — Queue Health

Recommended panels:

- waiting jobs by queue;
- active jobs;
- delayed jobs;
- failed jobs;
- retry count;
- p95 job duration;
- worker heartbeat age.

---

# 37. Dashboard Panel — Data Dependencies

Recommended panels:

- MongoDB connection state;
- MongoDB operation failure rate;
- MongoDB p95 duration;
- Redis connection state;
- Redis operation failure rate;
- Redis p95 duration.

---

# 38. Dashboard Panel — Billing

Recommended panels:

- billing jobs processed;
- billing failures;
- duplicate billing events prevented;
- budget threshold notifications;
- rollup update latency.

---

# 39. Dashboard Panel — Release Health

Recommended panels:

- current version;
- current commit SHA;
- error rate by deployment;
- request latency by deployment;
- first 30-minute deployment comparison;
- rollback events.

---

# 40. Alerting Philosophy

Alerts should be:

- actionable;
- specific;
- rate-limited;
- linked to a runbook;
- based on sustained conditions;
- separated by severity.

Avoid alerts for every isolated failure.

---

# 41. Alert Severity Levels

| Severity | Meaning |
|---|---|
| SEV-1 | Security breach or complete outage |
| SEV-2 | Major degradation affecting many users |
| SEV-3 | Partial degradation or operational risk |
| SEV-4 | Informational warning |

---

# 42. Recommended MVP Alerts

## SEV-1

- cross-tenant access test fails in production verification;
- plaintext content detected where encryption is required;
- all providers unavailable for sustained period;
- authentication unavailable for most users.

## SEV-2

- API 5xx rate above threshold for 5 minutes;
- readiness failed for all API instances;
- worker heartbeat missing;
- billing queue not processing;
- Redis unavailable and idempotency path blocked;
- MongoDB unavailable.

## SEV-3

- one provider circuit open for more than 2 minutes;
- queue depth increasing continuously;
- provider p95 latency above threshold;
- audit write failures;
- unusual stream interruption rate;
- prompt cache error spike.

## SEV-4

- budget warning threshold reached;
- staging deployment warning;
- non-critical dependency degradation.

---

# 43. Example Alert Rules

## High API Error Rate

```promql
sum(rate(http_requests_total{status_class="5xx"}[5m]))
/
sum(rate(http_requests_total[5m]))
> 0.05
```

## Worker Heartbeat Missing

```promql
time() - worker_heartbeat_timestamp_seconds{worker="main"} > 120
```

## Provider Circuit Open

```promql
llm_provider_circuit_state{provider="gemini"} == 2
```

for more than two minutes.

## Queue Failure Spike

```promql
sum(rate(queue_jobs_failed_total[5m])) > 1
```

Thresholds must be tuned after observing real baseline traffic.

---

# 44. Alert Noise Controls

Use:

- minimum duration;
- grouping;
- deduplication;
- cooldown;
- severity;
- environment filters.

Example:

- one provider failure: log only;
- five-minute sustained error rate: alert;
- repeated same alert: group into one incident.

---

# 45. Health Endpoints

## Liveness

```text
GET /health/live
```

Checks:

- process is running;
- event loop can respond.

Response:

```json
{
  "status": "alive",
  "version": "0.1.0"
}
```

Do not check MongoDB or Redis in liveness.

---

## Readiness

```text
GET /health/ready
```

Checks:

- MongoDB connected;
- Redis connected;
- at least one provider eligible;
- critical configuration loaded.

If not ready:

```text
HTTP 503
```

---

## Detailed Health

```text
GET /health/detailed
```

Checks:

- dependency states;
- provider states;
- queue worker heartbeat;
- version;
- deployment SHA.

This endpoint must be restricted.

---

# 46. Worker Heartbeat

Each worker should periodically update a heartbeat.

Possible storage:

- Redis key;
- Prometheus gauge;
- both.

Example Redis key:

```text
worker:heartbeat:main
```

Value:

```json
{
  "timestamp": "2026-07-23T10:00:00Z",
  "version": "0.4.0",
  "commitSha": "abc123"
}
```

TTL should be slightly longer than the heartbeat interval.

---

# 47. BullMQ Observability

Use Bull Board in local and staging environments.

Monitor:

- waiting jobs;
- active jobs;
- delayed jobs;
- failed jobs;
- retries;
- processing duration.

Production access must be restricted.

Bull Board is not a substitute for metrics and alerts.

---

# 48. Provider Health Tracking

Provider health combines:

- active request results;
- scheduled health checks;
- circuit-breaker state;
- rolling latency;
- recent failure count.

Store current fast state in Redis.

Persist incident history in MongoDB where required.

---

# 49. Request Timing Breakdown

For MVP, manually measure major durations:

```text
authDurationMs
validationDurationMs
piiDurationMs
policyDurationMs
cacheDurationMs
routingDurationMs
providerDurationMs
persistenceDurationMs
totalDurationMs
timeToFirstTokenMs
```

These may be logged safely and summarized in metrics.

Full span-based tracing is roadmap-only.

---

# 50. OpenTelemetry Roadmap

OpenTelemetry can later provide spans such as:

```text
HTTP request
├── auth.validate
├── pii.scan
├── policy.evaluate
├── cache.lookup
├── routing.select
├── provider.execute
│   ├── retry.1
│   └── fallback.execute
├── persistence.write
└── queue.publish
```

Do not implement full tracing before basic logs and metrics are reliable.

---

# 51. Deployment Correlation

Every service startup log must include:

- application version;
- commit SHA;
- environment;
- service name;
- startup time.

Example:

```json
{
  "event": "app.started",
  "service": "api",
  "version": "0.4.0",
  "commitSha": "abc123",
  "environment": "production"
}
```

This allows error spikes to be linked to a release.

---

# 52. Log Retention

Suggested MVP guidance:

| Environment | Suggested Retention |
|---|---|
| Local | Temporary |
| CI | 7–14 days |
| Staging | 14–30 days |
| Production | 30–90 days |

Actual retention depends on:

- cost;
- privacy policy;
- legal requirements;
- log platform capability.

Logs must never become a hidden prompt archive.

---

# 53. Metrics Retention

Suggested MVP guidance:

| Metric Type | Suggested Retention |
|---|---|
| High-resolution recent metrics | 7–15 days |
| Aggregated operational trends | 30–90 days |
| Long-term business analytics | MongoDB billing/analytics data |

Prometheus should not be treated as the long-term business database.

---

# 54. Data Privacy in Observability

Observability data may itself be sensitive.

Protect:

- IP addresses;
- user agents;
- organisation identifiers;
- user identifiers;
- provider usage;
- error details;
- billing patterns.

Recommended controls:

- restricted dashboard access;
- role-based log access;
- short retention;
- hashing identifiers;
- no raw content;
- export review;
- secure transport.

---

# 55. Error Classification

Use stable error codes.

Examples:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
PROMPT_BLOCKED
BUDGET_EXCEEDED
PROVIDER_TIMEOUT
PROVIDER_RATE_LIMITED
PROVIDER_UNAVAILABLE
CIRCUIT_OPEN
IDEMPOTENCY_UNAVAILABLE
DATABASE_UNAVAILABLE
REDIS_UNAVAILABLE
ENCRYPTION_FAILED
AUDIT_WRITE_FAILED
INTERNAL_ERROR
```

Metrics should use these stable codes rather than raw messages.

---

# 56. SLI Definitions

## API Availability

```text
successful eligible requests / total eligible requests
```

## Chat Completion Rate

```text
completed chat streams / started chat streams
```

## Provider Success Rate

```text
successful provider calls / total provider calls
```

## Policy Processing Latency

```text
time from PII result to policy decision
```

## Time to First Token

```text
time from accepted chat request to first streamed token
```

## Queue Processing Success

```text
completed jobs / started jobs
```

## Audit Write Success

```text
successful audit writes / attempted audit writes
```

---

# 57. Suggested MVP SLOs

These are initial working targets, not contractual SLAs.

| SLI | MVP Target |
|---|---:|
| API availability | 99.0% |
| Chat completion rate | 97% excluding user disconnects |
| Policy decision p95 | under 20 ms |
| PII scan p95 | under 50 ms |
| Time to first token p95 | under 4 seconds |
| Queue job success after retries | 99% |
| Audit write success | 99.9% |
| Readiness accuracy | 100% for known dependency state |

Targets must be reviewed after real traffic data exists.

---

# 58. Error Budget Guidance

For MVP:

- track failures;
- do not build a complex automated error-budget system;
- review weekly;
- pause feature work when reliability or security failures are severe.

Example:

```text
If cross-tenant or plaintext-storage failure occurs,
all feature work stops until resolved.
```

---

# 59. Operational Runbook — High API Error Rate

1. Check current deployment SHA.
2. Compare error rate before and after deployment.
3. Review top error codes.
4. Check MongoDB and Redis health.
5. Check provider health.
6. Check recent configuration changes.
7. Roll back if deployment caused the spike.
8. Record incident notes.

---

# 60. Operational Runbook — Provider Outage

1. Check provider circuit state.
2. Confirm fallback provider health.
3. Review provider timeout and 5xx metrics.
4. Confirm circuit breaker is failing fast.
5. Check fallback rate.
6. Notify users only if all providers are unavailable.
7. Avoid repeatedly resetting the circuit manually.
8. Record incident duration.

---

# 61. Operational Runbook — Queue Backlog

1. Check worker heartbeat.
2. Check Redis connection.
3. Check failed jobs.
4. Check job duration.
5. Restart worker if safe.
6. Review repeated dependency failures.
7. Replay only idempotent jobs.
8. Confirm billing is not duplicated.

---

# 62. Operational Runbook — Redis Failure

1. Confirm Redis connection state.
2. Check cache and idempotency errors.
3. Expect cache to fail open.
4. Expect idempotency-protected requests to fail closed.
5. Check BullMQ queue impact.
6. Restore Redis service.
7. Verify worker reconnection.
8. Review duplicate-call risk.

---

# 63. Operational Runbook — MongoDB Failure

1. Confirm readiness is failing.
2. Check connection errors.
3. Verify database service status.
4. Stop accepting traffic if critical writes cannot be guaranteed.
5. Check encryption and audit write failures.
6. Restore database connectivity.
7. verify indexes and recent writes.
8. Document any lost or delayed events.

---

# 64. Operational Runbook — Audit Write Failure

1. Check MongoDB connectivity.
2. Check audit collection permissions.
3. Check schema validation.
4. Avoid silently discarding security-relevant actions.
5. Consider failing sensitive admin operations closed.
6. Retry safe writes.
7. alert operator.
8. document affected time window.

---

# 65. Operational Runbook — Worker Heartbeat Missing

1. Check worker process status.
2. Check container or VM health.
3. Check Redis connection.
4. Review last worker log.
5. Restart worker.
6. monitor queue depth.
7. verify billing and anomaly jobs process.
8. confirm no duplicate billing.

---

# 66. Security Monitoring

Monitor for:

- repeated failed login attempts;
- refresh-token reuse;
- unusual permission failures;
- repeated prompt blocks;
- audit export frequency;
- unusual admin actions;
- encryption failures;
- cross-tenant test failures;
- API-key-like patterns in logs;
- large request spikes.

MVP monitoring is rule-based and basic.

---

# 67. Log Leak Testing

Automated tests should confirm logs do not contain:

- sample password;
- sample access token;
- sample refresh token;
- sample API key;
- sample prompt;
- sample response;
- connection string;
- encryption key.

A log-leak test should be part of security-critical CI where practical.

---

# 68. Observability in Local Development

Local setup should provide:

- readable pretty logs;
- Bull Board;
- `/metrics`;
- health endpoints;
- fake provider failure toggles;
- optional local Grafana.

Pretty logging is for local use only.

Production should keep structured JSON.

---

# 69. Observability in Staging

Staging should verify:

- log redaction;
- request ID propagation;
- trace ID propagation;
- metrics scraping;
- Grafana panels;
- provider fallback metrics;
- queue failure visibility;
- worker heartbeat;
- release SHA visibility;
- alert delivery.

---

# 70. Observability in Production

Production must have:

- structured logs;
- stable metrics;
- protected dashboards;
- health checks;
- worker heartbeat;
- provider health visibility;
- deployment correlation;
- critical alerting;
- incident notes.

---

# 71. Testing Strategy for Observability

## Unit Tests

- logger redaction;
- metric label validation;
- error-code mapping;
- request ID generation;
- trace ID propagation helper.

## Integration Tests

- request completion log emitted;
- provider failure metric incremented;
- queue job failure visible;
- health endpoint state changes;
- readiness fails when Redis or MongoDB is down.

## Security Tests

- prompt absent from logs;
- API key absent from logs;
- cookies redacted;
- audit export does not leak content;
- metrics contain no user or org labels.

---

# 72. Five-Week Observability Implementation Plan

## Week 1

- add Pino;
- add request IDs;
- add standard log fields;
- add redaction;
- add liveness endpoint.

## Week 2

- add provider logs;
- add retry and circuit metrics;
- add readiness endpoint;
- add basic Prometheus metrics.

## Week 3

- add PII and policy metrics;
- add queue worker logs;
- add trace ID propagation;
- add worker heartbeat.

## Week 4

- add Grafana dashboard;
- add cache and idempotency metrics;
- add billing and anomaly metrics;
- add Bull Board.

## Week 5

- add alert rules;
- add deployment SHA correlation;
- validate production log redaction;
- write operational runbooks;
- test observability during deployment.

---

# 73. Observability Acceptance Checklist

## Logging

- [ ] Pino outputs structured JSON in production.
- [ ] Every request has request ID.
- [ ] Every async job has trace ID.
- [ ] Sensitive fields are redacted.
- [ ] Raw prompts and responses are absent.
- [ ] Provider errors are normalized.
- [ ] Startup logs include version and SHA.

## Metrics

- [ ] API request counters exist.
- [ ] API duration histogram exists.
- [ ] Provider latency and errors are measured.
- [ ] Policy decisions are counted.
- [ ] Cache hit ratio is measured.
- [ ] Queue depth is visible.
- [ ] Worker heartbeat is visible.
- [ ] No high-cardinality IDs are labels.

## Dashboards

- [ ] API overview is visible.
- [ ] Provider health is visible.
- [ ] Queue health is visible.
- [ ] Policy and PII trends are visible.
- [ ] Release SHA is visible.
- [ ] Dashboard access is restricted.

## Alerts

- [ ] High error rate alert exists.
- [ ] Worker heartbeat alert exists.
- [ ] Queue failure alert exists.
- [ ] Provider circuit alert exists.
- [ ] MongoDB and Redis alerts exist.
- [ ] Every alert links to a runbook.

## Security

- [ ] Log leak tests pass.
- [ ] Metrics contain no raw IDs or content.
- [ ] Detailed health endpoint is protected.
- [ ] Bull Board is protected.
- [ ] Audit logs remain separate from app logs.

---

# 74. Known MVP Limitations

1. Full OpenTelemetry tracing is deferred.
2. One Grafana dashboard is used initially.
3. Alert thresholds are approximate until real traffic exists.
4. Log storage platform is not fixed.
5. No enterprise SIEM integration.
6. No customer-facing status page.
7. No automated SLO enforcement.
8. No multi-region observability.
9. Manual timing fields replace full spans.
10. Organisation-level business metrics remain in application APIs, not Prometheus labels.
11. Incident management remains lightweight.
12. Log retention may require later policy refinement.

---

# 75. Open Observability Decisions

1. Exact production log platform.
2. Exact Prometheus hosting option.
3. Exact Grafana hosting option.
4. Alert delivery channel.
5. Whether identifiers are hashed or omitted.
6. Exact log retention period.
7. Exact metrics retention period.
8. Whether staging uses the same dashboard stack.
9. Whether detailed health uses admin JWT or network restriction.
10. When to introduce OpenTelemetry.
11. Exact production alert thresholds.
12. Whether Bull Board is enabled in production.

---

# 76. Observability Definition of Done

Observability is complete for MVP when:

- every request has a request ID;
- async jobs preserve a trace ID;
- logs are structured;
- secrets and content are redacted;
- provider latency and errors are measured;
- policy decisions are measured;
- cache and idempotency behavior are visible;
- queue health and worker heartbeat are visible;
- liveness and readiness endpoints work;
- one Grafana dashboard is operational;
- critical alerts are configured;
- release SHA is visible;
- runbooks exist for major failures;
- log leak tests pass.

---

# 77. Observability Traceability

| Observability Control | Related Architecture Area |
|---|---|
| Request ID | API response envelope |
| Trace ID | BullMQ async flow |
| Pino redaction | Security threat model |
| Provider metrics | Routing and resilience |
| Policy metrics | PII and policy engine |
| Queue metrics | Background jobs |
| Readiness | Deployment architecture |
| Worker heartbeat | Worker deployment |
| Release SHA | CI/CD |
| Log leak tests | Testing strategy |
| Audit separation | Database and security design |
| High-cardinality rules | Metrics safety |

---

# 78. Observability Self-Audit

## 78.1 Scope Audit

**Result: PASS**

- No new product feature was added.
- The document covers only approved logging, metrics, health, dashboard, and alert behavior.
- Full distributed tracing, SIEM, and multi-region monitoring remain deferred.

## 78.2 Beginner Solo-Developer Audit

**Result: PASS**

- Pino, Prometheus, Grafana, Bull Board, and health endpoints are sufficient for MVP.
- One dashboard is recommended.
- Manual trace IDs are used before OpenTelemetry.
- Alert rules are intentionally limited.

## 78.3 Sensitive-Data Audit

**Result: PASS**

- Prompts, responses, keys, tokens, cookies, and encrypted content are excluded from logs.
- Raw sensitive values are not used as metric labels.
- Log-leak testing is included.
- Detailed health and queue dashboards are protected.

## 78.4 Reliability Audit

**Result: PASS FOR MVP**

- Provider, database, Redis, queue, and worker health are visible.
- Deployment correlation is defined.
- Major operational runbooks are included.
- Alert noise controls are documented.

## 78.5 Metrics Safety Audit

**Result: PASS**

- High-cardinality labels are prohibited.
- Organisation and user IDs are excluded from Prometheus labels.
- Stable error codes are used.
- Business-level organisation data stays in application APIs.

## 78.6 Security Monitoring Audit

**Result: PASS**

- Login failures, token reuse, policy blocks, audit exports, and encryption failures are monitored.
- Cross-tenant failures remain release-blocking.
- Audit records remain distinct from application logs.

## 78.7 CI/CD Consistency Audit

**Result: PASS**

- Deployment SHA is included in logs and dashboards.
- Production verification checks metrics and health.
- Observability behavior can be tested in staging.
- Rollback decisions can use release-correlated error data.

## 78.8 Documentation Consistency Audit

**Result: PASS**

This document aligns with:

- PRD;
- SDD;
- TDD;
- Database Design;
- OpenAPI Specification;
- Security Threat Model;
- Deployment Architecture;
- Testing Strategy;
- README;
- ADR;
- User Manual;
- Sequence Diagrams;
- CI/CD Documentation.

---

# 79. Final Approval

This observability design is:

- realistic for a beginner solo developer;
- safe for sensitive AI-gateway workloads;
- sufficient for MVP troubleshooting;
- aligned with the approved architecture;
- explicit about current limitations;
- ready to guide implementation.

> **Final Status: Approved as the Observability Documentation baseline for the ProxiAI beginner solo-developer MVP.**
