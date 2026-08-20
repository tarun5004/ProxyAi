# ProxiAI AWS Deployment Architecture

**Document ID:** DEPLOY-001
**Status:** Approved deployment baseline with cost-optimized live-demo path
**Target:** Docker on AWS Lightsail for the public demo; ECS/Fargate remains the
rollback architecture until migration cleanup is explicitly approved

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

One-time interview staging exception: the first shared-demo validation may
reuse the existing production-named ALB, target groups, Atlas database, Upstash
Redis endpoint, and runtime secret to avoid duplicate infrastructure cost.
Dedicated staging ECS task/service names and a dedicated smoke identity remain
required. The temporary staging origin may use the ALB DNS over HTTP; production
still requires HTTPS with an approved domain and ACM certificate. Staging tasks
must be scaled to zero and removed from shared target groups before production
promotion. This exception does not redefine the final isolation architecture.

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

Before deploying the Phase 9 build or enabling encrypted titles/content, the
same environment-scoped secret must contain:

- `MESSAGE_ENCRYPTION_KEYS_JSON`
- `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION`

These keys are stored in one environment-scoped AWS Secrets Manager JSON
secret. Production uses `proxiai/production`; ECS injects only the keys required
by each task. Secret values never enter Docker build arguments, image layers,
GitHub logs, frontend bundles, or committed environment files.
The application may remain metadata-only without these Phase 9 keys only while
no active organisation uses encrypted storage. Removing an old key version
before verified re-encryption is prohibited.

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

## 16. Cost-Optimized Lightsail Live Demo

For expected portfolio/interview traffic of approximately 0–10 occasional
users, the approved live-demo target is one Linux Lightsail instance in
`ap-south-1` running Docker Compose:

```text
Internet
  -> Lightsail firewall (80/443)
  -> Caddy automatic HTTPS
     -> frontend:3000
     -> api:8080 for /api/* and /health/*

worker -> MongoDB Atlas / Upstash Redis / Groq
api    -> MongoDB Atlas / Upstash Redis / Groq
```

The frontend, API, worker, and Caddy remain separate containers. The worker has
no published port. MongoDB Atlas and Upstash remain external authoritative
services; no duplicate database or Redis service is created on Lightsail.

### 16.1 Capacity decision

The initial bundle is the public-IPv4 2 GB Linux plan. The current immutable
images were measured together in an isolated production-mode startup at about
146 MiB idle application memory: frontend about 35 MiB, API about 54 MiB, and
worker about 57 MiB. Each backend process is still capped at 512 MiB, the
frontend is capped below its previous 512 MiB Fargate allocation, and Caddy is
bounded separately. This leaves operating-system and burst headroom on a 2 GB
host for the approved low traffic. Sustained memory pressure, OOM termination,
or swap activity is an explicit upgrade trigger to the 4 GB plan.

### 16.2 Migration safety

- Existing ECS, ALB, NAT, target groups, and tasks stay unchanged until the
  Lightsail deployment passes direct/canary and public-domain smoke checks.
- `proxiai.me` DNS is changed only after a temporary HTTPS canary hostname has
  proven login, refresh, chat, policy, accounting, and worker behavior.
- Application images remain immutable ECR digests derived from one Git SHA.
- The previous release SHA and image digests remain on the host for rollback.
- Destructive ECS/ALB/NAT cleanup requires a separate explicit approval after
  public stability is proven.

### 16.3 Secrets and host storage

The GitHub OIDC deployment role reads only the existing
`proxiai/production` secret. A release job transfers a mode-`0600` runtime env
file over an authenticated temporary Lightsail SSH certificate. Secret values
never enter Git, Docker build arguments, image layers, or workflow logs.
Lightsail does not receive long-lived AWS access keys. ECR login uses a
short-lived token delivered over the same authenticated deployment session.

### 16.4 HTTPS and DNS

Caddy terminates TLS and obtains certificates automatically after Route 53
points the approved hostname to the attached Lightsail static IPv4 address. A
temporary canary hostname is used before apex cutover. HTTP redirects to HTTPS.
The API `FRONTEND_ORIGIN` always equals the exact active HTTPS origin.

### 16.5 Operations and rollback

Deployments retain release directories by Git SHA, update Compose with exact
frontend/backend image digests, wait for container health, and then run the
authenticated smoke suite. Rollback selects the previous recorded release and
never rebuilds images or mutates data. Caddy certificate state is persisted in
named volumes. Host backups/snapshots are optional costed safeguards and must
be approved separately.
