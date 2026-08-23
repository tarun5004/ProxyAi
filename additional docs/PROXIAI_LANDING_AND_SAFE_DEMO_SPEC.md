# ProxiAI Landing Page and Safe Recruiter Demo Specification

## 1. Objective

Make `proxiai.me` immediately understandable to a recruiter, engineering manager, or interviewer without turning the page into a long README dump.

The page should answer, in order:

1. What is ProxiAI?
2. What business/security problem does it solve?
3. What happens to a request?
4. What has actually been implemented?
5. What evidence supports the engineering claims?
6. How can a visitor safely try it?
7. What limitations remain?

## 2. Current landing-page assessment

### What works

- clean white/green visual system;
- clear login CTA;
- responsive section structure;
- truthful high-level policy/data-protection/provider-control positioning;
- useful visual workflow and workspace mockup;
- no fake certification badges.

### What is missing

- concrete architecture and request lifecycle;
- encrypted-storage and audit story;
- async billing/analytics/anomaly story;
- admin dashboard capability;
- deployment architecture;
- verified testing/release evidence;
- honest limitations;
- safe public demo access;
- GitHub/documentation links.

### Copy issues to correct

- `Security` and `Compliance` currently lead to the same section. Use a real separate compliance section or rename `Compliance` to a truthful label such as `Architecture` or `Controls`.
- Replace `Trusted by security-conscious teams` unless there is real customer evidence. Prefer `Designed for security-conscious teams`.
- `Enterprise ready` should not imply high availability or formal certification. Prefer `Enterprise-oriented controls` or clearly qualify the low-traffic demo deployment.

## 3. Recommended information architecture

### Section A - Hero

**Headline:**

> Govern enterprise AI before sensitive data reaches a provider.

**Supporting copy:**

> ProxiAI authenticates users, enforces tenant policy, detects and masks sensitive data, streams approved AI responses, and records encrypted/auditable operational evidence.

**Actions:**

- `Try the restricted demo`
- `View GitHub`
- `Read architecture`

**Live status:**

Display only if backed by a safe endpoint:

- API available;
- worker healthy;
- current release SHA (short form).

Do not expose internal hostnames, queue names, or sensitive dependency detail.

### Section B - The problem

Use three concise business problems:

1. employees send uncontrolled prompts directly to external AI;
2. sensitive data can leave the organisation;
3. security/operations teams lack policy, usage, and audit evidence.

### Section C - Real request lifecycle

Use a code-native diagram:

```text
Authentication
  -> trusted organisation and permission context
  -> request validation
  -> idempotency and rate limits
  -> token budget
  -> PII detection and risk scoring
  -> ALLOW / MASK / BLOCK
  -> provider retry/circuit/fallback boundary
  -> SSE response
  -> encrypted retention / metadata-only retention
  -> RequestLog and BullMQ jobs
```

Show the three policy outcomes:

- `ALLOW`: approved prompt is sent;
- `ALLOW_WITH_MASK`: only masked prompt is sent;
- `BLOCK`: no provider call occurs.

### Section D - Product surfaces

Show real screenshots or code-native mockups of:

- chat workspace;
- policy inspector;
- conversation history;
- admin dashboard;
- usage/budget view;
- anomaly alerts;
- audit export.

Do not show attachments because they are not implemented.

### Section E - Security design

Use evidence-backed statements only:

- tenant-scoped queries and permission middleware;
- Argon2id password hashing;
- rotating hashed refresh tokens;
- AES-256-GCM with key versions and resource-bound AAD;
- metadata-only mode stores no message content;
- append-only RequestLog and AuditLog;
- audited admin mutations;
- exact-origin CORS and safe logging;
- BLOCK zero-provider and MASK sanitized-egress release gates.

Do not use `SOC 2 compliant`, `ISO certified`, `GDPR certified`, or similar language.

### Section F - Reliability and async processing

Explain the implemented engineering patterns:

- provider adapter;
- bounded retries and exponential backoff;
- circuit breaker;
- provider health;
- Redis idempotency;
- BullMQ billing, analytics, anomaly, and recovery workers;
- worker heartbeat;
- Prometheus/Grafana/runbooks.

### Section G - Deployment architecture

Make ECS/Fargate the canonical diagram:

```text
Route53 + ACM
  -> ALB
     -> Next.js frontend task
     -> Express API task

Private worker task
  -> MongoDB Atlas
  -> Redis
  -> Groq
```

Add a small note:

> The low-traffic demo uses one task per service and snapshot-driven deep stop/start to control cost. This is not a claim of multi-task high availability.

Do not present Lightsail as the canonical deployment unless it is successfully deployed and explicitly approved.

### Section H - Verified engineering evidence

Render evidence from the current release manifest or a generated JSON file, not hard-coded stale numbers.

Suggested fields:

- backend tests;
- frontend tests;
- integration tests;
- backend/frontend coverage;
- dependency scan result;
- image scan result;
- current Git SHA;
- latest smoke timestamp.

If dynamic evidence is unavailable, use a clearly dated release evidence block.

### Section I - Honest limitations

List concise limitations:

- public attachments are not implemented;
- prompt cache/replay remains deferred;
- provider usage reconciliation is conservative when exact usage is unavailable;
- demo deployment is single-task and low traffic;
- external penetration testing has not been claimed;
- public demo data is reset and must not contain real PII.

### Section J - Try ProxiAI

Use one of the safe access patterns below.

## 4. Safe demo-access decision

### Recommended public access

Create a dedicated `EMPLOYEE` account in a dedicated demo tenant.

**Permissions:**

```text
chat:send
chat:view_own
```

**Explicitly absent:**

```text
team:view_logs
admin:view_logs
admin:view_billing
admin:manage_users
admin:configure_policy
admin:export_audit
```

### Required server-side demo controls

- dedicated demo organisation, never the operator/admin tenant;
- low token budget;
- low user/org RPM;
- active account but no admin permissions;
- scheduled refresh-session revocation;
- scheduled conversation/message cleanup;
- no real PII or production customer data;
- safe default policy;
- optional provider-spend quota;
- abuse monitoring;
- disabled or rotated credential after abnormal use.

### Credential presentation

The landing page may show:

- organisation slug;
- demo employee email;
- a copy button for a periodically rotated demo password.

However, do not hard-code the password in source-controlled JSX. Load it from a controlled demo-access endpoint or use a one-click exchange that issues a short-lived demo session.

### Recommended recruiter admin access

Provide a temporary ORG_ADMIN credential privately.

- time-limit it;
- use a separate account from the public demo account;
- rotate/revoke after the interview;
- review audit events afterward.

### Public admin mode alternative

If public admin demonstration is essential, implement a server-enforced demo mode:

- every mutation route returns `DEMO_READ_ONLY`;
- provider spend is capped;
- audit export is sanitized;
- credentials rotate automatically;
- no role/policy/retention/session mutation is allowed.

A disabled button in the frontend is not sufficient; enforcement must be server-side.

## 5. Demo data strategy

Do not create fake RequestLog, BillingRollup, or provider usage and label it authoritative.

Use one of these approaches:

1. generate real, low-cost requests through the normal application pipeline;
2. create a separate read-only sanitized fixture projection for presentation;
3. maintain a dedicated demo database clearly marked as non-production.

The existing `seed-demo-organisation.ts` is suitable for organisation/users/teams after these hardening changes:

- do not reset all passwords on every rerun by default;
- use separate public employee and private admin passwords;
- add explicit `DEMO_SEED_RESET_PASSWORDS=true` for resets;
- add a cleanup/reset script;
- never output password values.

## 6. Responsive/component requirements

Keep the current Next.js + Tailwind component system.

- server components for static marketing content;
- client components only for interactive demo/status elements;
- no second CSS framework;
- no giant monolithic page component;
- no horizontal overflow at 390, 768, 1024, 1280, and 1440 widths;
- accessible nav, focus states, and motion reduction;
- technical diagrams must collapse into vertical flows on mobile;
- tables/evidence can scroll intentionally;
- code samples must use safe horizontal overflow.

## 7. Suggested component structure

```text
features/marketing/
  components/
    landing-header.tsx
    technical-hero.tsx
    problem-section.tsx
    request-lifecycle.tsx
    product-surfaces.tsx
    security-evidence.tsx
    resilience-architecture.tsx
    deployment-diagram.tsx
    release-evidence.tsx
    limitations-section.tsx
    demo-access-card.tsx
    landing-footer.tsx
```

## 8. Acceptance checks

- every visible claim maps to a current code feature or release artifact;
- no fake certification/customer/scale claim;
- no public admin credential;
- request lifecycle matches actual middleware/service order;
- deployment diagram matches ECS deep-stop/start decision;
- test evidence includes a release SHA/date;
- deferred features are labelled honestly;
- login CTA and demo flow work;
- mobile/desktop visual review passes;
- current chat/admin functionality is unchanged;
- frontend lint/typecheck/test/build passes.

## 9. Recommended commits

```text
docs(marketing): define technical landing and safe demo contracts
feat(marketing): add recruiter-facing product architecture sections
feat(demo): add restricted public demo access
chore(demo): add scheduled demo reset controls
test(marketing): verify landing claims navigation and responsive demo flow
```
