# ProxiAI AWS Bootstrap

The templates intentionally separate existing-resource adoption from service
rollout so manually provisioned production resources are never duplicated.

## Required inputs

- AWS region and account;
- VPC with at least two public ALB subnets and two private task subnets;
- private-subnet NAT egress or approved private endpoints;
- existing cluster, ALB, security groups, target groups, IAM roles, private
  subnets, NAT Gateway, log groups, and canonical runtime-secret ARN;
- Route 53 hosted zone, public domain, and matching validated ACM certificate;
- environment-specific CPU, memory, and desired counts;
- MongoDB Atlas network path and managed Redis provider/network path;
- approved `GROQ_MODEL` and release commit SHA.

No region, domain, subnet, service count, MongoDB endpoint, or Redis provider is
hardcoded by the templates.

## Bootstrap order

1. Deploy `registry.yml` once per AWS account/region. Staging and production
   promote the same two repository image digests; they do not rebuild images.
2. Pass existing resource identifiers to `foundation.yml`. Its create flags are
   disabled by default; enable one only after proving that resource is missing.
3. Populate the canonical `proxiai/production` secret with `MONGO_URI`,
   `REDIS_URL`, `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_SECRET`, and
   `GROQ_API_KEY`, plus the Phase 9 `MESSAGE_ENCRYPTION_KEYS_JSON` and
   `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION` values through an approved
   secret-management session.
4. Confirm Atlas and managed Redis accept private-task connectivity. Redis must
   use TLS, persistence appropriate to the provider, and `noeviction`.
5. Build, scan, and push frontend/backend images by immutable SHA.
6. Deploy staging `services.yml` with image digests (`repository@sha256:...`).
7. Run the one-off backend task with `node dist/scripts/deploy-indexes.js`.
8. After staging approval, pass the exact same digests to production.
9. Wait for ECS stability, then run the authenticated smoke suite.

The frontend and API are routed through one origin. Production requires HTTPS;
the one-time shared-demo staging validation may use the existing ALB DNS over
HTTP by setting `AppProtocol=http`. `/api/*` and
`/health/*` reach the API; all other paths reach the frontend. Create the HTTPS
listener only after an approved domain and matching ACM certificate exist.
Because the current HTTP listener is external to the stack, switch its default
action and existing path rules to HTTPS redirects as an explicit reviewed AWS
operation. Worker tasks are private, have no listener or public IP, and use the
same backend image digest.

## Secrets

The services read approved JSON keys from one environment-scoped runtime secret.
Secret values are populated through Secrets Manager, never through template
parameters, Docker build arguments, GitHub variables, logs, or repository files.

## Staging

Staging reuses the approved cluster and ALB but uses environment-specific task
definitions, services, target groups, log groups, runtime secret, data scope,
and smoke identity. Desired counts may be set to zero after verification. Do
not create a second permanent cluster, ALB, NAT Gateway, Atlas cluster, or Redis
deployment for staging.

For the one-time interview staging validation only, an approved shared-demo
exception also permits reuse of the existing target groups, Atlas database,
Upstash Redis endpoint, and `proxiai/production` runtime secret. Dedicated
staging ECS service/task names and a dedicated smoke identity remain mandatory.
Scale these staging services to zero after verification and remove them from
the shared target groups before any production promotion. This exception does
not replace the final production isolation or HTTPS requirements.

## Rollback

ECS deployment circuit breakers automatically roll back failed service
revisions. Manual rollback registers/deploys the previously recorded task
definition revisions; database/index rollback is never automatic or
destructive.

## Demo power controls

The manual power controls discover the current ProxiAI resource identifiers
before each operation. Soft stop scales only the three ECS services to zero.
Deep stop additionally removes the ALB and NAT Gateway while preserving the
target groups, ACM certificate, Route 53 hosted zone, NAT EIP, VPC networking,
ECR, IAM, Secrets Manager, ECS services, cluster, and task definitions.

```powershell
.\deploy\aws\demo-power.ps1 snapshot
.\deploy\aws\demo-power.ps1 soft-stop
.\deploy\aws\demo-power.ps1 soft-start
.\deploy\aws\demo-power.ps1 deep-stop -WhatIf
.\deploy\aws\demo-power.ps1 deep-stop -Apply
.\deploy\aws\demo-power.ps1 deep-start -Apply
```

Deep stop writes the non-secret reconstruction state to the ignored
`deploy/aws/.runtime/demo-power-state.json`. Keep that local file until deep
start and public smoke verification complete. Do not release the preserved NAT
EIP because Atlas trusts its public address.

The standalone `snapshot` action is read-only for AWS. It discovers the live
topology, validates every required recovery field, writes atomically, reads the
file back, and validates it again. Deep stop performs the same snapshot gate
before scaling ECS or mutating any AWS resource.

The account administrator must attach
`deploy/aws/proxiai-demo-power-policy.json` to
`proxiai-deployment-role` before the first apply operation. No script attaches
IAM policy or uses root credentials.
