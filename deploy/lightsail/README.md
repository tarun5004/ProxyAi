# Archived Lightsail Experiment

Lightsail was evaluated as a low-cost single-host demo option. It was never
approved as the canonical ProxiAI release architecture and no successful
cutover evidence exists.

The executable workflow and runtime scripts were removed after a repository
reference scan confirmed that no active CI workflow, release script, or manual
ECS recovery procedure depended on them. Their implementation and design
history remain available in Git commits `31c4291`, `d4b960f`, and `3c41f1b`.

The only supported deployment path is the ECS/Fargate flow documented in:

- `docs/07_DEPLOYMENT_ARCHITECTURE.md`
- `docs/13_CICD_DOCUMENTATION.md`
- `deploy/aws/README.md`

Do not reconstruct or execute the Lightsail experiment without a new approved
architecture decision, security review, canary contract, and rollback plan.
