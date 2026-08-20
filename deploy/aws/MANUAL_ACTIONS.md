# ProxiAI Minimum-Cost Deployment Actions

This checklist is the mandatory cost gate for the initial 0–10 user
interview/demo deployment in `ap-south-1`. It does not relax authentication,
tenant isolation, TLS, secret handling, policy enforcement, accounting, or
worker correctness.

## 1. Required Approval Before Creation

Record an AWS Pricing Calculator estimate before creating any recurring-cost
resource. The estimate must include Fargate, the existing Application Load
Balancer, NAT Gateway and public IPv4, ElastiCache, CloudWatch, Secrets
Manager, ECR storage, Route 53, and MongoDB Atlas.

Do not create a resource until its owner confirms the estimated monthly cost.
Prices vary by region and usage, so this file records capacity and cost drivers
rather than hardcoded totals.

## 2. Initial Production Capacity

Use these P12-09 service parameters initially:

| Service | CPU | Memory | Desired count | Autoscaling |
|---|---:|---:|---:|---|
| Frontend | 256 CPU units | 512 MiB | 1 | Disabled |
| API | 256 CPU units | 512 MiB | 1 | Disabled |
| Worker | 256 CPU units | 512 MiB | 1 | Disabled |

This is the smallest valid Linux Fargate allocation. Stage verification must
prove that each task stays healthy without sustained memory pressure or OOM
termination. Increase only the affected service if evidence shows 512 MiB is
unstable. Do not use Fargate Spot for the API or worker because interruption can
break request availability or in-flight queue processing.

Keep one production task for each service. Do not enable autoscaling, scheduled
scaling, warm standby tasks, or multi-region deployment during the initial
demo period.

## 3. Load Balancer and TLS

Reuse the single approved `proxiai-alb` and its frontend/API target groups. Do
not create another permanent ALB for staging. ALB hourly, LCU, data-transfer,
and public IPv4 charges continue even at very low request volume.

Valid browser TLS remains mandatory. An ALB hostname alone cannot provide a
project-owned matching ACM certificate. Before production promotion, configure
an approved domain, Route 53 record, and ACM certificate, or approve another
TLS termination design without removing the ALB. Plain HTTP is allowed only
for isolated local Compose verification, not production.

## 4. Network Egress Decision

Keep ECS tasks in private subnets with `AssignPublicIp: DISABLED`. One NAT
Gateway with one Elastic IP is the initial minimum secure egress path because:

- Groq requires outbound internet access;
- Fargate must reach required AWS/runtime endpoints;
- Atlas Flex has no PrivateLink or VPC peering; and
- Atlas public access must use a stable allowlisted egress IP.

For this contract, one NAT Gateway is technically unavoidable unless Atlas is
upgraded to a dedicated private-networking tier and every remaining outbound
dependency has an approved private route. Do not avoid NAT by allowing
`0.0.0.0/0` in Atlas or by exposing Redis publicly.

Use one NAT Gateway initially, not one per Availability Zone. This reduces
cost but creates an accepted single-AZ egress availability limitation. Review
the trade-off before real customer traffic. Do not add paid interface VPC
endpoints unless their combined estimate is lower than NAT for measured usage.
Use no-charge gateway endpoints where applicable.

## 5. Managed Redis

Initial candidate: one node-based ElastiCache for Valkey `cache.t4g.micro`
node, cluster mode disabled, zero replicas, TLS enabled, authentication enabled,
and an approved `noeviction` parameter group. It provides 0.5 GiB memory and is
the smallest current-generation node documented by AWS.

Before creation, run the BullMQ compatibility and TLS smoke checks. Unknown or
unsupported command behavior is a blocker. A single node minimizes cost but
does not provide Multi-AZ failover; Redis loss must continue to fail closed and
must never silently bypass idempotency, rate limits, or queue guarantees.

Do not create ElastiCache Serverless without a calculator comparison and a
confirmed BullMQ/`noeviction` contract. Do not create replicas, Global
Datastore, cross-region replication, or reserved capacity initially.

## 6. MongoDB Atlas

Initial candidate: one Atlas Flex cluster in the closest approved AWS region.
Current Atlas documentation describes a 5 GB included limit and an $8–$30
monthly usage range. Flex is suitable for this demo load but does not support
private endpoints, network peering, continuous backup, or point-in-time
restore.

Allowlist only the NAT Gateway Elastic IP, require TLS and a least-privilege
database user, and keep staging and production databases logically separate.
Do not use `0.0.0.0/0`. Upgrade to a dedicated Atlas tier only when measured
load, backup requirements, or private connectivity justify the recurring cost.

## 7. Staging Lifetime

Staging is temporary for release verification. Use desired count `1` while the
smoke and rollback gates run, then set frontend/API/worker desired counts to
`0`. Do not keep a second ALB, NAT Gateway, Redis cluster, or Atlas cluster idle
for staging. Retain only inexpensive task definitions, logs, and deployment
metadata required for audit and rollback.

Never point routine staging at production tenant data. For the one-time
interview staging validation, the approved shared-demo exception permits the
existing Atlas database, Redis endpoint, `proxiai/production` secret, ALB, and
target groups. Use dedicated staging task/service names and a dedicated smoke
identity, scale staging tasks to zero after verification, and remove staging
targets before production promotion. Later staging deployments return to
separate data, secrets, and target groups.

The one-time staging origin may be the existing ALB DNS over HTTP. Production
still requires an approved domain, ACM certificate, HTTPS listener, and HTTP to
HTTPS redirect.

## 8. Logs, Images, and Secrets

- Set CloudWatch log retention to 7 days initially.
- Keep safe structured logs only; do not enable verbose/debug production logs.
- Add ECR lifecycle rules only after protecting active and rollback digests;
  retain a small bounded set of SHA-tagged images.
- Keep one environment-scoped JSON secret. Production uses
  `proxiai/production` with only `MONGO_URI`, `REDIS_URL`,
  `JWT_ACCESS_SECRET`, `AUTH_RATE_LIMIT_SECRET`, and `GROQ_API_KEY`.
- Do not enable Container Insights beyond the approved need without reviewing
  its metric/log cost. Disable it if the deployment contract does not require
  it for the initial smoke period.

## 9. Resources to Avoid Initially

- additional ALBs or NAT Gateways;
- permanent staging tasks;
- ECS autoscaling or capacity reservations;
- Fargate task counts above one per service;
- Redis replicas, Multi-AZ, Global Datastore, or oversized nodes;
- dedicated Atlas clusters without an approved security/backup requirement;
- cross-region replication, multi-region ECS, or duplicate production stacks;
- paid interface endpoints without a measured NAT comparison;
- long CloudWatch retention, high-cardinality custom metrics, and unused log
  groups;
- idle ECR images, snapshots, Elastic IPs, or orphaned target groups.

## 10. Manual Cost Controls

Current template controls are intentionally cost-capped:

- `services.yml` defaults every service to 256 CPU units/512 MiB and permits no
  desired count above one.
- `foundation.yml` creates a missing log group only when explicitly requested,
  retains it on stack deletion/replacement, and fixes retention at 7 days.
- Existing ECS clusters must keep Container Insights disabled for the initial
  paid environment.
- `services.yml` requires private task subnets. Reuse the approved/default VPC
  but create only the minimum private routing needed; do not create another VPC.

Before P12-09 creation:

1. Save the approved AWS Pricing Calculator estimate.
2. Create an AWS Budget using the owner's approved monthly cap, with alerts at
   50%, 80%, and 100%.
3. Tag every resource with `Project=ProxiAI`, `Environment`, `Owner`, and
   `ManagedBy`.
4. Confirm desired counts are exactly one and autoscaling is absent.
5. Confirm CloudWatch retention is seven days.
6. Confirm only one ALB and one NAT Gateway will incur hourly charges.
7. Confirm Atlas and Redis tiers match this checklist.
8. Record staging shutdown steps before staging starts.

After deployment:

1. Set staging desired counts to zero immediately after rollback proof.
2. Review Cost Explorer daily for the first seven days and weekly afterward.
3. Check for unattached Elastic IPs, idle NAT Gateways, unused target groups,
   old snapshots, and unreferenced ECR images.
4. Review Fargate CPU/memory and Redis memory/CPU before any scale-up.
5. Stop and obtain approval before creating any new material recurring-cost
   resource.

## 11. Official References

- AWS Fargate pricing: <https://aws.amazon.com/fargate/pricing/>
- Valid Fargate CPU/memory combinations:
  <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html>
- Application Load Balancer pricing:
  <https://aws.amazon.com/elasticloadbalancing/pricing/>
- NAT Gateway pricing guidance:
  <https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html>
- ElastiCache pricing: <https://aws.amazon.com/elasticache/pricing/>
- ElastiCache supported node types:
  <https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/CacheNodes.SupportedTypes.html>
- Atlas Flex costs:
  <https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/>
- Atlas Flex limitations:
  <https://www.mongodb.com/docs/atlas/reference/flex-limitations/>

## 12. Lightsail Cost-Cut Migration

The approved demo replacement is one 2 GB Linux Lightsail instance with public
IPv4, two vCPUs, and 60 GB SSD. AWS currently lists this bundle at USD 12/month
before taxes and region-specific transfer overages. The attached Lightsail
static IPv4 has no separate charge while attached.

Before provisioning, an account administrator must extend only the ProxiAI
deployment and GitHub OIDC roles with the repository policy's explicit
Lightsail and Route 53 actions. The current non-root role cannot call
`lightsail:GetInstances` or `lightsail:GetBundles`; do not fall back to root for
normal provisioning.

Required manual values/actions:

1. Attach the reviewed updated deployment policy to
   `proxiai-deployment-role` and the GitHub deployment role.
2. Set `LIGHTSAIL_INSTANCE_NAME=proxiai-demo`, the Route 53 hosted-zone ID,
   `LIGHTSAIL_CANARY_DOMAIN`, and the production domain in GitHub variables.
3. Keep `SMOKE_EMAIL` and `SMOKE_PASSWORD` only in the protected GitHub
   environment.
4. Run the canary deployment and full smoke before changing `proxiai.me`.
5. Approve the Route 53 apex cutover only after the canary is green.
6. Wait for public stability, then separately approve any ECS/ALB/NAT cleanup.

Do not delete or scale down the existing ECS services, ALB, NAT gateway, target
groups, or their rollback metadata during this migration task.

### Post-cutover cleanup approval matrix

| Resource | Main recurring-cost reason | Safe before stable cutover | Rollback impact |
|---|---|---:|---|
| ECS services/tasks | Fargate CPU and memory | No | Immediate rollback unavailable |
| NAT Gateway/EIP | Hourly and per-GB egress | No | ECS loses external dependency access |
| ALB | Hourly, LCU, public IPv4 | No | Previous HTTPS endpoint disappears |
| Target groups | Operational clutter | No | Previous ALB routing cannot be restored quickly |
| CloudWatch logs | Ingest/storage | No | Migration evidence lost |
| Task definitions | Negligible idle cost | No | Revision rollback metadata lost |

ECR, Route 53, and IAM/OIDC remain required by the Lightsail delivery path and
are not cleanup candidates.
# Demo power-control IAM

Before using deep power control, an account administrator must create or update
the managed policy from `deploy/aws/proxiai-demo-power-policy.json` and attach
it only to `proxiai-deployment-role`. The policy permits scaling the three
existing ECS demo services and reconstructing only the named ProxiAI ALB, NAT
route, NAT Gateway, and `proxiai.me` alias. It does not permit releasing the NAT
EIP, deleting target groups, or changing application secrets.

```powershell
aws iam create-policy --policy-name proxiai-demo-power-policy --policy-document file://deploy/aws/proxiai-demo-power-policy.json
aws iam attach-role-policy --role-name proxiai-deployment-role --policy-arn arn:aws:iam::851725401338:policy/proxiai-demo-power-policy
```

If the managed policy already exists, create a new non-default policy version,
set the reviewed version as default, and then run only the attach command. Do
not attach AdministratorAccess.
