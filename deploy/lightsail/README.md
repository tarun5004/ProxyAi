# ProxiAI Lightsail Live Demo

This directory provides the approved low-cost runtime for `proxiai.me`. It
deploys the existing immutable frontend/backend images to one 2 GB Linux
Lightsail instance without changing product behavior.

## Safety boundary

- Use AWS profile `proxiai-deployment` in `ap-south-1`.
- Never use root for provisioning or release commands.
- Keep ECS, ALB, NAT, and current target groups running until both canary and
  public-domain smoke tests pass.
- Never commit `runtime.env`, access tokens, SSH keys, or smoke credentials.
- Production containers use exact ECR digests, never `latest`.

## One-time prerequisites

1. An account administrator attaches the reviewed
   `deploy/aws/proxiai-deployment-policy.json` permissions to the local and
   GitHub OIDC deployment roles.
2. Configure GitHub variables:
   `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, ECR repository
   variables, `LIGHTSAIL_INSTANCE_NAME`, `LIGHTSAIL_CANARY_DOMAIN`,
   `PRODUCTION_DOMAIN`, `ROUTE53_HOSTED_ZONE_ID`, and `SMOKE_ORG_SLUG`.
3. Configure protected `SMOKE_EMAIL` and `SMOKE_PASSWORD` secrets.
4. Keep application runtime values only in `proxiai/production`.

## Provision

Check mode is the default:

```powershell
pwsh -File deploy/lightsail/provision.ps1
```

After reviewing the selected active Ubuntu 24 blueprint and 2 GB bundle:

```powershell
pwsh -File deploy/lightsail/provision.ps1 -Apply
```

The script creates or reuses only `proxiai-demo` and `proxiai-demo-ip`, opens
80/443, and leaves SSH closed. The GitHub workflow opens SSH to its temporary
runner `/32` only while deploying.

## Release sequence

1. Run `Deploy Lightsail Demo` with `target=canary` and a tested 40-character
   SHA.
2. Verify canary HTTPS, auth refresh, conversations, ALLOW/MASK/BLOCK, worker
   accounting/analytics/anomaly/provider-health/recovery evidence, MongoDB,
   Redis, and Groq.
3. Run the same workflow with the same SHA and `target=production`.
4. Verify `https://proxiai.me` again and observe host memory/restarts.
5. Keep ECS live during the rollback window.

The workflow backs up the previous A record before every DNS change and
restores it automatically when deployment or smoke fails.

## Host layout

```text
/opt/proxiai/
├── current-release
├── previous-release
├── releases/<git-sha>/
│   ├── compose.yml
│   ├── Caddyfile
│   ├── release.env       # image digests and public config only
│   └── scripts
└── shared/runtime.env    # mode 0600, never committed
```

## Rollback

Use temporary Lightsail SSH access and run:

```bash
/opt/proxiai/releases/$(cat /opt/proxiai/current-release)/rollback.sh
```

Then rerun the public smoke suite. Rollback changes only application image
digests; it never mutates MongoDB, Redis, Route 53, or ECS.

## Old AWS cleanup plan

No item below is deleted by this migration.

| Resource | Cost reason | Safe to remove now | Rollback impact |
|---|---|---:|---|
| ECS frontend/API/worker services | Fargate task runtime | No | Removes immediate application rollback |
| NAT Gateway and EIP | Hourly plus data processing | No | Breaks private ECS egress and Atlas allowlist |
| Application Load Balancer | Hourly/LCU/public IPv4 | No | Removes old TLS/routing rollback endpoint |
| Frontend/API target groups | No major standalone cost | No | Breaks ALB rollback routing |
| Seven-day CloudWatch groups | Ingest/storage | No | Removes deployment evidence during migration |
| Old task definitions | No meaningful idle runtime cost | No | Removes fast revision rollback metadata |
| ECR repositories | Image storage | No | Required for Lightsail CI/CD and rollback |
| Route 53 hosted zone | DNS hosting | No | Required for `proxiai.me` |
| IAM/OIDC roles | No idle charge | No | Required for keyless deployment |

After a separately approved stability window, scale ECS services to zero first,
verify Lightsail remains healthy, and only then prepare destructive ALB/NAT
changes for explicit approval.
