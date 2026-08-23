# ProxiAI Refined Full-Repository Autopsy Prompt

## Why the original request needed refinement

The original request combined several different jobs in one sentence:

1. inspect every repository file;
2. execute every test, API, component, and deployment script;
3. decide whether the application is production-ready;
4. remove useless code;
5. redesign the landing page;
6. design public demo access;
7. preserve the current AWS deep-stop/deep-start deployment path; and
8. produce a fix file.

Those goals are valid, but the wording had five risks:

- **Audit and repair were mixed together.** Editing source during evidence collection can hide the original defect and make the final verdict less trustworthy.
- **"Test every file" was not measurable.** Source/config files can be parsed and mapped, but documentation, images, generated files, external AWS resources, and third-party services require different evidence.
- **Production readiness was not defined.** A project can be suitable for a recruiter demo while still not meeting highly available enterprise production requirements.
- **A public default administrator login is unsafe.** A recruiter demo identity needs a restricted role, bounded spend, reset behavior, and abuse controls.
- **Deployment direction was contradictory.** Current documents emphasize Lightsail, while the requested canonical runtime is ECS/Fargate with ALB/NAT and snapshot-driven deep stop/start.

The prompt below separates evidence collection, findings, fix planning, landing content, demo access, and production verdict. It also requires an honest limitations section when tools or external services cannot be executed.

---

# Refined Prompt

## Role

Act as a principal software architect, security reviewer, QA engineer, frontend reviewer, and deployment auditor.

## Repository basis

Use the supplied ProxiAI ZIP as the primary source of truth.

Treat evidence in this order:

1. current executable source and configuration;
2. current tests and release scripts;
3. current database/API/security/deployment documentation;
4. progress-memory documents only when consistent with current code;
5. external runtime facts only when they can be verified from the live environment.

Do not silently replace repository evidence with general assumptions.

## Non-negotiable audit mode

- Do not modify production source while collecting audit evidence.
- Do not delete any file during the audit.
- Do not claim a tool-produced review if that tool could not run.
- Do not claim tests passed unless they were executed in this audit environment or clearly label them as repository-recorded evidence.
- Never expose credentials, connection strings, API keys, passwords, cookies, JWTs, encryption keys, or secret values.
- Exclude `node_modules`, compiled output, coverage output, and temporary runtime files from source-quality counts, while still reviewing build/deployment configuration that creates them.
- Preserve the current ECS/Fargate + ALB/NAT deployment as the canonical deployment path.
- Treat Lightsail as optional/experimental unless explicitly re-approved.

## Stage 1 - Immutable inventory

Create an inventory covering:

- every file by category;
- source line counts;
- frontend/backend entrypoints;
- route files;
- models and indexes;
- migrations and seed scripts;
- tests and test counts;
- Docker/Compose files;
- AWS/IaC files;
- CI/CD workflows;
- power-control scripts;
- documentation;
- editor metadata, empty files, generated artifacts, and potential garbage.

Report the ZIP SHA-256 and the exact audited snapshot identity.

## Stage 2 - Executable verification

Run everything supported by the environment:

### Backend

- clean dependency installation;
- lint;
- typecheck;
- unit tests;
- integration tests;
- coverage;
- build;
- production dependency audit.

### Frontend

- clean dependency installation;
- lint;
- typecheck;
- tests;
- coverage;
- production build;
- production dependency audit.

### Repository/release

- release harness;
- security scan;
- secret scan;
- JSON/YAML parsing;
- TypeScript/JavaScript syntax parsing;
- local import resolution;
- Dockerfile/Compose validation;
- shell syntax;
- PowerShell syntax;
- CloudFormation validation;
- GitHub Actions validation;
- index/migration verification;
- route/API contract checks.

When a command cannot run because Docker, AWS CLI, PowerShell, package registry, network access, or credentials are unavailable, record:

- command attempted;
- exact blocker;
- what was still verified statically;
- what remains runtime verification required.

## Stage 3 - Architecture and wiring review

Reconstruct and verify:

- browser -> ALB/Caddy/Nginx -> frontend/API routing;
- frontend route tree;
- frontend API calls;
- Express route mounts;
- HTTP methods;
- validation schemas;
- success/error envelopes;
- cookie/bearer behavior;
- SSE event contract;
- auth and refresh lifecycle;
- tenant/RBAC boundaries;
- chat pipeline order;
- provider adapter/retry/fallback/circuit behavior;
- message encryption and retention;
- RequestLog/BillingRollup/analytics/anomaly flow;
- BullMQ producer/worker/recovery flow;
- metrics/logging/audit flow;
- API/worker process separation;
- graceful startup/shutdown.

Produce a frontend-to-backend API contract matrix and explicitly state whether any path rewrite is required.

## Stage 4 - Security review

Review and test where possible:

- cross-tenant IDOR;
- privilege escalation;
- role-permission synchronization;
- session rotation and concurrency;
- transient auth failures;
- proxy-aware rate limiting;
- BLOCK zero-provider behavior;
- MASK sanitized provider egress;
- plaintext persistence;
- AES-GCM AAD and tamper handling;
- AuditLog append-only behavior;
- CSV injection;
- prompt/response/secret leakage;
- metric cardinality;
- queue duplicate/replay behavior;
- deployment IAM least privilege;
- public metrics/worker exposure;
- demo-account abuse risk.

Classify every finding as:

- Confirmed;
- High probability;
- Runtime verification required;
- Intentional accepted limitation.

## Stage 5 - Dead code and repository hygiene

For each candidate file/dependency, classify:

- remove now;
- move to tests/tools;
- archive;
- keep and document;
- cannot determine without runtime proof.

Do not call code "garbage" merely because it is large or currently deferred.

Check specifically:

- unreachable production modules;
- unused dependencies;
- stale package metadata;
- zero-byte files;
- editor-specific files;
- broken documentation links;
- local machine paths;
- duplicate/stale docs;
- generated files accidentally tracked;
- unsafe `.env` ignore coverage.

## Stage 6 - Landing page and README

Audit the current README and public landing page separately.

The landing page should become a concise, recruiter-facing technical product narrative, not a full README dump.

Define an information architecture covering:

1. clear product problem and value;
2. actual request lifecycle;
3. implemented security guarantees;
4. provider and resilience architecture;
5. encrypted storage and audit behavior;
6. async billing/analytics/anomaly pipeline;
7. admin dashboard capability;
8. deployment architecture;
9. verified test/release evidence;
10. honest limitations;
11. safe demo access;
12. GitHub/docs links.

Prohibit unsupported certification, customer, scale, cost-saving, or compliance claims.

## Stage 7 - Safe recruiter demo access

Do not publish an unrestricted ORG_ADMIN password on the landing page.

Evaluate and rank these options:

1. restricted public EMPLOYEE demo account;
2. read-only guided demo with sanitized fixtures;
3. time-limited recruiter credentials delivered privately;
4. public admin demo only with server-enforced demo mode that blocks mutations and limits provider spend.

The recommended design must define:

- role and permissions;
- dedicated tenant;
- monthly/token/rate limits;
- retention mode;
- allowed provider behavior;
- reset schedule;
- refresh-session cleanup;
- conversation cleanup;
- abuse controls;
- visibility of credentials;
- protection against mutation and spend abuse.

## Stage 8 - Deployment verdict

Use ECS/Fargate + ALB/NAT + Route53/ACM + ECR + Secrets Manager + MongoDB Atlas + Redis as the canonical deployment.

Review the deep-stop/deep-start scripts for:

- validated snapshot before deletion;
- exact resource ownership checks;
- EIP preservation;
- target group/ACM/Route53 preservation;
- ALB listener/rule reconstruction;
- `/api/*` and `/health/*` path preservation;
- rollback behavior;
- idempotency;
- ambiguous-discovery refusal;
- cost that remains while deep-stopped.

Treat Lightsail as optional unless the current account supports it and the user explicitly re-approves migration.

Return two separate verdicts:

- Portfolio/recruiter demo readiness;
- Highly available enterprise production readiness.

Do not collapse these into one score.

## Stage 9 - Outputs

Create these Markdown files:

1. `PROXIAI_FULL_REPOSITORY_AUDIT_AND_FIX_PLAN.md`
2. `PROXIAI_LANDING_AND_SAFE_DEMO_SPEC.md`
3. `PROXIAI_REFINED_REPOSITORY_AUTOPSY_PROMPT.md`

The full audit must contain:

- executive verdict;
- evidence and limitations;
- repository inventory;
- architecture reconstruction;
- API matrix;
- security findings;
- deployment findings;
- test evidence;
- dead-code/hygiene list;
- landing/README findings;
- demo-access decision;
- ordered fix backlog;
- production-readiness gates;
- file-by-file references for important findings.

Do not modify application source during this audit.
