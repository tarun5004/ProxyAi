# ProxiAI AWS Deployment Architecture

**Document ID:** DEPLOY-001
**Status:** Approved deployment baseline
**Target:** Docker on AWS ECS/Fargate

## 1. Purpose

This document defines the production deployment boundary for the existing
ProxiAI application. It does not add product behavior and does not advance
Phase 8 or later product features.

## 2. Canonical Platform

The canonical deployment target is:

- Docker images in Amazon ECR;
- three Amazon ECS/Fargate services;
- an internet-facing Application Load Balancer;
- Route 53 and ACM-managed TLS;
- AWS Secrets Manager runtime secret injection;
- CloudWatch logs;
- MongoDB Atlas;
- a managed Redis service compatible with BullMQ;
- GitHub Actions using AWS OIDC rather than long-lived AWS keys.

GCP and Cloud Run are no longer approved deployment targets.

## 3. Deployment Parameters

The following values are intentionally parameters and must be supplied before
infrastructure deployment:

- AWS account ID;
- AWS region;
- staging and production public hostnames;
- Route 53 hosted-zone ID;
- ACM certificate ARN or certificate domain;
- VPC, subnet, and NAT/private-connectivity choices;
- ECS task CPU, memory, desired counts, and autoscaling limits;
- MongoDB Atlas networking and backup settings;
- managed Redis product, endpoint, TLS/auth settings, and capacity;
- GitHub repository and deployment-approval identities.

No source file may contain invented production values for these parameters.

## 4. Public Domain Strategy

Each environment uses one canonical public application origin supplied as a
deployment parameter. The ALB routes:

- `/api/*` and `/health/*` to the API target group;
- all other paths to the frontend target group.

The browser calls the same origin through relative `/api/v1` paths. This keeps
the frontend image environment-neutral and allows the same image digest to move
from staging to production without rebuilding. The backend
`FRONTEND_ORIGIN` value is the exact environment origin.

No domain name is hardcoded in the repository.

## 5. Deployable Units

### 5.1 Frontend service

- Next.js production server;
- container port `3000`;
- no provider, database, JWT, Redis, or cloud secret;
- container health path `/healthz` (the ALB may use `/healthz` when a
  dedicated frontend target-group health check is configured);
- no local filesystem/session authority.

### 5.2 API service

- Express HTTP API only;
- container port `8080` by default, overridden through validated `PORT`;
- public traffic only through the ALB;
- `/health/live` for process health;
- `/health/ready` for MongoDB and Redis readiness;
- publishes BullMQ jobs but does not run business workers.

### 5.3 Worker service

- same backend image as the API where practical;
- command `npm run start:worker`;
- no HTTP listener and no public port;
- runs billing, analytics, anomaly, provider-health, and enqueue-recovery
  workers and schedules;
- desired count starts as an explicit deployment parameter;
- operational health is verified through process status, CloudWatch events,
  Redis-backed worker heartbeat, and queue smoke checks.

## 6. ECR and ECS Boundaries

Two ECR repositories are required:

- frontend image;
- backend image shared by API and worker.

Three ECS services are required:

- frontend service using the frontend image;
- API service using the backend image and API command;
- worker service using the same backend image and worker command.

Images are addressed by immutable commit-SHA tags and image digests. Production
must receive the exact digests tested in staging. `latest` is not a deployment
identity.

## 7. Networking

- The ALB is the only public compute entry point.
- Frontend, API, and worker tasks run in private subnets.
- Frontend and API security groups allow inbound traffic only from the ALB on
  their container ports.
- Worker tasks accept no inbound application traffic.
- Tasks require controlled outbound access to MongoDB Atlas, managed Redis,
  Groq, ECR, CloudWatch, and Secrets Manager as applicable.
- MongoDB Atlas and Redis connectivity must use approved private connectivity
  where selected; otherwise outbound addresses and allowlists are explicit
  deployment parameters.
- Redis is never publicly reachable.

Service discovery is not required because application services do not call one
another directly; the browser uses the ALB and all services access managed
dependencies through configured endpoints.

## 8. Redis and BullMQ Production Contract

The selected managed Redis service must support the Redis commands and blocking
connections BullMQ requires. Deployment must verify:

- TLS and authentication;
- private network access;
- `noeviction` or another explicitly validated non-lossy queue policy;
- cluster-mode compatibility with the single-URL ioredis configuration;
- connection limits for the API, worker queues, and worker connections;
- persistence/failover characteristics;
- security-group access only from API and worker tasks.

The exact managed Redis product remains a deployment parameter until approved.

## 9. MongoDB Atlas Contract

- Staging and production use separate databases or projects.
- TLS is mandatory through the Atlas connection string.
- Network access is restricted to approved task egress/private connectivity.
- Backups are enabled before production data is accepted.
- Required indexes are applied through the explicit idempotent deployment
  command before application rollout.
- Destructive migrations do not run automatically on API or worker startup.

## 10. Configuration and Secrets

### Public frontend configuration

- API paths are same-origin and relative; no environment-specific API hostname
  is embedded in the image.

### Backend and worker secrets

- `MONGO_URI`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `AUTH_RATE_LIMIT_SECRET`
- `GROQ_API_KEY`

These keys are stored in one environment-scoped AWS Secrets Manager JSON
secret. Production uses `proxiai/production`; ECS injects only the keys required
by each task. Secret values never enter Docker build arguments, image layers,
GitHub logs, frontend bundles, or committed environment files.

### Runtime configuration

- `NODE_ENV`, `LOG_LEVEL`, `PORT`, and `FRONTEND_ORIGIN`;
- access/refresh token lifetimes;
- chat rate limits;
- idempotency TTLs;
- `GROQ_MODEL` and provider timeout;
- `COMMIT_SHA`.

Task-role secret access follows least privilege. API and worker environment
contracts may differ, but both remain strictly validated.

## 11. Health Contract

- API liveness means the HTTP process is running.
- API readiness means required MongoDB and Redis connections are ready.
- Provider health is routing/operational state and does not make the base API
  process unready.
- Frontend ALB health uses the dependency-free `/healthz` route.
- Worker health uses ECS process state plus the existing Redis heartbeat and an
  operational queue-processing smoke check; no public worker HTTP endpoint is
  required.

## 12. Migration and Index Deployment

The deployment pipeline runs an explicit idempotent index command before API
and worker rollout. It must:

- connect using validated MongoDB configuration;
- create only approved schema-declared indexes;
- fail the deployment on errors;
- avoid deleting data or running destructive schema changes;
- be safe to rerun.

Production backup confirmation is a manual deployment prerequisite. Application
rollback does not automatically roll back database changes.

## 12.1 Infrastructure definitions

- `deploy/aws/registry.yml` creates the two shared immutable ECR repositories
  used to promote identical image digests from staging to production.
- `deploy/aws/foundation.yml` adopts explicit existing cluster, networking,
  ALB, target-group, IAM-role, log-group, and runtime-secret identifiers. It may
  create retained 7-day log groups or the missing HTTPS listener/rules only
  when an explicit create flag is approved.
- `deploy/aws/services.yml` creates separate frontend, API, and worker Fargate
  task definitions/services from immutable image digest parameters.
- Public/private subnet IDs, VPC, domain, certificate, region context, image
  digests, task sizes, desired counts, provider model, and external data paths
  remain environment deployment inputs.
- MongoDB Atlas and managed Redis are external approved dependencies. The
  templates do not guess a Redis product or create unsafe public data stores.

## 13. Deployment and Rollback

1. Validate code and build images once.
2. Tag both images with the commit SHA and record their digests.
3. Apply the safe index step.
4. Deploy the exact digests to staging.
5. Run staging smoke tests.
6. Require production environment approval.
7. Promote the same digests to production task definitions.
8. Run production smoke tests and monitor.

Rollback registers or selects task definitions using the previously recorded
frontend and backend image digests, updates frontend/API/worker services, waits
for stability, and reruns smoke tests. Rollback never rebuilds an image.

## 14. Safe Deferrals

The deployment does not require Phase 8 Admin UI, Phase 9 encrypted history,
prompt-cache/replay implementation, attachments, email delivery, advanced
reporting, or full observability tooling. The known interrupted Groq usage
limitation remains fail closed and unchanged.

## 15. Readiness Gate

Deployment is ready only when containers, worker separation, index deployment,
AWS infrastructure definitions, CI/CD, secret injection, health checks,
staging smoke tests, production approval, and rollback verification all pass.
