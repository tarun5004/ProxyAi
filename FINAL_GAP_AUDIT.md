# Executive Verdict

ProxiAI has a strong security and release foundation: tenant isolation, RBAC,
prompt policy enforcement, encrypted-storage boundaries, append-only accounting
and audit records, container contracts, and coverage gates are implemented and
verified. The current build is not yet a safe recruiter-facing demo because one
public AI response fabricated provider and compliance claims, the shared demo
identity has unresolved abuse/privacy controls, and the admin journey is neither
self-contained nor presentation-ready.

This is an audit-only snapshot. No production behavior, infrastructure, data, or
secrets were changed. The intentional AWS deep-stop is treated as expected cost
control. AWS availability, ECS counts, ALB/NAT presence, and worker runtime checks
after shutdown are `DEFERRED_LIVE_VERIFICATION`, not defects.

## Evidence Summary

- Backend unit coverage: 269/269 tests passed; 78.24% lines, 83.46% branches.
- Critical backend modules: all approved modules passed the 90% branch gate.
- Frontend: 28/28 tests passed; 77.62% lines, 69.65% branches.
- Isolated integration rerun: 63/63 passed with Mongo replica set, isolated Redis,
  and isolated BullMQ.
- Full release harness: failed once at backend integration because six test files
  hit the fixed 30-second file timeout under concurrent execution. The same suite
  passed standalone in 57.3 seconds. This is unexplained release-gate flakiness.
- Backend/frontend lint, typecheck, build, dependency audit, security scan,
  deployment contract, index check, Docker builds, non-root runtime checks, and
  embedded-secret checks passed.
- Pre-shutdown public checks confirmed landing, login, logout, refresh, owned
  conversations, policy UI, healthy frontend/API targets, and public health
  endpoints. Post-shutdown AWS checks are intentionally deferred.

## Issue Index

| Severity | Count |
| --- | ---: |
| P0 | 1 |
| P1 | 6 |
| P2 | 14 |
| P3 | 7 |
| **Total** | **28** |

# P0

## GAP-001 — Unbounded product self-description fabricates security and compliance claims

- **Severity:** P0
- **Area:** AI Grounding, Security, Demo
- **Evidence:** A controlled live prompt asking what ProxiAI supports produced
  claims of SOC 2 Type II certification, AWS CloudHSM, quarterly key rotation,
  multiple unsupported providers, full request/response retention, and regional
  data residency. `backend/src/features/chat/chat.service.ts:309` sends only the
  user prompt to the provider and supplies no approved product-facts boundary.
- **Current behavior:** The model can confidently invent facts about ProxiAI.
- **Expected behavior:** Product questions must be answered only from a bounded,
  versioned product-facts context; unsupported facts must be stated as unknown or
  not implemented.
- **Why it matters:** Fabricated certifications and controls create legal,
  reputational, security-review, and recruiter-trust risk.
- **Fix recommendation:** Add a small canonical product-facts contract and a
  narrowly scoped system context for product self-description. Explicitly forbid
  claims not present in that contract. Keep ordinary user chat behavior unchanged.
- **Files likely affected:** `backend/src/features/chat/chat.service.ts`, a new
  bounded product-facts module, relevant chat tests, approved product docs.
- **Test required:** Provider-bound message test plus controlled fake-provider
  tests for providers, certification, HSM, retention, and PII behavior; assert no
  unsupported claim is emitted.
- **Safe to batch with:** GAP-019 and landing truthfulness remediation.
- **Breaking-change risk:** Medium; prompt behavior changes but API shape does not.
- **Classification:** P0, SECURITY, DEMO

# P1

## GAP-002 — Public demo is not self-service for a first-time recruiter

- **Severity:** P1
- **Area:** Recruiter Demo
- **Evidence:** Landing exposes `novastack` and `demo@novastack.demo` but states
  that the password is delivered separately. Login does not prefill the public
  identifiers.
- **Current behavior:** A recruiter arriving only through the public URL cannot
  complete the demo journey without an out-of-band credential.
- **Expected behavior:** Either provide a deliberately public, rotatable demo
  credential through an approved safe mechanism or clearly expose a request/demo
  access path without implying instant access.
- **Why it matters:** The primary portfolio conversion path stops at login.
- **Fix recommendation:** Choose one approved public-demo credential distribution
  model, add clear landing/login instructions, and keep the account EMPLOYEE-only.
- **Files likely affected:** marketing demo section, login screen, demo operations
  docs; no auth architecture change required.
- **Test required:** First-visit browser journey from `/` to authenticated `/chat`.
- **Safe to batch with:** GAP-003, GAP-015, GAP-022.
- **Breaking-change risk:** Low.
- **Classification:** P1, DEMO, UX

## GAP-003 — Shared public employee identity lacks a complete abuse and privacy envelope

- **Severity:** P1
- **Area:** Public Demo, Security
- **Evidence:** The seed correctly restricts the account to `EMPLOYEE` with only
  `chat:send` and `chat:view_own`, and FREE-plan chat RPM limits exist. However,
  every recruiter shares the same trusted user identity, conversation namespace,
  token budget, sessions, and titles. No conversation quota, session-count cap,
  automatic demo reset, or cleanup schedule was found.
- **Current behavior:** Separate visitors can see shared-account conversation
  metadata/titles and can consume a shared provider budget or create persistent
  clutter. Tenant isolation remains technically correct but does not isolate
  different people sharing one credential.
- **Expected behavior:** Public-demo usage must have bounded sessions,
  conversations, spend, retention, and cleanup, with no sensitive shared history.
- **Why it matters:** A public credential is an intentional adversarial surface.
- **Fix recommendation:** Keep `METADATA_ONLY`; add approved public-demo quotas,
  short session policy, deterministic reset/cleanup runbook or job, and monitoring.
  Do not enable shared encrypted history.
- **Files likely affected:** demo operations/config, session/conversation services,
  optional cleanup worker, docs.
- **Test required:** Session/conversation quota, cleanup idempotency, budget/rate
  limit, and cross-visitor metadata exposure acceptance tests.
- **Safe to batch with:** GAP-002 and GAP-015.
- **Breaking-change risk:** Medium; public demo behavior becomes intentionally bounded.
- **Classification:** P1, SECURITY, DEMO

## GAP-004 — No private ORG_ADMIN demo identity or executable admin-demo runbook

- **Severity:** P1
- **Area:** Admin Demo
- **Evidence:** The production demo seed provisions only the restricted employee.
  `backend/src/scripts/seed-dev-admin.ts` is development-only and targets another
  organisation. No private `novastack` admin demo provisioning path was found.
- **Current behavior:** The admin experience cannot be reliably demonstrated or
  regression-checked using a dedicated private identity.
- **Expected behavior:** A private, rotatable, idempotently provisioned ORG_ADMIN
  account for `novastack`, never published or hardcoded.
- **Why it matters:** Phase 8/9 admin value is invisible during an interview.
- **Fix recommendation:** Add an environment-gated production operations command
  for `admin-demo@novastack.demo` using current hashing, canonical ORG_ADMIN
  permissions, safe password input, and session revocation on reset.
- **Files likely affected:** a dedicated operations script, package script, secure
  deployment runbook; no registration route.
- **Test required:** Idempotent provision/reset, exact permissions, login, admin
  allow, employee deny, and no credential/hash output.
- **Safe to batch with:** Admin browser verification after GAP-005/GAP-012.
- **Breaking-change risk:** Medium because it changes live identity data; requires
  explicit operations approval.
- **Classification:** P1, ADMIN, DEMO, SECURITY

## GAP-005 — Privilege-changing admin controls execute immediately

- **Severity:** P1
- **Area:** Admin, Security, UX
- **Evidence:** Role/team selectors in
  `frontend/src/features/admin/admin-dashboard.tsx:390` mutate on selection.
  Confirmation is not consistently applied to privilege changes. Policy editing
  at line 358 sends numeric values without a client-side invariant preview.
- **Current behavior:** A misclick can alter role, team, status, or policy; an
  ORG_ADMIN grant is especially high impact.
- **Expected behavior:** Explicit review/confirmation for privilege, deactivation,
  retention, budget, and policy mutations, with clear before/after values.
- **Why it matters:** Backend authorization cannot prevent an authorized operator's
  accidental destructive or privilege-escalating action.
- **Fix recommendation:** Add typed confirmation dialogs, disable repeated submits,
  show safe mutation summaries, and preserve backend validation as authoritative.
- **Files likely affected:** admin dashboard components and focused frontend tests.
- **Test required:** Cancel/confirm paths, duplicate-submit prevention, ORG_ADMIN
  escalation confirmation, policy threshold boundary, backend failure rollback.
- **Safe to batch with:** GAP-012 and GAP-014.
- **Breaking-change risk:** Low.
- **Classification:** P1, ADMIN, SECURITY, UX

## GAP-006 — Long streaming responses do not auto-scroll

- **Severity:** P1
- **Area:** Chat UX, Demo
- **Evidence:** A live long response left the message viewport at `scrollTop=0`
  while `scrollHeight=2899` and `clientHeight=584`. The scroll container at
  `frontend/src/features/chat/chat-center.tsx:126` has no scroll ref/effect.
- **Current behavior:** Streamed content continues below the visible viewport.
- **Expected behavior:** Follow output while the user is near the bottom; preserve
  manual reading position when the user intentionally scrolls up.
- **Why it matters:** The core live-demo interaction appears frozen or broken.
- **Fix recommendation:** Add bottom-anchor/ref logic with near-bottom detection,
  stream-aware scrolling, and an accessible “jump to latest” control.
- **Files likely affected:** chat center and focused frontend tests.
- **Test required:** Long stream auto-follow, manual-scroll preservation, final
  chunk, and mobile viewport behavior.
- **Safe to batch with:** GAP-009, GAP-010, GAP-024.
- **Breaking-change risk:** Low.
- **Classification:** P1, CHAT, DEMO, UX

## GAP-007 — Canonical release integration gate is timing-flaky

- **Severity:** P1
- **Area:** Testing, Release
- **Evidence:** The full release harness cancelled six integration test files at
  the fixed 30-second file timeout (48 passed, 6 cancelled). Immediate standalone
  isolated rerun passed 63/63 in 57.3 seconds. Backend unit coverage also failed
  once at 268/269 and then passed 269/269 when rerun.
- **Current behavior:** A verified release can report failure depending on host
  contention and parallel integration startup.
- **Expected behavior:** Deterministic pass/fail evidence with bounded but realistic
  per-file/suite timeouts and isolated infrastructure lifecycle.
- **Why it matters:** CI cannot distinguish product failure from harness timing.
- **Fix recommendation:** Reproduce under CI load, identify the slow setup/teardown
  path, serialize only contending suites or assign a justified integration timeout,
  and retain fail-fast behavior for real hangs.
- **Files likely affected:** backend integration runner/package scripts and test
  infrastructure only unless a real lifecycle leak is proven.
- **Test required:** Repeat the complete integration gate at least three times and
  classify any intermittent failure.
- **Safe to batch with:** No product fixes; isolate as release engineering work.
- **Breaking-change risk:** Low if thresholds are evidence-based.
- **Classification:** P1, DEPLOYMENT, CLEANUP

# P2

## GAP-008 — Authenticated profile degrades after refresh/bootstrap

- **Severity:** P2
- **Area:** Auth UX
- **Evidence:** Login stores `response.data.user` in
  `frontend/src/features/auth/auth-provider.tsx:125`; bootstrap through `/auth/me`
  stores only auth context. Sidebar then falls back at
  `frontend/src/features/conversations/conversation-sidebar.tsx:46` to “ProxyAi
  User” and “Your workspace”. Live hard refresh reproduced the degradation.
- **Current behavior:** Identity and organisation labels disappear after refresh.
- **Expected behavior:** Stable safe profile across login, refresh, and direct URL.
- **Why it matters:** Session restoration looks broken and reduces user confidence.
- **Fix recommendation:** Align `/auth/me` safe profile contract with login or fetch
  a dedicated safe profile during bootstrap.
- **Files likely affected:** auth API/types/provider and backend auth response contract.
- **Test required:** Login then hard refresh preserves display name and organisation.
- **Safe to batch with:** GAP-022.
- **Breaking-change risk:** Medium; API response contract expands.
- **Classification:** P2, UX, API WIRING

## GAP-009 — Frontend ignores pagination cursors

- **Severity:** P2
- **Area:** API Wiring, UX
- **Evidence:** Conversation/message clients request fixed `limit=100` in
  `frontend/src/features/conversations/conversation.api.ts:33` and `:73`.
  Admin clients request one fixed page in `frontend/src/features/admin/admin.api.ts`.
  `nextCursor` is parsed but not consumed by UI workflows.
- **Current behavior:** Older conversations, messages, logs, alerts, users, and
  teams become inaccessible once the first page fills.
- **Expected behavior:** Bounded cursor pagination with load-more/infinite loading
  and independent admin section cursors.
- **Why it matters:** The UI silently presents incomplete data as complete.
- **Fix recommendation:** Add cursor state per resource and preserve tenant-scoped
  backend contracts.
- **Files likely affected:** conversation/admin API clients and feature state/UI.
- **Test required:** Multi-page load, stable ordering, refresh, duplicate prevention,
  and malformed cursor safe error.
- **Safe to batch with:** GAP-013.
- **Breaking-change risk:** Low.
- **Classification:** P2, API WIRING, UX, ADMIN

## GAP-010 — Interrupted chat has no retry action

- **Severity:** P2
- **Area:** Chat UX
- **Evidence:** Interrupted/error state is displayed, but no retry control or safe
  new-idempotency-key flow exists in the chat UI.
- **Current behavior:** User must manually copy/retype after a provider/network error.
- **Expected behavior:** Retry the same visible user input as a new explicit request,
  without unsafe replay or duplicate paid execution.
- **Why it matters:** Recovery from the most visible reliability failure is poor.
- **Fix recommendation:** Add explicit retry using a new client request ID, only
  after terminal failure is known; never replay a completed tombstone.
- **Files likely affected:** chat workspace/center and streaming client.
- **Test required:** Terminal error retry, no duplicate while streaming, aborted
  request behavior, and idempotency key rotation.
- **Safe to batch with:** GAP-006 and GAP-011.
- **Breaking-change risk:** Medium due to idempotency semantics.
- **Classification:** P2, CHAT, UX, DEMO

## GAP-011 — Chat lacks copy actions

- **Severity:** P2
- **Area:** Chat UX
- **Evidence:** No clipboard action exists for assistant or user messages.
- **Current behavior:** Users cannot reuse generated output conveniently.
- **Expected behavior:** Accessible copy controls with success/failure feedback.
- **Why it matters:** Copy is a baseline chat-product interaction and a visible demo gap.
- **Fix recommendation:** Add client-side clipboard controls; never log copied text.
- **Files likely affected:** message rendering components and tests.
- **Test required:** Copy success/failure and keyboard-accessible labels.
- **Safe to batch with:** GAP-006 and GAP-010.
- **Breaking-change risk:** Low.
- **Classification:** P2, CHAT, UX, DEMO

## GAP-012 — Admin UI presents implemented mutations as read-only/deferred

- **Severity:** P2
- **Area:** Admin, Docs Truthfulness
- **Evidence:** `frontend/src/features/admin/admin-dashboard.tsx:142` says “Read-only
  operational view”; lines 257 and 308 say mutations/alert resolution require
  Phase 9 even though those guarantees and mutations are implemented.
- **Current behavior:** UI contradicts executable behavior.
- **Expected behavior:** Labels accurately describe current capabilities and guardrails.
- **Why it matters:** Recruiters/operators may believe finished functionality is absent.
- **Fix recommendation:** Replace stale copy with truthful capability and audit language.
- **Files likely affected:** admin dashboard text and UI tests.
- **Test required:** Capability labels match visible controls for ORG_ADMIN and deny states.
- **Safe to batch with:** GAP-005.
- **Breaking-change risk:** None.
- **Classification:** P2, ADMIN, DOCS, DEMO

## GAP-013 — One failed admin request discards every dashboard section

- **Severity:** P2
- **Area:** Admin Reliability
- **Evidence:** Dashboard bootstrap uses one `Promise.all` at
  `frontend/src/features/admin/admin-dashboard.tsx:84`.
- **Current behavior:** A single logs/alerts/users/teams failure turns the whole
  admin dashboard into an error and hides successful data.
- **Expected behavior:** Independent section loading/error/retry with shared auth failure handling.
- **Why it matters:** Partial backend degradation makes all administration unusable.
- **Fix recommendation:** Use section-scoped state or settled results while preserving
  true 401 handling centrally.
- **Files likely affected:** admin dashboard state/components.
- **Test required:** One endpoint fails while remaining sections render and retry independently.
- **Safe to batch with:** GAP-009 and GAP-014.
- **Breaking-change risk:** Low.
- **Classification:** P2, ADMIN, UX

## GAP-014 — Admin mutations lack clear success and actionable safe failure feedback

- **Severity:** P2
- **Area:** Admin UX
- **Evidence:** Mutation controls show only generic “Update failed” at
  `frontend/src/features/admin/admin-dashboard.tsx:390`; success is implied by reload.
  Confirmation uses inconsistent native `window.confirm` at line 397.
- **Current behavior:** Operators cannot confidently tell what changed or why a
  safe validation/authorization failure occurred.
- **Expected behavior:** Consistent dialog, working/success/failure states, safe
  error code/message, and refreshed authoritative values.
- **Why it matters:** Ambiguous administration encourages repeated actions.
- **Fix recommendation:** Add shared mutation feedback and confirmation primitives;
  never expose sensitive backend details.
- **Files likely affected:** admin components and API error presentation.
- **Test required:** Working, success, safe failure, stale data refresh, and no duplicate submit.
- **Safe to batch with:** GAP-005 and GAP-013.
- **Breaking-change risk:** Low.
- **Classification:** P2, ADMIN, UX

## GAP-015 — Demo account has no approved deterministic reset/cleanup operation

- **Severity:** P2
- **Area:** Demo Operations
- **Evidence:** Public demo provisioning is idempotent, but no bounded operation was
  found to revoke stale public sessions and remove only approved demo-owned
  conversation metadata/accounting-safe disposable data.
- **Current behavior:** Demo clutter and session accumulation require ad hoc operations.
- **Expected behavior:** Explicit, auditable, narrowly scoped reset semantics that
  preserve append-only accounting/audit truth.
- **Why it matters:** Repeated recruiter use degrades the demo and increases abuse exposure.
- **Fix recommendation:** Define reset contract before code: what may be deleted,
  what remains append-only, session revocation, schedule, and dry-run evidence.
- **Files likely affected:** operations docs/script and optional scheduled worker.
- **Test required:** Scope guard, dry run, idempotency, foreign-org non-impact,
  RequestLog/AuditLog preservation.
- **Safe to batch with:** GAP-003.
- **Breaking-change risk:** High if deletion boundaries are wrong; requires contract approval.
- **Classification:** P2, DEMO, DEPLOYMENT, SECURITY

## GAP-016 — Retention mode is not visible before a user sends content

- **Severity:** P2
- **Area:** Retention UX
- **Evidence:** Metadata-only history is explained after opening retained summaries,
  but the composer/workspace does not prominently state current retention mode
  before submission.
- **Current behavior:** Users learn that content is unavailable only after the fact.
- **Expected behavior:** A concise pre-send retention indicator explaining whether
  content is not stored or encrypted for owner-authorized history.
- **Why it matters:** Storage expectations are a core privacy decision.
- **Fix recommendation:** Expose safe current organisation retention mode through an
  approved auth/workspace contract and render a short non-alarming explanation.
- **Files likely affected:** safe organisation/auth response, workspace/policy UI.
- **Test required:** METADATA_ONLY and ENCRYPTED_STORAGE labels, no key/cipher metadata.
- **Safe to batch with:** GAP-008.
- **Breaking-change risk:** Medium due to API contract addition.
- **Classification:** P2, RETENTION, UX, SECURITY

## GAP-017 — Conversation navigation becomes indistinguishable at scale

- **Severity:** P2
- **Area:** Conversation UX
- **Evidence:** The live demo showed three entries titled “New conversation”. Manual
  rename exists, but discovery is weak and no automatic title is approved.
- **Current behavior:** Users cannot distinguish conversations until manually renaming each.
- **Expected behavior:** Keep manual-only naming but make rename discoverable and add
  safe secondary metadata such as last activity.
- **Why it matters:** History navigation quickly looks unfinished.
- **Fix recommendation:** Add visible rename affordance/onboarding and timestamps;
  do not derive titles from prompts or an LLM.
- **Files likely affected:** conversation sidebar/title editor.
- **Test required:** Rename discovery, keyboard flow, duplicate default titles, mobile.
- **Safe to batch with:** GAP-009 and GAP-023.
- **Breaking-change risk:** Low.
- **Classification:** P2, CHAT, UX, DEMO

## GAP-018 — Audit operations are export-only and fixed-window

- **Severity:** P2
- **Area:** Admin, Audit UX
- **Evidence:** Audit export exists, but no first-class AuditLog browse/filter UI was
  found. Export is fixed to a recent 30-day window without operator date/filter controls.
- **Current behavior:** Admin cannot investigate events before exporting a fixed slice.
- **Expected behavior:** Tenant-scoped, bounded AuditLog browse plus safe date/event/
  actor filters and explicit export range.
- **Why it matters:** Append-only audit data is difficult to use operationally.
- **Fix recommendation:** Add a bounded admin audit read contract/UI only if not
  already exposed, reuse opaque pagination, preserve CSV injection protection.
- **Files likely affected:** admin audit API/service/controller and frontend admin feature.
- **Test required:** Tenant isolation, permissions, pagination, filters, date bounds,
  CSV safety, and large-export limits.
- **Safe to batch with:** GAP-009 and GAP-013.
- **Breaking-change risk:** Medium if a new API route is needed.
- **Classification:** P2, ADMIN, SECURITY, API WIRING

## GAP-019 — Landing release evidence is stale and “certified” wording is misleading

- **Severity:** P2
- **Area:** Landing, Truthfulness
- **Evidence:** `frontend/src/features/marketing/components/release-evidence.tsx:6`
  hardcodes 78.12% backend and 77.20% frontend, while current evidence is 78.24%
  and 77.62%. Line 19 says “CERTIFIED RELEASE EVIDENCE”.
- **Current behavior:** Public evidence drifts after every release and may be read as
  external certification.
- **Expected behavior:** Truthful, dated, internally verified release evidence with
  no certification implication.
- **Why it matters:** The product must not overstate assurance.
- **Fix recommendation:** Rename to “Verified release evidence”, include commit/date,
  and generate values from a checked release artifact or remove unstable numbers.
- **Files likely affected:** landing release section and release evidence generation.
- **Test required:** No prohibited certification copy; displayed evidence matches artifact.
- **Safe to batch with:** GAP-001 and GAP-020.
- **Breaking-change risk:** None.
- **Classification:** P2, DOCS, DEMO, SECURITY

## GAP-020 — Approved documentation contains stale implementation and deployment state

- **Severity:** P2
- **Area:** Documentation
- **Evidence:** `docs/05_OPENAPI_SPEC.md:460` says auth rate limiting and missing-user
  timing equalization remain pending although implemented. `docs/07_DEPLOYMENT_ARCHITECTURE.md:33`
  retains obsolete Upstash/credential blocker language. `PROJECT_MEMORY.md` contains
  older auth-smoke blocker context that no longer matches verified behavior.
- **Current behavior:** Readers receive conflicting status depending on document section.
- **Expected behavior:** Current executable behavior and accepted limitations are
  reflected consistently without rewriting historical evidence.
- **Why it matters:** Stale security/deployment statements cause incorrect fixes and interview confusion.
- **Fix recommendation:** Perform a scoped stale-contract cleanup with source/tests as truth.
- **Files likely affected:** listed docs and phase/memory status sections.
- **Test required:** Targeted stale phrase scan and docs diff review.
- **Safe to batch with:** GAP-019 and GAP-021.
- **Breaking-change risk:** None.
- **Classification:** P2, DOCS, DEPLOYMENT

## GAP-021 — Production observability hosting and alert delivery remain unresolved

- **Severity:** P2
- **Area:** Observability, Operations
- **Evidence:** `docs/14_OBSERVABILITY_DOCUMENTATION.md:1672` leaves Prometheus/Grafana
  hosting and production alert thresholds unresolved, while lines 1700-1701 define
  an operational dashboard/alerts as completion expectations. No deployed scraper,
  Grafana service, or alert delivery integration was found in the ECS runtime contract.
- **Current behavior:** Instrumentation, metrics endpoint protection, runbooks, and
  safe structured logs exist, but continuous collection and human notification are absent.
- **Expected behavior:** Approved low-cost metrics/alert deployment or an explicit
  waiver with manual operational checks.
- **Why it matters:** Queue/provider/accounting failures may remain invisible.
- **Fix recommendation:** Resolve hosting, retention, safe alert thresholds, and
  recipient/channel contract before implementation. Add deep-stop maintenance handling.
- **Files likely affected:** observability/deployment docs and later IaC/config.
- **Test required:** Alert simulation, heartbeat/provider/queue failure delivery,
  cardinality and secret checks, maintenance suppression.
- **Safe to batch with:** GAP-020 documentation resolution first.
- **Breaking-change risk:** Medium; recurring cost and external service decisions.
- **Classification:** P2, DEPLOYMENT, DOCS

# P3

## GAP-022 — Anonymous landing/login bootstrap emits expected 401 console noise

- **Severity:** P3
- **Area:** Auth UX, Operations
- **Evidence:** First anonymous page load calls refresh and logs a browser 401 even
  though the public UI renders correctly.
- **Current behavior:** Recruiter DevTools shows a red auth error before login.
- **Expected behavior:** Anonymous bootstrap remains safe without presenting an
  expected missing-cookie state as an application error.
- **Why it matters:** It looks like a broken production page during technical review.
- **Fix recommendation:** Preserve generic refresh security while treating missing
  local refresh-cookie state as anonymous in the frontend/bootstrap contract.
- **Files likely affected:** auth provider/client; backend behavior may not need change.
- **Test required:** First anonymous load, expired/invalid cookie, and true transient failure.
- **Safe to batch with:** GAP-008.
- **Breaking-change risk:** Low.
- **Classification:** P3, UX

## GAP-023 — Login lacks a clear return-to-home path and demo identifier assist

- **Severity:** P3
- **Area:** Login UX
- **Evidence:** Login screen has no visible home/back link and requires retyping public
  organisation/email even when arriving from the landing demo CTA.
- **Current behavior:** User must use browser navigation and manually transfer identifiers.
- **Expected behavior:** Branded logo/home link and safe prefill for non-secret demo identifiers.
- **Why it matters:** Minor friction in the recruiter funnel.
- **Fix recommendation:** Add home link and explicit demo-login CTA/query state; never prefill password.
- **Files likely affected:** login screen and marketing CTA.
- **Test required:** Home navigation and identifier-only prefill.
- **Safe to batch with:** GAP-002.
- **Breaking-change risk:** Low.
- **Classification:** P3, DEMO, UX

## GAP-024 — Messages lack visible timestamps

- **Severity:** P3
- **Area:** Chat UX
- **Evidence:** Current live message presentation does not display created/received time.
- **Current behavior:** Users cannot correlate conversation order with time, especially after refresh.
- **Expected behavior:** Localized, accessible timestamps from authoritative metadata where available.
- **Why it matters:** History and interruption diagnosis are less clear.
- **Fix recommendation:** Display safe createdAt for historical summaries and client
  receipt/completion time for ephemeral stream messages without pretending persistence.
- **Files likely affected:** message view/types.
- **Test required:** Timestamp formatting, timezone, missing timestamp, accessibility.
- **Safe to batch with:** GAP-006 and GAP-017.
- **Breaking-change risk:** Low.
- **Classification:** P3, CHAT, UX

## GAP-025 — Safe Markdown renderer shows literal provider HTML tokens

- **Severity:** P3
- **Area:** Chat Rendering
- **Evidence:** A live table response containing `<br>` displayed the literal text.
  The renderer correctly avoids raw HTML injection.
- **Current behavior:** Some provider Markdown looks visually rough.
- **Expected behavior:** Safe Markdown/GFM remains XSS-safe while common formatting is readable.
- **Why it matters:** Output can look unpolished, but enabling raw HTML would be unsafe.
- **Fix recommendation:** Do not enable unsanitized HTML. Prefer prompt guidance or a
  narrowly safe text transform outside code fences if product-approved.
- **Files likely affected:** assistant Markdown renderer or bounded provider formatting instruction.
- **Test required:** Literal HTML, script payload, tables, code fences, links.
- **Safe to batch with:** GAP-001 formatting context.
- **Breaking-change risk:** Medium if transforming model text.
- **Classification:** P3, CHAT, UX, SECURITY

## GAP-026 — Policy inspector displays a hardcoded model before routing evidence exists

- **Severity:** P3
- **Area:** Policy UI, Truthfulness
- **Evidence:** `frontend/src/features/policy/policy-inspector.tsx:96` falls back to
  `openai/gpt-oss-20b` when no completion metadata exists.
- **Current behavior:** UI implies a model was selected before a routed/completed request.
- **Expected behavior:** Show “Not routed”/“Pending” until authoritative SSE metadata arrives.
- **Why it matters:** It blurs policy decision and provider execution state.
- **Fix recommendation:** Remove model-specific display fallback; use explicit state labels.
- **Files likely affected:** policy inspector and tests.
- **Test required:** Empty, routing, fallback, completed, and blocked states.
- **Safe to batch with:** GAP-012 truthfulness copy.
- **Breaking-change risk:** Low.
- **Classification:** P3, UX, DOCS

## GAP-027 — Superseded Lightsail deployment artifacts remain active-looking

- **Severity:** P3
- **Area:** Dead Code Candidate, Deployment
- **Evidence:** Lightsail workflow/scripts remain in the repository while ECS/Fargate
  is canonical and docs describe Lightsail as superseded/unexecuted.
- **Current behavior:** Operators may choose the wrong release path.
- **Expected behavior:** One canonical deployment entrypoint; historical experiment
  clearly archived or removed after rollback-value review.
- **Why it matters:** Duplicate deployment paths increase operational error risk.
- **Fix recommendation:** Verify no current CI/manual dependency, then archive docs or
  delete the workflow/scripts in a dedicated cleanup commit.
- **Files likely affected:** `.github/workflows/lightsail-deploy.yml`, `deploy/lightsail/`, docs.
- **Test required:** Repository reference scan and canonical ECS deployment contract.
- **Safe to batch with:** GAP-020.
- **Breaking-change risk:** Medium if still used as emergency rollback.
- **Classification:** P3, CLEANUP, DEPLOYMENT

## GAP-028 — Several core modules are maintainability hotspots

- **Severity:** P3
- **Area:** Cleanup, Maintainability
- **Evidence:** Large files include `auth.service.ts` (~856 lines), `chat.service.ts`
  (~664), `groq-provider.adapter.ts` (~515), `bullmq.ts` (~463),
  `provider-fallback.ts` (~452), `metrics.ts` (~451), admin dashboard (~400), and
  chat workspace (~334).
- **Current behavior:** Multiple responsibilities and state transitions are difficult
  to review safely.
- **Expected behavior:** Cohesive modules with unchanged contracts and explicit lifecycle boundaries.
- **Why it matters:** Future security fixes carry broader regression risk.
- **Fix recommendation:** Refactor only after demo-critical gaps, one behavior-preserving
  boundary at a time, with existing coverage held constant or improved.
- **Files likely affected:** Listed hotspots and focused tests.
- **Test required:** Existing release harness plus characterization tests before each split.
- **Safe to batch with:** Nothing functional; separate cleanup commits.
- **Breaking-change risk:** High if attempted as one refactor.
- **Classification:** P3, CLEANUP

# Recruiter Demo Gaps

- GAP-001 blocks truthful product demonstration.
- GAP-002 blocks self-service entry.
- GAP-003 and GAP-015 leave shared-account abuse and cleanup unresolved.
- GAP-004 prevents a repeatable private admin demo.
- GAP-006, GAP-011, GAP-017, and GAP-023 make the workflow look prototype-like.

# Chat UX Gaps

- No long-stream auto-follow (GAP-006).
- No safe terminal retry (GAP-010).
- No copy actions (GAP-011).
- Repeated default titles are hard to distinguish (GAP-017).
- No timestamps (GAP-024).
- Literal HTML tokens may look rough while correctly remaining escaped (GAP-025).
- Provider/model state is presented before evidence (GAP-026).

# Retention Gaps

- No plaintext persistence defect was found.
- `METADATA_ONLY` correctly omits content and reports unavailable history.
- `ENCRYPTED_STORAGE` stores ciphertext only and owner-scoped decryption is covered.
- Partial/interrupted assistant output is correctly not persisted.
- Remaining gap: pre-send retention visibility (GAP-016).
- The public shared demo should remain `METADATA_ONLY`; encrypted shared history
  would increase cross-visitor privacy risk.

# AI Grounding Gaps

- GAP-001 is the only P0 and must be remediated before another public AI product-facts demo.
- GAP-025 is formatting-only and must not be “fixed” by enabling unsafe raw HTML.

# Admin Gaps

- Private admin identity/runbook absent (GAP-004).
- Privilege-changing controls need explicit confirmation (GAP-005).
- Capability labels are stale (GAP-012).
- Dashboard failure handling is all-or-nothing (GAP-013).
- Mutation feedback is weak (GAP-014).
- Audit browse/filter/export controls are incomplete (GAP-018).

# Permission Gaps

- No current backend EMPLOYEE-to-admin permission bypass was found.
- Public demo seed has the exact approved `chat:send` and `chat:view_own` permissions.
- Tenant/RBAC/IDOR release matrices pass in isolated integration.
- Cross-team resource semantics remain out of scope because no team-owned resource
  model exists; this is not a current defect.

# API Wiring Gaps

- No confirmed wrong route, method, request body, stale frontend endpoint, or
  frontend call without a backend route was found.
- GAP-008 is a response-capability mismatch for stable profile display.
- GAP-009 is incomplete cursor consumption, not a backend pagination defect.
- GAP-018 may require a new approved audit-read route if current export contract is insufficient.

# Security Gaps

- P0 product/compliance hallucination: GAP-001.
- Shared credential abuse/privacy envelope: GAP-003.
- Accidental privileged admin actions: GAP-005.
- Public demo cleanup boundaries: GAP-015.
- Retention expectation visibility: GAP-016.
- Misleading release certification language: GAP-019.
- No regression was found in tenant isolation, IDOR, JWT verification, refresh
  rotation/reuse detection, password hashing, exact-origin CORS, policy BLOCK/MASK,
  encryption fallback prevention, AuditLog append-only behavior, CSV injection,
  logging redaction, metrics cardinality, or public metrics protection.

# Frontend/Responsive Gaps

- Widths 375, 390, 768, 1024, 1280, and 1440 showed no horizontal overflow.
- Mobile navigation/drawer, login, landing, and chat layout were usable.
- MUST_FIX: GAP-006, GAP-008, GAP-010, GAP-012, GAP-013, GAP-014.
- NICE_TO_HAVE: GAP-011, GAP-017, GAP-023, GAP-024, GAP-025, GAP-026.

# Deployment Gaps

- Intentional deep-stop state is excluded from defect counts.
- `DEFERRED_LIVE_VERIFICATION`: deep-start restoration, ECS desired/running counts,
  worker heartbeat, ALB/NAT recreation, Route53/ACM/public health, Atlas NAT path,
  Upstash path from ECS, and immutable deployed SHA after the next start.
- Static deployment/IaC, index, PowerShell/shell syntax, image builds, non-root
  containers, and embedded-secret checks pass.
- Remaining non-AWS issues are release-gate flakiness (GAP-007), unresolved
  observability delivery (GAP-021), and stale/superseded deployment docs/artifacts
  (GAP-020, GAP-027).

# Docs/Truthfulness Gaps

- Landing release evidence and “certified” wording: GAP-019.
- OpenAPI/deployment/memory stale status: GAP-020.
- Admin stale Phase 9/read-only labels: GAP-012.
- Policy inspector inferred model: GAP-026.
- No source evidence supports public claims of SOC 2 certification, HSM backing,
  automatic key rotation, or the extra providers produced by the model.

# Dead Code Candidates

## DC-01 — Lightsail release path

- **Candidate:** `.github/workflows/lightsail-deploy.yml`, `deploy/lightsail/`.
- **Why likely unused:** ECS/Fargate is canonical; docs call Lightsail superseded.
- **How verified:** Repository workflow/docs/reference scan.
- **Deletion risk:** Medium; may still be valued as rollback history. Confirm before deletion.
- **Mapped issue:** GAP-027.

## DC-02 — Oversized multi-responsibility modules

- **Candidate:** Files listed in GAP-028.
- **Why candidate:** Size and mixed lifecycle/domain responsibilities increase change risk.
- **How verified:** Source line inventory; no claim that code is unreachable.
- **Deletion risk:** High; refactor, do not delete.
- **Mapped issue:** GAP-028.

No empty source/docs files, production `console.log`, tracked environment files,
obvious unused runtime dependency, or test-only fake provider wired into production
was confirmed. No deletion is recommended without a dedicated dependency/reference scan.

# Nice-to-Have Product Improvements

| Improvement | Classification | Reason |
| --- | --- | --- |
| Copy message | REQUIRED_FOR_DEMO | Baseline output reuse; GAP-011 |
| Retry interrupted response | REQUIRED_FOR_DEMO | Recovery path; GAP-010 |
| Private admin demo login | REQUIRED_FOR_DEMO | Admin value demonstration; GAP-004 |
| Retention visibility | REQUIRED_FOR_DEMO | Pre-send privacy expectation; GAP-016 |
| Public demo reset/cleanup | REQUIRED_FOR_DEMO | Abuse and repeatability; GAP-015 |
| Regenerate response | GOOD_AFTER_DEMO | Useful but requires explicit idempotency/accounting UX |
| Delete conversation | GOOD_AFTER_DEMO | Requires retention/audit contract and cross-tenant DELETE gate |
| Conversation export | GOOD_AFTER_DEMO | Requires safe encrypted-content/export contract |
| Attachments | DEFER | Upload/storage/MIME/malware/provider contract remains unapproved |

# Admin Demo Account Plan

- Organisation: existing `novastack`, resolved from trusted database slug.
- Identity: `admin-demo@novastack.demo`; private and never shown on landing.
- Role: `ORG_ADMIN`.
- Permissions: canonical mapping only: `chat:send`, `chat:view_own`,
  `team:view_logs`, `admin:view_logs`, `admin:view_billing`,
  `admin:manage_users`, `admin:configure_policy`, `admin:export_audit`.
- Provisioning: idempotent, explicit production-operations command using existing
  Organisation/User models and Argon2 helper; no validation bypass.
- Secret input: protected process/deployment secret, never a CLI argument that is
  retained in history, never printed, never committed.
- Reset: update only this account, revoke its refresh sessions, emit safe audit
  evidence, and verify hash through the existing password helper.
- Verification: login, `/auth/me`, all admin allow paths, public employee deny,
  mutation auditing, logout/refresh revocation.
- Status: design only; no user was created by this audit.

# Public Demo Account Plan

- Preserve `novastack` / `demo@novastack.demo` as `EMPLOYEE` with exactly
  `chat:send` and `chat:view_own`.
- Keep `METADATA_ONLY`; do not expose shared encrypted history.
- Retain existing FREE-plan user/org RPM limits and monthly budget enforcement.
- Approve explicit session and conversation caps before implementation.
- Define an auditable cleanup/reset contract that revokes stale sessions and
  removes only approved disposable demo metadata while preserving RequestLog and AuditLog.
- Monitor provider spend, rate-limit rejection, unknown usage, queue failures, and
  demo account session growth.
- Use a rotatable password distribution mechanism; never commit or expose hashes.

# Consolidated Remediation Plan

## REM-01 — Bound product self-description

- **Task ID:** REM-01
- **Issue IDs:** GAP-001, GAP-025
- **Owner area:** Backend chat/security
- **Files:** Chat service, product-facts contract, tests, approved docs
- **Dependencies:** Approved exact product facts and unsupported-claim wording
- **Tests:** Provider-bound prompt contract and product-question matrix
- **Expected commit:** `fix(chat): prevent unsupported product and compliance claims`
- **Can run parallel:** No; first safety gate
- **Risk:** Medium

## REM-02 — Harden and operationalize public demo access

- **Task ID:** REM-02
- **Issue IDs:** GAP-002, GAP-003, GAP-015, GAP-023
- **Owner area:** Demo operations/auth UX
- **Files:** Demo access UI, login, approved operations contract/script, docs
- **Dependencies:** Public credential distribution, caps, cleanup/deletion approval
- **Tests:** First-visit journey, exact permissions, quota/session limits, cleanup isolation
- **Expected commit:** `feat(demo): add bounded self-service employee demo access`
- **Can run parallel:** After demo contract approval; UI and operations can split ownership
- **Risk:** High because cleanup and shared access are security-sensitive

## REM-03 — Provision private admin demo safely

- **Task ID:** REM-03
- **Issue IDs:** GAP-004
- **Owner area:** Operations/auth
- **Files:** Dedicated provisioning script, package command, runbook
- **Dependencies:** Protected password input and explicit live data approval
- **Tests:** Idempotent reset, exact permissions, session revocation, no secret output
- **Expected commit:** `chore(demo): add private novastack admin provisioning`
- **Can run parallel:** Yes, with frontend-only work after contract approval
- **Risk:** Medium

## REM-04 — Make admin mutations safe and truthful

- **Task ID:** REM-04
- **Issue IDs:** GAP-005, GAP-012, GAP-013, GAP-014
- **Owner area:** Frontend admin
- **Files:** Admin dashboard split components/state and focused tests
- **Dependencies:** None beyond current APIs
- **Tests:** Confirmation, partial failures, success/error, duplicate prevention, RBAC
- **Expected commit:** `fix(admin): add safe mutation confirmation and section recovery`
- **Can run parallel:** Yes, separate from backend chat
- **Risk:** Medium

## REM-05 — Restore polished chat interaction

- **Task ID:** REM-05
- **Issue IDs:** GAP-006, GAP-010, GAP-011, GAP-017, GAP-024, GAP-026
- **Owner area:** Frontend chat/conversations/policy
- **Files:** Chat center/workspace, sidebar, policy inspector, tests
- **Dependencies:** Retry/idempotency UX decision
- **Tests:** Auto-scroll, retry, copy, title discovery, timestamps, routing states, mobile
- **Expected commit:** `fix(chat): improve streaming recovery and conversation usability`
- **Can run parallel:** Yes, except retry contract review
- **Risk:** Medium

## REM-06 — Align stable profile and retention context

- **Task ID:** REM-06
- **Issue IDs:** GAP-008, GAP-016, GAP-022
- **Owner area:** Auth API/frontend
- **Files:** Auth response types/controller/provider, workspace retention UI
- **Dependencies:** Approved safe `/auth/me` profile/retention fields
- **Tests:** Anonymous bootstrap, hard refresh profile, retention labels, no sensitive settings
- **Expected commit:** `fix(auth): preserve safe workspace context across refresh`
- **Can run parallel:** Yes, after API contract update
- **Risk:** Medium

## REM-07 — Complete bounded admin and conversation pagination

- **Task ID:** REM-07
- **Issue IDs:** GAP-009, GAP-018
- **Owner area:** API/frontend admin and conversations
- **Files:** API clients, UI cursor state, possible audit read endpoint, tests
- **Dependencies:** Audit browse API contract decision
- **Tests:** Multi-page, tenant isolation, opaque cursors, filters, export bounds
- **Expected commit:** `feat(admin): add bounded audit browsing and cursor pagination`
- **Can run parallel:** Conversation and admin UI parts can split after contract approval
- **Risk:** Medium

## REM-08 — Stabilize deterministic release verification

- **Task ID:** REM-08
- **Issue IDs:** GAP-007
- **Owner area:** Test/release infrastructure
- **Files:** Integration runner/package scripts only unless a lifecycle defect is proven
- **Dependencies:** Three-run timing evidence under CI-like contention
- **Tests:** Repeated full integration and full release harness
- **Expected commit:** `fix(test): stabilize isolated integration release timing`
- **Can run parallel:** Yes
- **Risk:** Low

## REM-09 — Align public and internal truthfulness

- **Task ID:** REM-09
- **Issue IDs:** GAP-019, GAP-020
- **Owner area:** Landing/docs/release evidence
- **Files:** Release evidence component, OpenAPI, deployment docs, phase/memory
- **Dependencies:** Current verified release artifact
- **Tests:** Stale phrase scan, unsupported claim scan, landing test
- **Expected commit:** `docs(release): align public evidence and current deployment status`
- **Can run parallel:** After REM-01 wording is approved
- **Risk:** Low

## REM-10 — Resolve production observability delivery

- **Task ID:** REM-10
- **Issue IDs:** GAP-021
- **Owner area:** Observability/deployment
- **Files:** Observability contract, deployment config/IaC after approval
- **Dependencies:** Hosting/provider, cost, alert destination, thresholds
- **Tests:** Failure alert simulation, maintenance suppression, secret/cardinality scan
- **Expected commit:** `docs(observability): approve production metrics and alert delivery`
- **Can run parallel:** Contract audit only
- **Risk:** Medium

## REM-11 — Remove or archive superseded deployment path

- **Task ID:** REM-11
- **Issue IDs:** GAP-027
- **Owner area:** Deployment cleanup
- **Files:** Lightsail workflow/scripts and deployment docs
- **Dependencies:** Confirm no rollback/CI dependency
- **Tests:** Reference scan and canonical ECS deployment contract
- **Expected commit:** `chore(deploy): archive superseded Lightsail release path`
- **Can run parallel:** After REM-09
- **Risk:** Medium

## REM-12 — Refactor maintainability hotspots incrementally

- **Task ID:** REM-12
- **Issue IDs:** GAP-028
- **Owner area:** Backend/frontend cleanup
- **Files:** One hotspot per commit
- **Dependencies:** Demo/security remediation complete and characterization tests present
- **Tests:** Full affected suites and unchanged public contracts
- **Expected commit:** `refactor(<scope>): isolate <specific responsibility>`
- **Can run parallel:** No overlapping files; defer until demo-critical work is stable
- **Risk:** High if bundled

# Verification Record

## Passed

- Backend dependency audit, lint, typecheck, 269/269 unit tests, coverage, critical
  coverage, and build.
- Frontend dependency audit, lint, typecheck, 28/28 tests, coverage, and build.
- Isolated Mongo/Redis/BullMQ integration rerun: 63/63.
- Security scan, secret/artifact scan, deployment contract, index check, diff check.
- Frontend and backend Docker builds; non-root runtime and embedded-secret contract.
- Pre-shutdown public landing/login/logout/session/conversation/chat/policy checks.
- Responsive checks at all requested widths with no horizontal overflow.

## Failures and Deferred Evidence

- Full release harness backend integration timed out six files at 30 seconds under
  concurrent execution; standalone rerun passed. Classified GAP-007, not hidden.
- One backend coverage run passed 268/269 before an immediate isolated 269/269 pass;
  this supports the same flakiness investigation.
- AI grounding live test failed safety/truthfulness expectations; GAP-001.
- Long-response auto-scroll live check failed; GAP-006.
- All checks requiring a running AWS environment after the intentional deep-stop
  are `DEFERRED_LIVE_VERIFICATION` and are not availability defects.

