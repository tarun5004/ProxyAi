# ProxiAI CI/CD Documentation

**Document ID:** CICD-001  
**Project:** ProxiAI — Enterprise AI Gateway & Audit Platform  
**Version:** 1.0  
**Status:** Approved for MVP Baseline  
**Audience:** Solo Developer, Reviewer, Future Contributors, Operations  
**Last Updated:** July 2026  

---

# 1. Purpose

This document defines the Continuous Integration and Continuous Delivery process for the ProxiAI MVP.

The goal is to make every code change:

- validated automatically;
- tested consistently;
- scanned for obvious security issues;
- packaged into immutable Docker images;
- deployed safely to staging;
- promoted deliberately to production;
- traceable back to a Git commit;
- reversible when a release fails.

This document does not add any new product feature. It defines how the approved ProxiAI codebase should be built, tested, packaged, and deployed.

---

# 2. CI/CD Scope

The MVP CI/CD pipeline covers:

- backend TypeScript validation;
- frontend TypeScript validation;
- linting;
- unit tests;
- integration tests;
- selected end-to-end tests;
- cross-tenant security tests;
- dependency checks;
- Docker image build;
- container smoke test;
- image tagging;
- image publishing;
- staging deployment;
- staging smoke tests;
- production approval;
- production deployment;
- rollback procedure.

The MVP does not require:

- Kubernetes;
- Argo CD;
- GitOps controllers;
- multi-region deployment;
- canary traffic splitting;
- blue-green infrastructure;
- automatic database rollback;
- fully automated production promotion;
- complex infrastructure-as-code.

---

# 3. CI/CD Principles

1. Every pull request must be validated before merge.
2. The main branch must remain deployable.
3. Production images must be immutable.
4. The same image must move from staging to production.
5. Secrets must never be stored in the repository.
6. Database migrations must be forward-safe.
7. Cross-tenant test failure must block release.
8. A deployment must be traceable to a commit SHA.
9. Production deployment should require explicit approval.
10. Rollback must use a previously verified image.
11. CI must not call paid LLM providers during normal automated tests.
12. The pipeline should remain understandable to a beginner solo developer.

---

# 4. Repository Branching Strategy

## 4.1 Recommended Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable production branch |
| `develop` | Optional integration branch for larger changes |
| `feature/*` | New feature or improvement |
| `fix/*` | Non-urgent bug fix |
| `hotfix/*` | Urgent production fix |
| `docs/*` | Documentation-only changes |

For a solo developer, the simplest recommended strategy is:

```text
feature branch
→ pull request
→ CI validation
→ merge to main
→ staging deploy
→ manual production approval
```

`develop` is optional and should not be added unless it genuinely helps.

---

## 4.2 Branch Naming Examples

```text
feature/auth-refresh-rotation
feature/provider-fallback
fix/idempotency-race
hotfix/cross-tenant-filter
docs/update-api-spec
```

---

## 4.3 Protected Main Branch

The `main` branch should require:

- pull request before merge;
- successful CI checks;
- no unresolved review comments;
- no direct force push;
- no branch deletion;
- required status checks;
- cross-tenant test success;
- Docker build success.

For a solo project, self-review is still useful before merge.

---

# 5. Commit Conventions

Recommended commit format:

```text
type(scope): concise description
```

Examples:

```text
feat(auth): add refresh token rotation
fix(chat): prevent duplicate provider calls
test(security): add cross-tenant conversation test
docs(api): update streaming error contract
chore(ci): add docker build validation
```

Recommended types:

- `feat`
- `fix`
- `test`
- `docs`
- `refactor`
- `chore`
- `ci`
- `perf`
- `security`

---

# 6. Pull Request Requirements

Every pull request should include:

- summary of the change;
- why the change is needed;
- affected modules;
- test evidence;
- screenshots for UI changes;
- migration impact;
- security impact;
- rollback notes;
- documentation updates;
- open risks.

Suggested pull request template:

```md
## Summary

## Why

## Changes

## Testing

## Security Impact

## Database Impact

## Deployment Impact

## Rollback Plan

## Documentation Updated
```

---

# 7. CI Pipeline Overview

Recommended CI stages:

```text
Checkout
→ Install dependencies
→ Validate formatting
→ Lint
→ Type-check
→ Unit tests
→ Integration tests
→ Security-critical tests
→ Frontend build
→ Backend build
→ Docker image build
→ Container smoke test
→ Publish test artifacts
```

---

# 8. CD Pipeline Overview

Recommended CD stages:

```text
Merge to main
→ Build immutable backend image
→ Build immutable frontend artifact
→ Push image tagged with commit SHA
→ Deploy same image to staging
→ Run staging smoke tests
→ Manual approval
→ Deploy same image to production
→ Run production smoke tests
→ Monitor
```

---

# 9. Environment Model

## 9.1 Local

Used for:

- development;
- debugging;
- unit tests;
- integration tests;
- Docker Compose.

Dependencies:

- local MongoDB container;
- local Redis container;
- fake provider adapters;
- local frontend and backend.

---

## 9.2 CI

Used for:

- automated validation;
- ephemeral MongoDB and Redis services;
- fake provider adapters;
- test-only secrets;
- build verification.

CI must not use real production credentials.

---

## 9.3 Staging

Used for:

- deployment verification;
- API contract tests;
- smoke tests;
- selected end-to-end flows;
- health checks;
- migration verification.

Staging must have:

- separate database;
- separate Redis;
- separate secrets;
- restricted provider keys;
- limited spend;
- test organisation accounts.

---

## 9.4 Production

Used for real users.

Production must have:

- separate secrets;
- separate MongoDB;
- separate Redis;
- bounded Cloud Run scaling;
- real monitoring;
- protected deployment approval;
- backup configuration;
- production provider keys.

---

# 10. GitHub Actions Workflow Structure

Recommended files:

```text
.github/
└── workflows/
    ├── ci.yml
    ├── deploy-staging.yml
    ├── deploy-production.yml
    ├── dependency-review.yml
    └── scheduled-health.yml
```

For MVP, these may be simplified into:

```text
ci.yml
deploy.yml
```

---

# 11. CI Workflow Triggers

CI should run on:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

Optional path filters may be added later.

Avoid overly complex path filters initially because they can accidentally skip important checks.

---

# 12. Dependency Installation

Use deterministic installation:

```bash
npm ci
```

Do not use:

```bash
npm install
```

inside CI unless package-lock generation is intentionally required.

Reasons:

- exact dependency versions;
- reproducible builds;
- faster CI;
- failure when lockfile and package.json disagree.

---

# 13. Recommended NPM Scripts

Backend:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "start:worker": "node dist/worker.js",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:security": "vitest run tests/security",
    "test:coverage": "vitest run --coverage"
  }
}
```

Frontend:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Exact scripts must match the implemented repository.

---

# 14. CI Stage 1 — Formatting and Linting

Checks:

- ESLint;
- import order;
- unused variables;
- unsafe `any`;
- unreachable code;
- React hook rules;
- backend async error handling;
- forbidden console logging where applicable.

Failure behavior:

- pipeline stops;
- pull request cannot merge.

---

# 15. CI Stage 2 — Type Checking

Backend:

```bash
npm run typecheck
```

Frontend:

```bash
npm run typecheck
```

Type checking should detect:

- invalid provider adapter implementation;
- incorrect API response type;
- missing required environment variables in typed config;
- incorrect routing result handling;
- invalid React props;
- unsafe undefined values.

---

# 16. CI Stage 3 — Unit Tests

Unit tests should cover:

- PII detectors;
- PII category mapping;
- risk scoring;
- policy thresholds;
- intent classifier;
- routing score;
- retryability classification;
- backoff calculation;
- circuit breaker state transitions;
- cursor encoding and decoding;
- encryption helpers;
- API response helpers;
- permission mapping;
- budget calculations.

Unit tests must not require network access.

---

# 17. CI Stage 4 — Integration Tests

Integration tests should run with ephemeral:

- MongoDB;
- Redis.

They should cover:

- login;
- refresh rotation;
- token reuse detection;
- idempotency;
- conversation persistence;
- metadata-only mode;
- encrypted-storage mode;
- billing rollup;
- BullMQ job execution;
- cursor pagination;
- audit append behavior;
- provider fallback with fake adapters.

---

# 18. CI Stage 5 — Security-Critical Tests

These tests are mandatory release gates.

At minimum:

- blocked prompt creates zero provider calls;
- masked prompt sends only masked content;
- cross-tenant conversation access is denied;
- cross-tenant request-log access is denied;
- team lead cannot access another team;
- audit export is organisation-scoped;
- refresh-token reuse revokes the family;
- secrets are not returned in errors;
- encrypted storage never falls back to plaintext;
- PII prompt is not cached;
- duplicate request creates one provider call.

Suggested command:

```bash
npm run test:security
```

---

# 19. CI Stage 6 — Frontend Build

Run:

```bash
npm run build
```

The build must fail on:

- TypeScript errors;
- invalid imports;
- missing environment variables required at build time;
- unresolved assets;
- bundler errors.

The frontend build should not contain backend secrets.

---

# 20. CI Stage 7 — Backend Build

Run:

```bash
npm run build
```

The output should contain compiled production code only.

Verify:

- `dist/server.js` exists;
- `dist/worker.js` exists if worker entrypoint is separate;
- no TypeScript compiler is needed at runtime;
- source maps follow the selected policy;
- build does not read production secrets.

---

# 21. CI Stage 8 — Docker Image Build

Build production target:

```bash
docker build \
  --target production \
  -t proxiai-backend:${GITHUB_SHA} \
  ./backend
```

Required checks:

- build succeeds;
- final image runs as non-root;
- image does not contain `.env`;
- image does not contain Git metadata;
- image does not contain source files unless intentionally required;
- production dependencies only;
- startup command is valid.

---

# 22. CI Stage 9 — Container Smoke Test

Example flow:

```bash
docker run -d \
  --name proxiai-ci \
  -p 8080:8080 \
  --env-file .env.test \
  proxiai-backend:${GITHUB_SHA}
```

Then check:

```bash
curl --fail http://localhost:8080/health/live
```

Optional readiness check:

```bash
curl --fail http://localhost:8080/health/ready
```

Readiness requires test MongoDB, Redis, and at least one fake healthy provider.

---

# 23. CI Artifacts

Useful CI artifacts:

- test reports;
- coverage report;
- lint report;
- failed test logs;
- Docker build metadata;
- OpenAPI validation report;
- frontend build output summary.

Artifacts must not contain:

- real tokens;
- API keys;
- prompt content;
- production database URIs;
- refresh cookies.

---

# 24. Test Coverage Policy

Suggested MVP targets:

| Area | Target |
|---|---:|
| Overall statements | 75% |
| PII and policy | 90% |
| Routing and fallback | 85% |
| Auth and token rotation | 85% |
| Tenant repositories | 90% |
| Utility code | 80% |
| UI presentation components | 60% |

Coverage alone does not replace behavioral tests.

A lower overall percentage is acceptable only when all release-blocking security flows are fully tested.

---

# 25. Dependency Security Checks

Recommended checks:

```bash
npm audit --audit-level=high
```

Also consider:

- GitHub Dependabot;
- dependency review action;
- secret scanning;
- CodeQL later;
- container image scanning later.

MVP release rule:

- critical vulnerabilities block release;
- high vulnerabilities require review;
- accepted risk must be documented;
- low and moderate issues can be scheduled if not exploitable in context.

---

# 26. Secret Scanning

Enable repository secret scanning where available.

Block commits containing:

- API keys;
- database passwords;
- JWT secrets;
- encryption keys;
- cloud service-account JSON;
- provider credentials;
- refresh tokens.

Recommended local prevention:

- `.gitignore`;
- `.env.example`;
- pre-commit secret scanner if practical.

---

# 27. OpenAPI Validation

The pipeline should validate the OpenAPI file when the formal YAML is added.

Checks:

- valid OpenAPI syntax;
- duplicate operation IDs;
- missing response schemas;
- undefined component references;
- inconsistent authentication definitions.

The Markdown API document remains the contract baseline until the executable YAML is complete.

---

# 28. Database Migration Validation

Migration steps should be tested in CI against an empty test database.

Validate:

- collection creation;
- unique indexes;
- compound indexes;
- TTL indexes;
- safe rerun;
- no destructive default behavior.

Migration scripts must be idempotent where practical.

---

# 29. Image Tagging Strategy

Every production-capable image should have:

```text
proxiai-backend:<commit-sha>
```

Optional additional tags:

```text
proxiai-backend:staging
proxiai-backend:production
proxiai-backend:v1.0.0
```

The commit SHA remains the source of truth.

Do not deploy `latest` to production.

---

# 30. Container Registry

Recommended registry:

- Google Artifact Registry.

Example image path:

```text
asia-south1-docker.pkg.dev/PROJECT_ID/proxiai/backend:<commit-sha>
```

Required controls:

- restricted push permissions;
- restricted production deploy permissions;
- immutable tags where available;
- automatic vulnerability scanning if enabled.

---

# 31. Staging Deployment

Staging deploy triggers after merge to `main`.

Recommended steps:

1. build backend image;
2. push SHA-tagged image;
3. deploy API service;
4. deploy or restart worker service;
5. run database migration;
6. wait for readiness;
7. run smoke tests;
8. publish deployment summary.

Staging deployment may be automatic.

---

# 32. Production Deployment

Production deployment should require explicit approval.

Recommended flow:

1. select the already-tested SHA image;
2. confirm staging tests passed;
3. confirm migration impact;
4. confirm rollback image;
5. approve deployment;
6. deploy API;
7. deploy worker;
8. run smoke tests;
9. monitor logs and metrics;
10. close release only after verification.

---

# 33. Same-Artifact Promotion

The image deployed to production must be the same immutable image tested in staging.

Do not rebuild after staging verification.

Correct:

```text
Build SHA image once
→ staging
→ production
```

Incorrect:

```text
Build staging image
→ rebuild production image separately
```

A separate rebuild can produce a different artifact.

---

# 34. GitHub Actions Authentication to GCP

Preferred:

- Workload Identity Federation.

Avoid:

- long-lived service-account keys stored in GitHub secrets.

MVP fallback:

- a restricted service-account key may be used temporarily;
- it must have minimum permissions;
- it must be rotated;
- it must never be committed;
- migration to Workload Identity Federation should be planned.

---

# 35. Required GitHub Secrets

Possible repository or environment secrets:

```text
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
STAGING_MONGO_URI
STAGING_REDIS_URL
PRODUCTION_MONGO_URI
PRODUCTION_REDIS_URL
```

Application runtime secrets should ideally live in GCP Secret Manager rather than GitHub.

---

# 36. GitHub Environments

Recommended environments:

- `staging`
- `production`

Production environment protections:

- manual approval;
- restricted reviewers;
- protected secrets;
- deployment history;
- branch restriction to `main`.

---

# 37. Backend Deployment Command

Example:

```bash
gcloud run deploy proxiai-api \
  --image="${IMAGE_URI}" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --allow-unauthenticated=false \
  --min-instances=0 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1
```

Exact authentication settings depend on whether the public frontend calls the API directly.

For a browser-facing API, public network access may be required while application authentication remains mandatory.

---

# 38. Worker Deployment

The worker must not rely on ordinary request-driven scale-to-zero behavior.

Initial MVP options:

- small VM;
- managed container platform with continuous CPU;
- verified Cloud Run service configuration with minimum one instance;
- another low-cost always-on container host.

Worker deployment must verify:

- process starts;
- Redis connection works;
- queues are registered;
- heartbeat is visible;
- jobs are processed.

---

# 39. Database Migration Order

Recommended production order:

```text
1. Backward-compatible index or schema migration
2. Deploy new API
3. Deploy new worker
4. Verify
5. Remove old compatibility only in a later release
```

Avoid deploying application code that requires a destructive migration before the database is ready.

---

# 40. Backward-Compatible Migration Rules

Prefer:

- additive fields;
- optional new fields;
- new indexes;
- dual-read compatibility;
- default values;
- phased cleanup.

Avoid in one release:

- renaming required fields without compatibility;
- deleting collections;
- removing fields immediately;
- changing enum values without migration;
- modifying encryption format without versioning.

---

# 41. Rollback Strategy

Rollback means deploying the last known-good image.

Required data:

- current image SHA;
- previous production image SHA;
- migration version;
- deployment timestamp;
- release notes.

Rollback steps:

1. stop further deployments;
2. identify last good SHA;
3. redeploy API image;
4. redeploy worker image;
5. verify readiness;
6. run smoke tests;
7. confirm queue processing;
8. document incident.

---

# 42. Database Rollback Policy

Automatic destructive database rollback is not recommended.

Instead:

- design forward-compatible migrations;
- keep old fields temporarily;
- restore from backup only for severe corruption;
- write corrective forward migration where possible.

If an irreversible migration is required, production deployment must have explicit backup confirmation.

---

# 43. Release Versioning

Recommended semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Examples:

```text
0.1.0 first internal MVP
0.2.0 routing and fallback
0.3.0 policy and PII
1.0.0 first approved public MVP
```

Use pre-1.0 versions while interfaces are still changing rapidly.

---

# 44. Release Notes

Every release should document:

- version;
- commit SHA;
- date;
- features;
- fixes;
- security changes;
- migrations;
- known issues;
- rollback image.

Example:

```md
## ProxiAI 0.4.0

### Added
- SSE chat streaming
- Provider fallback

### Fixed
- Duplicate billing event handling

### Security
- Added cross-tenant request-log test

### Migration
- Added RequestLog compound index

### Known Issues
- Mid-stream provider fallback is not supported
```

---

# 45. Staging Smoke Tests

Required staging smoke tests:

1. `/health/live` returns 200.
2. `/health/ready` returns 200.
3. login succeeds for test user.
4. invalid login returns generic error.
5. normal prompt streams successfully.
6. blocked prompt creates zero provider calls.
7. masked prompt sends sanitized content.
8. fallback works with fake or controlled provider failure.
9. conversation metadata is stored.
10. billing job is processed.
11. dashboard loads.
12. cross-tenant access is denied.
13. audit event is created.
14. worker heartbeat is current.
15. no secret appears in logs.

---

# 46. Production Smoke Tests

Production smoke tests should be low-risk and low-cost.

Recommended:

1. liveness;
2. readiness;
3. authentication;
4. admin dashboard metadata;
5. provider health status;
6. one controlled safe prompt;
7. worker heartbeat;
8. queue depth;
9. recent error rate;
10. deployment SHA confirmation.

Do not use real sensitive data.

---

# 47. Deployment Verification Window

After production deployment, monitor for at least:

- API error rate;
- p95 latency;
- provider failure rate;
- circuit breaker state;
- queue depth;
- worker failures;
- MongoDB connection errors;
- Redis connection errors;
- authentication failure spikes;
- budget update failures.

Suggested initial observation window:

```text
15 to 30 minutes
```

This is a practical MVP guideline, not a formal SLA.

---

# 48. Failure Conditions That Require Rollback

Rollback should be considered when:

- login is broadly broken;
- chat requests fail for most users;
- cross-tenant isolation fails;
- blocked prompts reach providers;
- encrypted storage writes plaintext;
- billing duplicates appear;
- queue processing stops;
- migration causes application crashes;
- error rate increases sharply;
- health readiness remains failed.

Security isolation defects require immediate rollback or service disablement.

---

# 49. CI/CD Notification Strategy

MVP notifications may use:

- GitHub Actions status;
- email;
- Slack later if already available.

Notify on:

- CI failure;
- staging deployment failure;
- production deployment;
- production rollback;
- security test failure;
- migration failure.

Avoid notification noise for every successful low-risk check.

---

# 50. Example CI Workflow

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mongo:
        image: mongo:7
        ports:
          - 27017:27017
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Install backend dependencies
        working-directory: backend
        run: npm ci

      - name: Install frontend dependencies
        working-directory: frontend
        run: npm ci

      - name: Backend lint
        working-directory: backend
        run: npm run lint

      - name: Backend typecheck
        working-directory: backend
        run: npm run typecheck

      - name: Backend tests
        working-directory: backend
        run: npm run test

      - name: Security-critical tests
        working-directory: backend
        run: npm run test:security

      - name: Backend build
        working-directory: backend
        run: npm run build

      - name: Frontend lint
        working-directory: frontend
        run: npm run lint

      - name: Frontend typecheck
        working-directory: frontend
        run: npm run typecheck

      - name: Frontend tests
        working-directory: frontend
        run: npm run test

      - name: Frontend build
        working-directory: frontend
        run: npm run build

      - name: Build backend image
        run: docker build --target production -t proxiai-backend:${{ github.sha }} ./backend
```

This is a baseline example and must be adjusted to the real repository scripts.

---

# 51. Example Staging Deployment Workflow

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev --quiet

      - name: Build image
        run: |
          docker build \
            --target production \
            -t "${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/proxiai/backend:${{ github.sha }}" \
            ./backend

      - name: Push image
        run: |
          docker push \
            "${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/proxiai/backend:${{ github.sha }}"

      - name: Deploy API
        run: |
          gcloud run deploy proxiai-api-staging \
            --image="${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/proxiai/backend:${{ github.sha }}" \
            --region="${{ secrets.GCP_REGION }}" \
            --platform=managed

      - name: Run smoke tests
        run: ./scripts/smoke-staging.sh
```

---

# 52. Example Production Promotion Workflow

```yaml
name: Deploy Production

on:
  workflow_dispatch:
    inputs:
      image_sha:
        description: Commit SHA already tested in staging
        required: true

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Deploy tested image
        run: |
          IMAGE="${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/proxiai/backend:${{ inputs.image_sha }}"

          gcloud run deploy proxiai-api \
            --image="$IMAGE" \
            --region="${{ secrets.GCP_REGION }}" \
            --platform=managed

      - name: Production smoke test
        run: ./scripts/smoke-production.sh
```

The worker deployment step must be added according to the selected continuous-worker hosting platform.

---

# 53. CI/CD Security Controls

Required controls:

- least-privilege cloud service account;
- protected production environment;
- no secrets in logs;
- immutable image tags;
- no production database access from pull-request jobs;
- restricted registry push permissions;
- security tests before deployment;
- audit trail for production approval;
- no untrusted fork secrets;
- dependency lockfiles committed;
- container runs as non-root.

---

# 54. Fork and Pull Request Security

For public repositories:

- do not expose secrets to fork pull requests;
- do not automatically deploy fork code;
- do not run privileged workflows on untrusted code;
- use `pull_request`, not unsafe `pull_request_target`, unless fully understood.

---

# 55. Cost Controls in CI/CD

To keep the MVP affordable:

- use fake providers in CI;
- cache npm dependencies;
- avoid unnecessary Docker rebuilds;
- cancel superseded workflows;
- limit artifact retention;
- run E2E tests only on relevant branches;
- cap Cloud Run instances;
- use staging provider spend limits;
- avoid always-on staging if not needed.

---

# 56. Pipeline Performance Targets

Suggested MVP targets:

| Pipeline | Target |
|---|---:|
| Lint + typecheck | under 3 minutes |
| Unit tests | under 5 minutes |
| Integration tests | under 10 minutes |
| Full CI | under 15 minutes |
| Staging deployment | under 10 minutes |
| Production deployment | under 10 minutes |

These are working targets, not guarantees.

---

# 57. Failed Pipeline Troubleshooting

## Dependency Install Failure

Check:

- package-lock committed;
- Node version;
- private registry configuration;
- lockfile mismatch.

## Typecheck Failure

Check:

- provider interface changes;
- missing environment schema fields;
- frontend API type drift.

## Integration Test Failure

Check:

- MongoDB readiness;
- Redis readiness;
- test isolation;
- stale test data;
- timing assumptions.

## Docker Build Failure

Check:

- wrong build context;
- missing files;
- production dependency omission;
- incorrect build target.

## Deployment Failure

Check:

- GCP authentication;
- registry permissions;
- service name;
- region;
- secret references;
- image path.

---

# 58. Emergency Hotfix Flow

```text
Create hotfix branch from production commit
→ apply minimal fix
→ run full security-critical CI
→ merge to main
→ deploy to staging
→ smoke test
→ approve production
→ monitor
```

Do not skip cross-tenant or prompt-policy tests for speed.

---

# 59. CI/CD Documentation Ownership

Initially, the solo developer owns:

- workflow files;
- deployment scripts;
- migration scripts;
- smoke tests;
- release notes;
- rollback records.

As the project grows, ownership may split between:

- application engineering;
- platform engineering;
- security;
- QA.

---

# 60. Five-Week CI/CD Implementation Plan

## Week 1

- add lint;
- add typecheck;
- add unit tests;
- add CI workflow;
- add Docker build check.

## Week 2

- add integration test services;
- add fake provider adapter tests;
- add retry and fallback tests;
- add container smoke test.

## Week 3

- add PII and policy security gates;
- add BullMQ integration tests;
- add secret scanning;
- add migration validation.

## Week 4

- add frontend build;
- add selected E2E tests;
- add staging deployment;
- add staging smoke tests.

## Week 5

- add production environment approval;
- add immutable image promotion;
- add rollback script;
- add release notes;
- verify monitoring after deploy.

---

# 61. Release Checklist

## Before Merge

- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Security tests pass.
- [ ] Documentation updated.
- [ ] Migration reviewed.
- [ ] Rollback impact understood.

## Before Staging

- [ ] Docker image builds.
- [ ] Image uses commit SHA.
- [ ] Secrets are not embedded.
- [ ] Staging database and Redis are available.
- [ ] Migration script is ready.

## Before Production

- [ ] Staging deployment succeeded.
- [ ] Staging smoke tests passed.
- [ ] Cross-tenant tests passed.
- [ ] Block and mask tests passed.
- [ ] Worker heartbeat is healthy.
- [ ] Previous production SHA is recorded.
- [ ] Production approval completed.

## After Production

- [ ] Liveness is healthy.
- [ ] Readiness is healthy.
- [ ] Login works.
- [ ] Safe chat request works.
- [ ] Queue depth is normal.
- [ ] Worker processes jobs.
- [ ] Error rate is normal.
- [ ] No secret appears in logs.
- [ ] Release notes published.

---

# 62. CI/CD Traceability

| CI/CD Control | Related Architecture Area |
|---|---|
| Typecheck | Provider adapter and API contracts |
| PII tests | Policy-before-routing |
| Cross-tenant tests | Tenant isolation |
| Docker build | Deployment architecture |
| Non-root check | Security threat model |
| Migration validation | Database design |
| OpenAPI validation | API specification |
| Worker smoke test | BullMQ architecture |
| Immutable image promotion | Deployment and rollback |
| Production approval | Operational safety |
| Secret scanning | Security design |
| Release notes | Documentation integrity |

---

# 63. Known MVP Limitations

1. Production promotion is manually approved.
2. Worker deployment depends on the selected always-on hosting option.
3. No canary release.
4. No automated traffic splitting.
5. No automatic database rollback.
6. No full infrastructure-as-code.
7. No multi-region failover.
8. No advanced container policy enforcement.
9. No full software bill of materials requirement.
10. No mandatory signed image verification.
11. No automated performance regression gate.
12. No full OpenTelemetry deployment trace correlation.

These are accepted MVP limitations.

---

# 64. Open CI/CD Decisions

1. Exact worker hosting platform.
2. Whether frontend uses Cloud Run, Firebase Hosting, or another static host.
3. Whether `develop` branch is needed.
4. Exact production approval reviewer.
5. Whether to enable CodeQL during MVP.
6. Whether migrations run inside deployment workflow or as a separate job.
7. Exact rollback script location.
8. Test artifact retention duration.
9. Whether staging remains always available.
10. Exact production smoke-test account.

---

# 65. CI/CD Definition of Done

The CI/CD implementation is complete for MVP when:

- every pull request runs lint, typecheck, tests, and build;
- security-critical tests block merge;
- Docker image is built successfully;
- image is tagged by commit SHA;
- staging deployment is automated;
- staging smoke tests are automated;
- production requires approval;
- the same staging-tested image is promoted;
- rollback to previous SHA is documented and tested;
- worker deployment is verified;
- secrets are not stored in repository or image;
- deployment history is traceable;
- release notes are produced.

---

# 66. CI/CD Self-Audit

## 66.1 Scope Audit

**Result: PASS**

- No new product feature was added.
- The pipeline supports only the approved ProxiAI MVP.
- Kubernetes, GitOps, canary releases, and multi-region delivery remain out of scope.

## 66.2 Beginner Solo-Developer Audit

**Result: PASS**

- GitHub Actions is used as the primary automation platform.
- The workflow is split into understandable stages.
- Production deployment remains manually approved.
- Same-image promotion avoids duplicate builds.
- Complex GitOps tooling is intentionally excluded.

## 66.3 Security Audit

**Result: PASS**

- Cross-tenant tests are release-blocking.
- Prompt block and mask tests are release-blocking.
- Secrets are excluded from pull-request workflows.
- Immutable image tags are required.
- Production deployment is protected.
- Non-root container and secret scanning are included.

## 66.4 Reliability Audit

**Result: PASS FOR MVP**

- Staging verification precedes production.
- Rollback uses a known-good image.
- Database rollback is handled cautiously.
- Health checks and smoke tests are required.
- Worker health is part of release verification.

## 66.5 Artifact Integrity Audit

**Result: PASS**

- One SHA-tagged image is built.
- The same image is promoted from staging to production.
- `latest` is not used as the production source of truth.
- Deployment is traceable to Git commit SHA.

## 66.6 Data Safety Audit

**Result: PASS**

- CI has no production database access.
- Staging uses separate data services.
- Migration scripts are forward-safe.
- Destructive automatic rollback is avoided.
- Secrets and prompt content are excluded from artifacts.

## 66.7 Cost Audit

**Result: PASS**

- Fake providers are used in CI.
- Cloud scaling is bounded.
- Workflow caching and cancellation are recommended.
- Expensive infrastructure is excluded.

## 66.8 Documentation Consistency Audit

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
- Sequence Diagrams.

---

# 67. Final Approval

This CI/CD design is:

- realistic for a beginner solo developer;
- secure enough for the MVP baseline;
- traceable;
- reversible;
- consistent with the approved deployment architecture;
- explicit about current limitations;
- ready to guide GitHub Actions implementation.

> **Final Status: Approved as the CI/CD Documentation baseline for the ProxiAI beginner solo-developer MVP.**
