# ProxiAI Full Repository Audit and Fix Plan

## 1. Audit identity and scope

**Audited archive:** `ProxyAi-main (2).zip`  
**Archive SHA-256:** `4aea24b737cfcd0345864ab5f74b0fc37b0051bb8785eb8871a00ec8cea54d83`  
**Extracted repository:** `/mnt/data/proxiai_audit_workspace/ProxyAi-main`  
**Files inspected:** 379 source/configuration/documentation assets, excluding the temporary audit Git metadata and generated dependency/build output.  
**Approximate reviewed text volume:** 85,840 lines across TypeScript, TSX, JavaScript, MJS, Markdown, JSON, YAML, PowerShell, and shell files.

The archive did not contain Git history. A temporary local Git repository was created only to run repository checks against an immutable baseline. No application source was modified during the audit.

## 2. Evidence vocabulary

- **Confirmed:** demonstrated directly by current source/configuration or an independently executed check.
- **High probability:** source/configuration strongly indicates the outcome, but the final behavior depends on runtime infrastructure or timing.
- **Repository-recorded evidence:** current project documents report that a check passed, but this audit environment could not independently rerun it.
- **Runtime verification required:** external services, credentials, Docker, AWS, or a real browser/runtime are required.
- **Accepted limitation:** explicitly designed trade-off that is safe only when documented and operationally understood.

## 3. Executive verdict

### Portfolio / recruiter demo readiness

**CONDITIONAL GO.**

The current repository is a substantial, coherent, security-oriented full-stack system. It contains tenant-aware auth, policy-controlled AI streaming, encrypted retained messages, audited admin operations, idempotent billing/analytics workers, metrics, CI/CD, containers, AWS infrastructure, and extensive tests.

It is suitable for a recruiter-facing demo when all of the following are true:

1. the exact current commit passes CI and live smoke;
2. ECS deep-start reconstructs the runtime successfully;
3. the live image digests are recorded;
4. the worker heartbeat/queue processing is verified;
5. demo access uses a restricted account rather than a public administrator credential;
6. README, landing page, and Phase 12 documents are aligned with the actual ECS deployment;
7. the deployment script issues in this report are fixed.

### Highly available enterprise production readiness

**NO-GO without explicit accepted limitations.**

The codebase is much stronger than a prototype, but the current deployment is deliberately cost-capped to one frontend, one API, and one worker task. There is no spare capacity or autoscaling. The worker has no ECS-level health check, release scripts still have two correctness gaps, long SSE shutdown has no forced-drain deadline, and a public demo credential design is not yet safe.

This does not invalidate the project. It means the honest claim should be:

> Production-oriented, release-tested enterprise AI gateway deployed as a low-traffic portfolio/demo environment, with documented high-availability limitations.

Do not claim multi-AZ application availability, internet-scale readiness, external penetration-test certification, or seamless failover.

## 4. Independent verification performed in this audit

| Check | Result | Evidence / limitation |
|---|---|---|
| Archive extraction and inventory | PASS | 379 files inventoried |
| TypeScript/JavaScript parsing | PASS | 288 JS/TS/TSX/MJS files, zero syntax diagnostics |
| Local import resolution | PASS | 569 relative/aliased local imports, zero missing targets |
| Production reachability graph | PASS | Backend: 139/141 TS modules reachable; only fake provider fixture and ambient declaration excluded. Frontend: all production files reachable |
| JSON parsing | PASS with one expected exception | 14 strict JSON files pass; `backend/tsconfig.json` is JSONC, not malformed application data |
| YAML/CloudFormation/workflow parsing | PASS | 10 YAML files parsed with CloudFormation tags accepted |
| Shell syntax | PASS | All deployment shell scripts passed `bash -n` |
| Release harness self-test | PASS | `node --test scripts/release-harness.test.mjs`: 4/4 |
| Repository security scan | PASS | `node scripts/security-scan.mjs` |
| Release step inventory | PASS | `node scripts/verify-release.mjs --list`: 20 bounded steps |
| CodeRabbit review | NOT RUN | CLI absent; official installer could not resolve `cli.coderabbit.ai` in this environment. No CodeRabbit findings are claimed |
| PowerShell execution | BLOCKED | `pwsh` is not installed in the audit environment |
| Docker/Compose execution | BLOCKED | Docker executable unavailable |
| AWS validation/live checks | BLOCKED | AWS CLI/credentials unavailable in this environment |
| Clean npm install | BLOCKED | npm registry DNS/cache unavailable; `npm ci --offline` returned `ENOTCACHED` |
| Full lint/typecheck/test/build/audit | NOT INDEPENDENTLY RERUN | Current repository records Phase 11 evidence, listed below, but this environment could not fetch dependencies |

### Repository-recorded release evidence

The current project documents report:

- backend tests: 264/264;
- frontend tests: 27/27;
- backend line coverage: 78.12%;
- frontend line coverage: 77.20%;
- critical pure-module branch coverage above 90%;
- isolated Mongo/Redis/BullMQ integration gates passed;
- Docker/index/release verification passed;
- no dependency vulnerabilities at the recorded release point.

Those are valuable release records, but they must be re-run in CI for the exact commit that is deployed after any fixes from this audit.

## 5. Repository inventory

### 5.1 Main runtime surfaces

- **Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, React Markdown.
- **API:** Express 5, TypeScript, Zod, Pino, Helmet, CORS.
- **Database:** MongoDB/Mongoose.
- **Control plane:** Redis/ioredis.
- **Background jobs:** BullMQ with a separate worker entrypoint.
- **Auth:** Argon2id, HS256 access JWT, rotating opaque refresh token cookie.
- **Provider:** Groq adapter plus test fake provider.
- **Security storage:** AES-256-GCM, versioned keyring, tenant/resource AAD.
- **Operations:** Prometheus metrics, Grafana JSON, alert rules, runbooks.
- **Deployment:** Docker, Compose, ECS/Fargate, ECR, ALB, Route53/ACM, Secrets Manager, GitHub Actions, snapshot-driven power controls.

### 5.2 Test inventory

- Backend unit test files: 57.
- Backend unit test declarations: approximately 264.
- Backend integration test files: 16.
- Backend integration test declarations: approximately 65.
- Frontend test files: 12.
- Frontend test declarations: approximately 27.

### 5.3 Largest maintenance hotspots

These are not automatically bad, but they deserve ownership and refactoring discipline:

- `backend/src/features/auth/auth.service.ts`: about 948 lines.
- `backend/src/features/chat/chat.service.ts`: about 708 lines.
- `backend/src/shared/async/bullmq.ts`: about 503 lines.
- `frontend/src/features/admin/admin-dashboard.tsx`: about 441 lines.
- `deploy/aws/demo-power-common.ps1`: about 741 lines.

Recommendation: refactor only when making related changes. Do not perform a cosmetic split solely to reduce line counts before deployment.

## 6. Architecture reconstruction

```text
Browser
  |
  | HTTPS same-origin
  v
Route53 + ACM
  v
AWS ALB :443
  |-- /api/*     -> API target group -> ECS API task :8080
  |-- /health/*  -> API target group -> ECS API task :8080
  `-- default    -> frontend target group -> ECS frontend task :3000

API request
  -> request ID / bounded HTTP metrics
  -> Helmet / exact-origin credentialed CORS / JSON 1 MB limit
  -> JWT authentication and current User + Organisation reload
  -> permission middleware
  -> tenant/owner-scoped service/repository
  -> idempotency -> rate limit -> budget
  -> PII detection -> risk -> policy
  -> provider selection/retry/circuit/fallback
  -> SSE stream
  -> RequestLog + retention-aware encrypted message persistence
  -> BullMQ billing/analytics jobs

Worker task
  -> billing rollup
  -> analytics projection
  -> anomaly detection
  -> provider health
  -> enqueue recovery
  -> heartbeat + private worker metrics
```

### Path rewrite decision

**No `/api` rewrite or stripping is required.**

- Frontend API base is `/api/v1`.
- Express mounts `/api/v1/*`.
- ALB, Nginx, and Caddy should forward paths unchanged.
- Stripping `/api` would turn `/api/v1/...` into `/v1/...` and break routing.

## 7. Frontend-to-backend contract matrix

| Frontend operation | Backend route | Result |
|---|---|---|
| Login | `POST /api/v1/auth/login` | MATCH |
| Refresh | `POST /api/v1/auth/refresh` | MATCH |
| Logout | `POST /api/v1/auth/logout` | MATCH |
| Current auth context | `GET /api/v1/auth/me` | MATCH |
| Create/list conversations | `POST/GET /api/v1/conversations` | MATCH |
| Read/rename conversation | `GET/PATCH /api/v1/conversations/:conversationId` | MATCH |
| List retained messages | `GET /api/v1/conversations/:conversationId/messages` | MATCH |
| Chat stream | `POST /api/v1/chat/stream` | MATCH; SSE contract exists |
| Admin summary/logs/billing/alerts/users/teams | `/api/v1/admin/*` | MATCH |
| Admin role/team/status/session/policy/retention/alert mutations | `/api/v1/admin/*` | MATCH |
| Audit export | `GET /api/v1/admin/audit/export` | MATCH |
| Liveness/readiness | `/health/live`, `/health/ready` | MATCH |
| Prometheus API registry | `/metrics` | Implemented, intentionally not routed publicly by current topology |

The frontend contains a dedicated contract test that validates canonical paths and request shapes, including URL encoding for conversation IDs and credentialed audit export.

## 8. Important improvements already present in the current code

The earlier autopsy report in the repository is stale in several important areas. Current source already contains the following fixes:

1. **Unknown usage no longer automatically locks the organisation with a 503.** The budget service uses a conservative reservation derived from the provider/model maximum token capability.
2. **Groq terminal errors are checked.** `x_groq.error` throws a typed provider failure instead of producing a false success.
3. **Messages are persisted.** Successful completion persists a user/assistant pair according to retention mode and advances `messageCount` and `lastMessageAt` transactionally.
4. **Idempotency completion is gated by authoritative RequestLog persistence.** `markCompleted()` occurs only when usage persistence succeeded.
5. **Refresh concurrency is handled explicitly.** A dedicated concurrency error is not treated like a terminal invalid-token error.
6. **Transient refresh failures preserve the current authenticated frontend state.** Only a true 401 becomes anonymous.
7. **Proxy handling is configured.** Express trusts loopback/link-local/private proxy ranges rather than blindly trusting every forwarded header.
8. **Clean SSE EOF is rejected.** The frontend throws `STREAM_INTERRUPTED` when no terminal event arrives.
9. **Deployment smoke rollback exists.** Previous task definitions are uploaded even on failure and the workflow invokes rollback after smoke/accounting failure.
10. **Encrypted retained history and append-only audit are implemented.** Current Phase 9 code is materially beyond the old audit snapshot.

Do not re-implement these fixes.

## 9. Findings and ordered fix plan

### H1 - Deployment documentation names Lightsail as mandatory although ECS is the approved canonical runtime

**Severity:** High operational risk  
**Confidence:** Confirmed

**Evidence:**

- `docs/15_PHASE.md` current progress names `P12-09A - Cost-Optimized Lightsail Live-Demo Migration`.
- The Phase 12 completion matrix requires Lightsail canary/public cutover.
- The user-approved operational direction is ECS/Fargate with ALB/NAT and snapshot-driven deep stop/start.
- The AWS account cannot launch the required Lightsail IPv4 plan.

**Impact:** Phase 12 can never honestly close under the current contract, documentation sends operators down an unsupported path, and CI/manual actions become ambiguous.

**Fix:**

1. Make ECS/Fargate + ALB/NAT the canonical production/demo deployment.
2. Define deep-stop/deep-start as the approved cost-control mode.
3. Reclassify Lightsail as `OPTIONAL / ACCOUNT-BLOCKED / NOT REQUIRED FOR PHASE 12`.
4. Update `docs/15_PHASE.md`, `PROJECT_MEMORY.md`, deployment architecture, CI/CD docs, README, and manual actions.
5. Make Phase 12 completion depend on ECS deep-start, immutable deployment, smoke, rollback, and observation - not Lightsail.

**Commit:** `docs(deploy): make ECS power-controlled runtime canonical`

---

### H2 - Deployment updates the frontend before the API and worker

**Severity:** High release risk  
**Confidence:** Confirmed

**Evidence:** `deploy/scripts/deploy-services.sh:39-47` updates frontend, then API, then worker.

**Impact:** A new frontend can call an older API during rollout. A compatible-release discipline may hide the defect today, but the script provides no enforcement.

**Fix:** Deploy in this order:

1. API with backward-compatible contract;
2. worker;
3. verify API/worker health;
4. frontend last;
5. then full smoke.

For a breaking API change, use expand/migrate/contract or blue/green traffic promotion.

**Commit:** `fix(deploy): roll out API and worker before frontend`

---

### H3 - Task-definition image replacement can silently do nothing

**Severity:** High release correctness risk  
**Confidence:** Confirmed

**Evidence:** `deploy/scripts/prepare-task-definition.sh:18-29` uses `select(.name == $container)` but never asserts exactly one match or verifies the final image.

**Impact:** A typo in the container name can produce a valid task JSON that still references the old image. The pipeline may report success without deploying the intended digest.

**Fix:**

- assert exactly one matching container before mutation;
- assert the resulting image equals the requested `repository@sha256:digest`;
- fail non-zero on zero or multiple matches;
- add a shell test for wrong container names.

**Commit:** `fix(deploy): fail task preparation on container mismatch`

---

### H4 - Worker has no ECS-level health check

**Severity:** High operational risk  
**Confidence:** Confirmed

**Evidence:** `deploy/aws/services.yml` gives health checks to frontend and API, but not worker. The worker exposes a heartbeat/metrics endpoint internally, yet ECS only observes process liveness.

**Impact:** A worker can remain running while queue consumption or heartbeat progress is stalled. Alerts may detect it, but ECS will not restart the task automatically.

**Fix options:**

- add a container health command that checks a recent worker heartbeat and Redis/BullMQ connectivity;
- keep thresholds generous to avoid restarting healthy long jobs;
- preserve the existing Prometheus alert as a second line of defense.

**Commit:** `fix(operations): add heartbeat-based worker task health`

---

### H5 - Publishing a default ORG_ADMIN credential would be unsafe

**Severity:** High security/cost risk  
**Confidence:** Confirmed design risk

The seed script creates an administrator, a team lead, and employees using the same supplied password. It also resets those passwords on rerun. Publishing the admin credentials on the landing page would allow any visitor to change roles, retention, policy, budget, alert state, and sessions.

**Recommended safe design:**

- public landing page shows a restricted `EMPLOYEE` demo credential only;
- the account lives in a dedicated demo tenant;
- use a small monthly budget and tight per-user/org RPM;
- use `METADATA_ONLY` unless encrypted history is necessary for the demo;
- schedule conversation/session cleanup;
- privately provide time-limited ORG_ADMIN credentials to a recruiter when needed;
- if a public admin experience is required, add server-enforced demo mode that blocks mutations and provider-cost amplification.

Do not put the password in source-controlled JSX, README, logs, GitHub Actions variables, or browser-visible build configuration.

**Commit sequence:**

- `feat(demo): add restricted public demo account policy`
- `chore(demo): add scheduled demo tenant reset`
- `docs(demo): document recruiter access workflow`

---

### M1 - Conservative unknown-usage reservation can exhaust budget after repeated interruptions

**Severity:** Medium availability/cost trade-off  
**Confidence:** Confirmed accepted limitation

The budget service reserves `maxInputTokens + maxOutputTokens` for every unresolved request. With the current Groq capability, that is 24,096 tokens per unresolved request.

This is much safer than treating unknown usage as zero and avoids the old global-accounting 503. However, repeated network interruptions can consume the demo tenant's budget rapidly even when actual usage was lower.

**Fix/mitigation:**

- expose unresolved reservation count/tokens clearly in admin UI and alerts;
- provide an operator runbook;
- use a dedicated small demo budget but monitor false exhaustion;
- when a provider eventually exposes authoritative reconciliation, add an append-only reconciliation record;
- never silently set unknown usage to zero.

---

### M2 - `/metrics` is unauthenticated at the application layer

**Severity:** Medium defense-in-depth risk  
**Confidence:** Confirmed; current network topology mitigates it

`app.use(metricsRouter)` mounts `GET /metrics` before auth. Current ALB/Nginx/Caddy routing does not expose `/metrics`, and worker metrics are private, which is the primary control.

**Risk:** If task networking or listener rules are changed later, operational details become public.

**Fix:**

- keep SG/listener rules as the primary private boundary;
- add a production configuration guard or internal token/mTLS if `/metrics` will ever be routed;
- add deployment tests asserting public `https://proxiai.me/metrics` does not reach API metrics.

---

### M3 - API shutdown has no bounded forced-drain timeout

**Severity:** Medium deployment reliability risk  
**Confidence:** Confirmed

`server.close()` waits for active connections with no explicit deadline. A long or stuck SSE connection can delay task termination beyond the ECS stop timeout.

**Fix:**

- stop accepting new connections;
- abort active chat streams after an approved grace period;
- add a bounded shutdown timer;
- call `closeAllConnections()` or track sockets only after graceful timeout;
- test SIGTERM during an active SSE stream.

**Commit:** `fix(runtime): bound graceful shutdown for long streams`

---

### M4 - Production desired count is intentionally capped at one

**Severity:** Medium production availability limitation  
**Confidence:** Confirmed accepted cost decision

The ECS template constrains frontend/API/worker desired count to maximum 1. This is appropriate for a low-traffic portfolio demo and keeps cost controlled, but it is not highly available production.

**Required wording:** "single-task low-traffic deployment" rather than "highly available production."

Future hardening:

- allow two frontend/API tasks;
- verify horizontal-scaling assumptions;
- add autoscaling only after load testing;
- decide worker concurrency separately.

---

### M5 - Demo seed resets a shared password across all seeded roles

**Severity:** Medium demo-security risk  
**Confidence:** Confirmed

`seed-demo-organisation.ts` hashes one `DEMO_ADMIN_PASSWORD` and applies it to the admin, lead, and all employees, including existing users.

**Fix:**

- accept separate protected role passwords or create only one public employee login;
- do not reset existing passwords unless `DEMO_SEED_RESET_PASSWORDS=true`;
- output no password values;
- add a reset/cleanup script distinct from initial seed;
- add expiry/disabled-at support for recruiter credentials.

---

### M6 - Root README is stale and badly formatted for GitHub

**Severity:** Medium recruiter/documentation risk  
**Confidence:** Confirmed

Problems:

- The warning says major issues remain that current source already fixed.
- "Table of Contents", headings, lists, and comparison tables are largely plain text rather than proper Markdown.
- It claims a fallback event is not emitted and other stale limitations.
- It describes the repository as pre-production without distinguishing demo readiness from enterprise HA.

**Fix:** rewrite README from current code and Phase 11 evidence, using actual Markdown headings, anchor links, tables, setup commands, architecture diagram, live URL, demo access rules, honest limitations, and current ECS operations.

**Commit:** `docs(readme): rebuild recruiter-facing project documentation`

---

### M7 - Documentation links and empty files reduce repository quality

**Severity:** Medium/low hygiene issue  
**Confidence:** Confirmed

- `docs/09_README.md` has 14 broken local links because it links to `docs/...` from inside the `docs` folder.
- `docs/app/api-reference/adapters/testing-adapters.md` is empty.
- `docs/app/guides/streaming.md` is empty.
- `.obsidian/` editor state is tracked.
- `design-qa.md` contains local machine paths and stale QA context.

**Fix:**

- fix links to `01_PRD.md`, etc.;
- either write the empty docs and link them, or remove them;
- remove `.obsidian/` from Git and add it to a root `.gitignore`;
- archive or refresh `design-qa.md` with portable evidence.

**Commit:** `chore(repo): remove editor artifacts and repair documentation links`

---

### M8 - Environment ignore coverage is incomplete

**Severity:** Medium secret-hygiene issue  
**Confidence:** Confirmed

There is no root `.gitignore`. Backend ignores only `.env`; frontend ignores only `.env.local`.

The repository security scan catches tracked env files, but prevention should be stronger.

**Fix:** add a root ignore policy such as:

```gitignore
.env
.env.*
!.env.example
**/.env
**/.env.*
!**/.env.example
.obsidian/
coverage/
*.log
```

Review existing tracked files before applying the pattern.

---

### L1 - One likely unused dependency and stale package metadata

**Severity:** Low

- `pino-http` is declared but no static source import was found.
- Backend `package.json` uses stale `"main": "index.js"` although production runs `dist/server.js`.
- Fake provider adapter is test-only but stored under production source and included in the compiled output.

**Fix:**

- verify with a clean install/test, then remove `pino-http` if unused;
- set `main` to `dist/server.js` or omit it for a private service package;
- move fake provider to test fixtures or clearly document why it remains a source adapter.

---

### L2 - Landing navigation and copy overstate/duplicate sections

**Severity:** Low/medium recruiter UX issue

- `Security` and `Compliance` both point to `#security`.
- There is no dedicated compliance section.
- "Trusted by security-conscious teams" implies actual users/customers without evidence.
- The page shows a polished product story but not the real architecture, test proof, encrypted storage, async processing, admin capability, or current limitations.

**Fix:** use truthful headings such as "Security design" rather than "Compliance" unless a real compliance section exists. Replace the trust phrase with "Designed for security-conscious teams" unless customer evidence exists.

## 10. Security review summary

### Strong controls confirmed in current source

- trusted tenant context is reloaded from Mongo on authenticated requests;
- explicit permission middleware;
- tenant/owner filters on conversation/admin data;
- Argon2id password hashing;
- rotating opaque refresh tokens stored hashed;
- transient refresh errors preserve session;
- AES-256-GCM with key version and resource-bound AAD;
- no plaintext fallback;
- RequestLog and AuditLog append-only semantics;
- audited admin mutations use transaction boundaries;
- CSV injection defenses;
- exact-origin credentialed CORS;
- Helmet and body limit;
- redacted structured logging;
- metrics label/cardinality safety;
- BLOCK zero-provider and MASK sanitized-egress tests recorded;
- immutable image digests and image scans in release workflow.

### Security items requiring live proof

- actual ECS SG denies direct public task access;
- `/metrics` and worker port 9464 are not public;
- current Secrets Manager contains all encryption selectors;
- current deployed images match the audited commit;
- proxy-derived client IP is correct behind the live ALB;
- deep-start recreates only the snapshotted ProxiAI resources;
- public demo account cannot mutate admin settings or cause uncontrolled provider spend.

## 11. API and component wiring verdict

### Static verdict

**PASS.** No missing local imports or obvious frontend/backend path mismatch was found. Frontend API paths, methods, and principal request shapes match the Express routers.

### Runtime verdict

**Requires CI/live rerun on the exact audited commit.** The audit environment could not install dependencies, run Next/TypeScript builds, execute Docker, or connect to external services.

## 12. Deployment and power-control verdict

### Canonical deployment recommendation

Keep the existing ECS/Fargate architecture as canonical:

```text
Route53/ACM
  -> ALB
     -> frontend ECS :3000
     -> API ECS :8080
worker ECS (no ALB)
  -> Atlas
  -> Redis
  -> Groq
```

Use the snapshot-driven scripts as the approved cost-control workflow:

```powershell
.\deploy\aws\demo-power.ps1 snapshot
.\deploy\aws\demo-power.ps1 deep-stop -WhatIf
.\deploy\aws\demo-power.ps1 deep-stop -Apply
.\deploy\aws\demo-power.ps1 deep-start -Apply
```

### Static safety strengths in the power scripts

- destructive deep stop requires `-Apply`;
- preview supports `-WhatIf`;
- deep stop creates and validates a recovery snapshot before mutation;
- current resource identity is compared to the snapshot;
- ambiguous routes/listeners/resources cause refusal;
- ECS services are stopped before ALB/NAT deletion;
- target groups, ACM, hosted zone, task definitions, ECR, IAM, Secrets, VPC/subnets/SGs are preserved;
- NAT EIP is preserved, keeping the Atlas allowlist stable;
- deep start recreates NAT route, ALB, HTTP redirect, HTTPS certificate, path rules, Route53 aliases, and ECS services.

### Runtime gap

PowerShell/AWS execution could not be independently rerun here. Phase 12 should close only after a real sequence is recorded:

1. deep-start from the current snapshot;
2. service/target health;
3. authenticated smoke;
4. worker/accounting smoke;
5. 15-30 minute observation;
6. rollback proof;
7. exact image digest/SHA evidence.

## 13. Landing page recommendation

Do not turn the landing page into a literal 40 KB README. Make it an informative, scannable technical product story.

Recommended sections:

1. **Hero:** concrete problem, live workspace CTA, GitHub link.
2. **What happens to a request:** visual pipeline from auth through policy/provider/persistence/jobs.
3. **Security guarantees:** tenant isolation, PII mask/block, encrypted storage, append-only audit.
4. **Resilience:** retry, circuit breaker, health, idempotency, recovery.
5. **Product surfaces:** chat, policy inspector, admin dashboard, audit export.
6. **Async architecture:** RequestLog -> billing -> analytics -> anomaly.
7. **Deployment:** Next.js, API, worker, Atlas, Redis, ECS/ALB.
8. **Verified engineering evidence:** tests/coverage/security scans, clearly tied to a release commit.
9. **Honest limitations:** single-task demo deployment, no attachments, prompt cache deferred, public demo restrictions.
10. **Try the demo:** safe employee account or private recruiter access.

Avoid:

- unsupported certification badges;
- fake customer logos;
- "trusted by" claims without customers;
- fake cost/latency/cache/fallback metrics;
- public administrator credentials;
- stale test counts hard-coded without a release SHA.

## 14. Recommended recruiter demo access

### Recommended option: restricted public employee account

Create a dedicated tenant, for example `novastack-demo`, with:

- one `EMPLOYEE` public login;
- permissions only `chat:send` and `chat:view_own`;
- no admin dashboard access;
- low per-user and per-org RPM;
- a small monthly token budget;
- no ability to change policy, roles, retention, alerts, audit, or sessions;
- scheduled refresh-token revocation and conversation reset;
- no persisted real PII;
- visible notice that data is periodically reset;
- CAPTCHA or a server-side demo access token if public traffic grows.

### Recruiter admin demo

Provide ORG_ADMIN credentials privately and time-limit them. Rotate/revoke them after the review.

### Alternative: read-only guided demo

For fully public access with zero provider-spend risk, add a read-only guided mode backed by sanitized static fixtures. This is safer than a public admin account and still demonstrates the architecture.

## 15. Ordered fix backlog

### Release blockers before claiming production-ready demo

1. Align Phase 12 docs and runtime on ECS deep-stop/deep-start; remove Lightsail as mandatory.
2. Fix task-definition container-match validation.
3. Change rollout order to API/worker before frontend.
4. Add worker task health based on heartbeat/connectivity.
5. Add bounded API shutdown for SSE.
6. Rebuild README from current source.
7. Design restricted demo access; do not publish admin credentials.
8. Run exact-commit CI, Docker build, integration, deep-start, smoke, observation, and rollback.

### Next priority

9. Add root `.gitignore` and remove editor/empty/stale files.
10. Repair `docs/09_README.md` links.
11. Remove verified unused dependency and stale package metadata.
12. Improve landing content from the dedicated specification.
13. Document unresolved-usage reservation behavior and alerting.
14. Add defense-in-depth protection for metrics endpoints.

### Later hardening

15. Increase API/frontend desired count for real high availability.
16. Add autoscaling only after load testing.
17. Add external penetration testing.
18. Add provider-supported usage reconciliation if it becomes available.

## 16. Production readiness scorecard

| Area | Score | Summary |
|---|---:|---|
| Architecture | 8.5/10 | Clear modular boundaries and separate API/worker runtime |
| Frontend | 7.8/10 | Strong product UI and tests; landing/docs need current technical narrative |
| Backend | 8.2/10 | Security-oriented and feature-complete; a few deployment/runtime hardening gaps |
| API contracts | 8.7/10 | Static frontend/backend paths and schemas are coherent |
| Authentication | 8.2/10 | Good primitives and concurrency/transient fixes; live proxy/session smoke required |
| Data/security | 8.6/10 | AES-GCM, audit, tenant scope, append-only evidence; key/runtime proof required |
| Async reliability | 8.3/10 | Idempotent workers, recovery, heartbeat, analytics; ECS worker health gap |
| Testing | 8.6/10 repository-recorded | Strong Phase 11 evidence, but not independently rerun here |
| Documentation | 5.5/10 | Deep coverage but major drift, broken links, stale README, empty/editor files |
| Deployment | 7.0/10 | Strong IaC/power scripts, but runtime proof and two release-script fixes remain |
| Demo safety | 5.5/10 | Seeder exists, but public access policy is not safe yet |
| Enterprise HA | 4.5/10 | One task/service, no autoscaling, worker health not tied to ECS |

## 17. Final recommendation

### Can this repository be demonstrated to recruiters?

**YES, after the short release-blocker list is completed and a restricted demo account is used.**

### Can it honestly be called production-ready?

**For a low-traffic portfolio/demo deployment: conditionally yes, with explicit limitations.**

**For high-availability enterprise production: no, not yet.**

The main engineering story is strong. The next work should focus less on adding features and more on alignment, operational proof, safe demo access, and removing stale repository noise.
