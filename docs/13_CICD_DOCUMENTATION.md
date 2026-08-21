# ProxiAI AWS CI/CD Documentation

**Document ID:** CICD-001
**Status:** Approved delivery contract; current remote release gates pending
**Related deployment contract:** `docs/07_DEPLOYMENT_ARCHITECTURE.md`

## 1. Purpose

This document defines immutable Docker delivery from GitHub Actions to Amazon
ECR and ECS/Fargate. The actual repository filename is
`docs/13_CICD_DOCUMENTATION.md`; no duplicate CI/CD document is used.

The 2026-08-22 manual local release deployed immutable current-SHA frontend and
backend images to ECS and proved API/worker/frontend stability, public health,
rollback, and 15-minute observation. Remote GitHub Actions remains unavailable
because of an external billing lock, and protected authenticated smoke inputs
were unavailable to the local session. Those two gates remain before Phase 12
can close; no remote-CI success is implied by the manual release.

## 2. Release Principles

1. Pull requests validate lint, types, tests, builds, and security controls.
2. CI uses fake/mocked providers and never spends production provider quota.
3. Main builds frontend and backend images once.
4. Images use commit-SHA tags and recorded digests.
5. Staging and production use the same image digests.
6. Production requires a protected GitHub Environment approval.
7. AWS authentication uses GitHub OIDC and a least-privilege IAM role.
8. Runtime secrets stay in AWS Secrets Manager.
9. Critical security, tenant-isolation, policy, container, or worker failures
   block release.
10. Rollback selects previous task definitions/digests; it never rebuilds.

## 3. Repository Workflows

The approved workflow layout is:

```text
.github/workflows/
├── ci.yml
├── deploy.yml
└── rollback.yml
```

`ci.yml` runs for pull requests and pushes. `deploy.yml` is triggered only by
a successful `CI` workflow run for `main`. `rollback.yml` is an explicit
environment-protected manual workflow.

## 4. Pull-Request Validation

Required checks:

- deterministic `npm ci` in backend and frontend;
- backend and frontend lint;
- backend and frontend typecheck;
- backend and frontend focused/full tests;
- backend and frontend production builds;
- dependency audit with documented high/critical handling;
- secret scanning;
- Dockerfile/config lint where available;
- no paid Groq call;
- release-blocking tenant, BLOCK, MASK, auth, and idempotency tests.

Exact commands must use the scripts implemented in each `package.json`; stale
Vite/Vitest-backend examples are not canonical.

## 5. Main-Branch Delivery

```text
Validate
→ assume AWS role through OIDC
→ login to ECR
→ build frontend and backend images
→ scan images
→ push SHA tags
→ resolve and record image digests
→ run safe MongoDB index step
→ register staging task definitions with those digests
→ deploy staging services
→ wait for service stability
→ run staging smoke tests
→ protected production approval
→ register production task definitions with the same digests
→ deploy production services
→ run production smoke tests
→ monitor health, worker heartbeat, queue outcomes, and safe logs for 15–30 minutes
→ record release metadata
```

`latest` may be omitted entirely and is never used as deployment identity.

## 6. ECR Repositories

- one frontend repository;
- one backend repository shared by API and worker.

Repository names, AWS account, and AWS region are workflow parameters. ECR tag
immutability and vulnerability scanning should be enabled by infrastructure.

## 7. ECS Deployment Units

- frontend service: frontend digest, port `3000`;
- API service: backend digest, API command, port `8080`;
- worker service: same backend digest, `npm run start:worker`, no port.

Frontend and API deploy independently, while API and worker use compatible task
definitions from the same backend digest. A failed service update must not
silently advance the other environment.

## 8. GitHub Configuration

Non-secret repository/environment variables include:

- `AWS_REGION`;
- `AWS_DEPLOY_ROLE_ARN`;
- `FRONTEND_ECR_REPOSITORY` and `BACKEND_ECR_REPOSITORY` full URIs;
- `FRONTEND_ECR_REPOSITORY_NAME` and `BACKEND_ECR_REPOSITORY_NAME`;
- per-environment `ECS_CLUSTER`, service names, and task-family names;
- per-environment `APP_ORIGIN`, `WORKER_LOG_GROUP`, and `SMOKE_ORG_SLUG`;
- `PRIVATE_SUBNET_IDS` as a comma-separated list and
  `TASK_SECURITY_GROUP_ID` for the one-off index task.

Protected GitHub Environment secrets are `SMOKE_EMAIL` and `SMOKE_PASSWORD`.
Application runtime secrets remain referenced by ECS task definitions from
Secrets Manager and are never copied into GitHub.

The Phase 9 runtime requires `MESSAGE_ENCRYPTION_KEYS_JSON` and
`MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION` to the existing environment-scoped
runtime secret before encrypted storage is enabled. CI validates only the
presence/selector contract and never reads, prints, transforms, or passes key
material as a Docker build argument. Old key versions remain available during
rotation until a separately verified re-encryption migration completes.

GitHub OIDC configuration requires an approved AWS role ARN and trust policy;
no long-lived AWS access key is stored in GitHub.

## 9. Environment Separation

Staging and production have separate:

- ECS task definitions/services;
- MongoDB databases/projects as approved;
- Redis endpoints;
- Secrets Manager secrets;
- frontend origins;
- Groq keys/spend limits;
- smoke accounts.

For the one-time interview staging validation, an approved shared-demo
exception permits reuse of the existing ALB, target groups, Atlas database,
Upstash Redis endpoint, and `proxiai/production` runtime secret. Dedicated
staging ECS services/task definitions and a dedicated smoke account are still
required. The staging frontend origin may use the existing ALB DNS over HTTP;
production remains gated on HTTPS with ACM. Scale staging services to zero and
remove staging targets before production promotion. Subsequent staging releases
must restore the normal separation listed above.

Production GitHub Environment requires manual approval and restricts deployment
to `main`.

## 10. Secret Safety

The pipeline must fail if it finds committed environment files, known secret
patterns, or credentials in image layers. It must not print:

- MongoDB/Redis URLs;
- JWT/rate-limit secrets;
- Groq keys;
- access/refresh tokens or cookies;
- prompts, responses, PII, or provider payloads.

Build arguments are never used for backend/worker secrets. Frontend images
contain no secret configuration.

## 11. Docker Validation

For each image CI verifies:

- multi-stage deterministic build;
- non-root final user;
- production command;
- expected port or no worker port;
- no `.env`, Git metadata, test database, or credentials;
- health command where applicable;
- vulnerability scan results;
- labels/metadata containing the commit SHA.

The frontend image uses same-origin relative API paths, so staging and
production use the same digest.

## 12. Database Index Step

The deployment runs the explicit idempotent index command as a one-off ECS task
before service rollout. The task uses the backend image, production MongoDB
secret, private networking, and a deployment-specific command. Failure blocks
rollout. Destructive migrations and automatic database rollback are prohibited.

## 13. Staging Smoke Gate

Minimum staging checks:

- frontend health and landing page;
- API liveness/readiness and visible commit SHA;
- login, refresh, `/auth/me`, and logout;
- conversation create/list/read;
- completed real Groq SSE ALLOW request;
- MASK sends only masked input;
- BLOCK makes zero provider calls;
- cross-tenant access denial;
- RequestLog/BillingRollup persistence;
- billing, analytics, anomaly, provider-health, and recovery worker evidence;
- worker heartbeat freshness;
- no secret/raw prompt leakage.

Use a fresh staging organisation without unresolved usage records. Do not
intentionally create unknown provider usage during the release gate.

## 14. Production Promotion

Production promotion requires:

- successful staging deployment and smoke result;
- recorded frontend/backend image digests;
- recorded current and previous task-definition revisions;
- migration/index result;
- manual GitHub Environment approval;
- known-good rollback metadata.

Production task definitions reference the already-tested digests.

## 15. Rollback

Rollback inputs are explicit environment and previous release metadata. The
script or workflow:

1. validates the requested environment;
2. identifies recorded previous task definitions/digests;
3. updates frontend, API, and worker services deliberately;
4. waits for stability;
5. reruns health and smoke checks;
6. records the rollback result.

Rollback commands must not delete databases, queues, secrets, images, or task
definitions.

## 16. Failure and Partial-Deployment Safety

- Validation/image scan failures publish nothing.
- Staging failure prevents production approval.
- Index failure prevents application rollout.
- ECS deployment failure leaves the previous stable task definition available.
- API and worker compatibility is preserved through one backend digest.
- Production smoke failure triggers an explicit rollback decision; it does not
  run destructive automation.

## 17. Release Metadata

Every deployment records:

- Git commit SHA;
- frontend image digest;
- backend image digest;
- ECS task-definition revisions;
- deployment environment and timestamp;
- migration/index result;
- smoke-test result;
- previous known-good release identifiers.

The backend receives `COMMIT_SHA` at runtime so health output identifies the
deployed revision.

## 18. Deployment Parameters Still Required

Infrastructure creation requires explicit values for account, region, domains,
certificate/hosted zone, networking, sizing, desired counts, MongoDB Atlas,
managed Redis, IAM/OIDC, approval identities, and smoke credentials. Templates
must expose these as parameters and must not invent production values.

## 19. Definition of Done

CI/CD is release-ready when PR validation, deterministic images, scans, ECR
push, staging deployment, index step, smoke tests, protected same-digest
promotion, rollback verification, public ECS smoke, deployed-SHA visibility,
and a healthy 15–30 minute observation all pass for the current release.

## 20. Implemented Release Files

- `deploy/scripts/prepare-task-definition.sh` replaces only the approved
  container image with an immutable digest.
- `deploy/scripts/run-index-task.sh` runs and verifies the create-only index
  command in private Fargate networking.
- `deploy/scripts/deploy-services.sh` records previous revisions, registers all
  three task definitions, runs indexes, deploys, and waits for ECS stability.
- `deploy/scripts/smoke.sh` checks frontend/API health, login, refresh,
  `/auth/me`, Conversation create/list/read, real ALLOW SSE, MASK, and BLOCK.
- `deploy/scripts/verify-worker-events.sh` correlates the safe request ID with
  successful billing/analytics worker events and an applied rollup outcome.
- `deploy/scripts/rollback-services.sh` deliberately restores all three
  provided task-definition revisions and waits for stability.

Static workflow and shell validation is required before merge. Actual AWS
OIDC, ECR, ECS, Secrets Manager, Atlas, Redis, smoke-account, production
approval, and rollback execution remain P12-09 environment gates.

## 21. Archived Lightsail Experiment

`.github/workflows/lightsail-deploy.yml` and `deploy/lightsail/` are retained as
an unexecuted cost experiment. They are not called by the canonical ECS release
workflow, do not satisfy a Phase 12 gate, and must not mutate production DNS or
replace ECS without a new approved architecture decision. The active release
path remains immutable ECR digests promoted through ECS staging and production.
