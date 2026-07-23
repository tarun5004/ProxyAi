# ProxiAI Working Rules

- Treat `docs/` as the source of truth and `docs/15_PHASE.md` as the execution roadmap.
- Implement only the current unchecked PHASE task. Do not edit unrelated files.
- Do not add a feature unless the approved documents are updated first.
- Keep MVP scope separate from roadmap and deferred scope.
- Preserve the documented architecture, naming, API envelopes, and folder structure.
- Preserve TypeScript strict mode and validate every external input with Zod.
- Keep controllers thin; place business logic in services or domain modules.
- Stop and report contradictory documentation or missing required information.
- Explain important logic and advanced concepts before or while implementing.

## Security Invariants

- Never change the chat order: authentication → organisation/permissions → validation → idempotency → rate limit → PII → risk → policy → cache → routing → provider → persistence → background jobs.
- Include `orgId` in every tenant-owned query.
- Never log raw prompts, responses, passwords, tokens, cookies, API keys, or secrets.
- A blocked prompt must make zero provider calls.
- Encryption failure must never fall back to plaintext.

## Completion Gate

- Add or update relevant tests for every implementation task.
- Run relevant tests, typecheck, and build.
- Update `docs/15_PHASE.md` and `PROJECT_MEMORY.md` after each completed task.
