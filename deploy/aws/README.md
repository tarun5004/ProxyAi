# ProxiAI AWS Bootstrap

The templates intentionally separate foundation creation from service rollout
so empty ECR repositories never block the first CloudFormation deployment.

## Required inputs

- AWS region and account;
- VPC with at least two public ALB subnets and two private task subnets;
- private-subnet NAT egress or approved private endpoints;
- Route 53 hosted zone, public domain, and matching validated ACM certificate;
- environment-specific CPU, memory, and desired counts;
- MongoDB Atlas network path and managed Redis provider/network path;
- approved `GROQ_MODEL` and release commit SHA.

No region, domain, subnet, service count, MongoDB endpoint, or Redis provider is
hardcoded by the templates.

## Bootstrap order

1. Deploy `registry.yml` once per AWS account/region. Staging and production
   promote the same two repository image digests; they do not rebuild images.
2. Deploy `foundation.yml` separately for staging and production.
3. Populate the created MongoDB, Redis, and Groq Secrets Manager secrets.
4. Confirm Atlas and managed Redis accept private-task connectivity. Redis must
   use TLS, persistence appropriate to the provider, and `noeviction`.
5. Build, scan, and push frontend/backend images by immutable SHA.
6. Deploy staging `services.yml` with image digests (`repository@sha256:...`).
7. Run the one-off backend task with `node dist/scripts/deploy-indexes.js`.
8. After staging approval, pass the exact same digests to production.
9. Wait for ECS stability, then run the authenticated smoke suite.

The frontend and API are routed through one HTTPS origin. `/api/*` and
`/health/*` reach the API; all other paths reach the frontend. Worker tasks are
private, have no listener or public IP, and use the same backend image digest.

## Secrets

CloudFormation creates secret containers but never commits secret values.
Populate values through Secrets Manager, not template parameters, Docker build
arguments, GitHub variables, logs, or repository files. Rotate generated JWT
and rate-limit secrets per environment.

## Rollback

ECS deployment circuit breakers automatically roll back failed service
revisions. Manual rollback registers/deploys the previously recorded task
definition revisions; database/index rollback is never automatic or
destructive.
