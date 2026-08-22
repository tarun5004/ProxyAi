# ProxiAI Zero-Cost Observability Operations

## Current operating mode

The repository contains bounded Prometheus instrumentation, private API and
worker metrics endpoints, one validated Grafana dashboard definition, eight
validated alert rules, and dedicated incident runbooks. The cost-controlled
portfolio demo does not run a continuous Prometheus scraper, hosted Grafana, or
automatic alert-delivery service.

This is an explicit operational waiver, not evidence of live monitoring. It is
valid only while the demo is normally deep-stopped and started on demand.

## Approved demo-window checks

After an approved deep-start and before demo traffic:

1. Run the canonical deployment smoke from a controlled runner:
   `APP_ORIGIN=https://proxiai.me deploy/scripts/smoke.sh`.
2. Confirm API liveness/readiness and frontend health through the public routes.
3. Confirm `/metrics` is not publicly routed.
4. Inspect API and worker metrics only through approved private runtime access;
   never add an ALB route or public security-group rule for metrics.
5. Confirm ECS API, frontend, and worker tasks are healthy and the worker
   heartbeat is current.
6. Review seven-day CloudWatch JSON logs for safe error categories relating to
   MongoDB, Redis, provider health/circuit state, queue failures, billing,
   analytics, recovery, and audit writes.
7. Use the matching `docs/runbooks/` procedure for any unhealthy signal. A
   failed required check blocks the demo or release promotion.

During a demo window, the operator repeats health, worker-heartbeat, queue, and
provider checks before an interview or after any release. After the window, the
approved deep-stop procedure may restore the expected zero-runtime state.

## Static verification

Run from the repository root:

```text
npm --prefix backend run build
NODE_ENV=test \
  MONGO_URI=mongodb://127.0.0.1:27017/proxiai_observability_test \
  REDIS_URL=redis://127.0.0.1:6379/14 \
  FRONTEND_ORIGIN=http://localhost:3000 \
  node --test --test-timeout=30000 \
    backend/tests/metrics-foundation.test.mjs \
    backend/tests/observability-idempotency.test.mjs \
    backend/tests/observability-policy-pii.test.mjs \
    backend/tests/observability-security.test.mjs \
    backend/tests/provider-observability.test.mjs \
    backend/tests/worker-metrics-server.test.mjs
git diff --check
```

These checks prove instrumentation/configuration safety. They do not prove that
a hosted scraper, dashboard, or alert-delivery service is running.

## Waiver exit

Before changing to always-on production operation, approve and implement a
private metrics collector, restricted dashboard access, alert evaluation,
notification recipients, retention, and recurring cost. Re-run metric
cardinality, leak, runbook mapping, and live delivery tests before removing the
waiver.
