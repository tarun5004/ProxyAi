# ProxiAI Technical Design Document (TDD)

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | Technical Design Document |
| Version | 1.0 |
| Status | MVP Implementation Baseline |
| Intended audience | Solo developer, reviewer, tester, interviewer |
| Primary inputs | `01_PRD.md`, `02_SDD.md`, and ProxiAI Architecture Document v2.0 |
| Scope rule | No feature beyond the approved beginner-friendly MVP is introduced |
| Delivery approach | Five-week solo-developer implementation |

## 2. Purpose

This document converts the approved ProxiAI product and system design into implementable technical specifications. It defines modules, TypeScript contracts, request pipelines, validation rules, persistence behaviour, Redis keys, queue jobs, provider integration boundaries, failure handling, testing expectations, and the recommended build sequence.

The goal is to let one developer implement the MVP without repeatedly redesigning core flows. This document deliberately avoids advanced distributed-system features that are not required for the first working release.

## 3. Technical Scope Guardrails

### 3.1 Included in this TDD

- Node.js, Express, and TypeScript backend
- React and TypeScript frontend boundaries
- MongoDB persistence through Mongoose
- Redis for idempotency, provider health, rate limiting, and BullMQ; prompt-cache implementation deferred to Phase 9 prerequisites
- JWT access tokens and rotating refresh tokens
- Organisation-scoped RBAC
- Conversations and messages
- Three provider adapters behind one interface
- Regex-based PII and secret detection
- Static classification and weighted risk score
- Policy actions: `ALLOW`, `ALLOW_WITH_MASK`, and `BLOCK`
- Manual routing and simple automatic routing
- Retry, exponential backoff, jitter, circuit breaker, and fallback
- SSE streaming
- Metadata-only and encrypted-storage retention modes
- BullMQ workers for billing, analytics, anomaly, email, and health checks
- Append-only audit logging
- Basic admin metrics and filtered logs
- Pino logs, health endpoints, Docker, ECS/Fargate, and CloudWatch logs

### 3.2 Explicitly deferred

- `REQUIRE_APPROVAL` workflow
- SSO or SAML
- Full BYOK support
- ML-based PII or intent models
- Kafka or another external event-stream platform
- Multi-region deployment
- Distributed circuit-breaker state
- Seamless provider switching after partial streaming
- Full-text search over encrypted prompt content
- Advanced payment automation
- Custom policy language
- Compliance certification

## 4. Technology Baseline

| Area | Technology | MVP decision |
|---|---|---|
| Backend runtime | Node.js 20 LTS | Single backend codebase |
| Backend language | TypeScript | `strict: true` |
| HTTP framework | Express | Feature routers |
| Validation | Zod | Validate every external input |
| Database | MongoDB 7 | Mongoose models and indexes |
| Cache and queue | Redis 7 | One Redis deployment for MVP |
| Jobs | BullMQ | Separate API and worker processes |
| Frontend | React + TypeScript | Vite recommended |
| Styling | Tailwind CSS | Basic responsive UI |
| Authentication | JWT + opaque refresh token | Rotation and reuse detection |
| Logging | Pino | Structured JSON with redaction |
| Metrics | prom-client | `/metrics` endpoint |
| Containers | Docker + Compose | Local parity with deployment |
| Deployment | AWS ECS/Fargate | GitHub Actions with protected immutable-digest promotion |

## 5. Backend Project Structure

```text
backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── worker.ts
│   ├── config/
│   │   ├── env.ts
│   │   ├── constants.ts
│   │   └── featureFlags.ts
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts
│   │   │   ├── auth.types.ts
│   │   │   └── refreshToken.model.ts
│   │   ├── organisations/
│   │   ├── users/
│   │   ├── conversations/
│   │   ├── chat/
│   │   ├── pii/
│   │   ├── policy/
│   │   ├── routing/
│   │   ├── providers/
│   │   ├── retention/
│   │   ├── audit/
│   │   ├── billing/
│   │   ├── alerts/
│   │   └── admin/
│   ├── shared/
│   │   ├── database/
│   │   ├── redis/
│   │   ├── queues/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── responses/
│   │   ├── logging/
│   │   ├── metrics/
│   │   ├── crypto/
│   │   ├── utils/
│   │   └── types/
│   └── workers/
│       ├── analytics.worker.ts
│       ├── billing.worker.ts
│       ├── anomaly.worker.ts
│       ├── email.worker.ts
│       └── healthCheck.worker.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── Dockerfile
├── package.json
└── tsconfig.json
```

### 5.1 Module rule

Each feature owns its route, controller, service, schemas, types, and repository code. Shared code may be used only when it is genuinely cross-cutting, such as errors, logging, authentication middleware, database clients, Redis clients, and response helpers.

## 6. TypeScript Configuration

Recommended `tsconfig.json` rules:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true
  }
}
```

No `any` should be used in business logic. External SDK responses may initially be typed as `unknown`, then parsed or narrowed inside the provider adapter.

## 7. Environment Configuration

### 7.1 Required variables

```text
NODE_ENV
PORT
MONGO_URI
REDIS_URL
JWT_ACCESS_SECRET
AUTH_RATE_LIMIT_SECRET
ACCESS_TOKEN_TTL_MINUTES
REFRESH_TOKEN_TTL_DAYS
CHAT_RATE_LIMIT_FREE_USER_RPM
CHAT_RATE_LIMIT_FREE_ORG_RPM
CHAT_RATE_LIMIT_PRO_USER_RPM
CHAT_RATE_LIMIT_PRO_ORG_RPM
CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM
CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM
IDEMPOTENCY_PROCESSING_TTL_SECONDS
IDEMPOTENCY_COMPLETED_TTL_SECONDS
MESSAGE_ENCRYPTION_KEYS_JSON
MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION
GROQ_API_KEY
GEMINI_API_KEY
THIRD_PROVIDER_API_KEY
FRONTEND_ORIGIN
LOG_LEVEL
```

Email-provider environment variables are intentionally absent. P7-08 approves
the safe notification contract but does not select a delivery provider,
credential name, sender identity, timeout, or rendered template content. Those
values must be documented and validated before email delivery is implemented.

### 7.2 Validation

`config/env.ts` must parse environment variables once during startup using Zod. The application must terminate immediately when required values are missing or malformed.

```ts
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive().default(8080),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: base64UrlSecretSchema,
  AUTH_RATE_LIMIT_SECRET: base64UrlSecretSchema,
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30),
  CHAT_RATE_LIMIT_FREE_USER_RPM: z.coerce.number().int().min(1),
  CHAT_RATE_LIMIT_FREE_ORG_RPM: z.coerce.number().int().min(1),
  CHAT_RATE_LIMIT_PRO_USER_RPM: z.coerce.number().int().min(1),
  CHAT_RATE_LIMIT_PRO_ORG_RPM: z.coerce.number().int().min(1),
  CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM: z.coerce.number().int().min(1),
  CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM: z.coerce.number().int().min(1),
  IDEMPOTENCY_PROCESSING_TTL_SECONDS: z.coerce.number().pipe(z.literal(300)),
  IDEMPOTENCY_COMPLETED_TTL_SECONDS: z.coerce.number().pipe(z.literal(3600)),
  MESSAGE_ENCRYPTION_KEYS_JSON: z.string().min(1).optional(),
  MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).optional(),
  FRONTEND_ORIGIN: z.string().url(),
});
```

Secrets must never be logged. `.env` must be ignored by Git. `.env.example` must contain names and safe placeholders only.

## 8. Shared HTTP Conventions

### 8.1 Base path

```text
/api/v1
```

### 8.2 Success envelope

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    nextCursor?: string;
  };
}
```

### 8.3 Error envelope

```ts
interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
```

Validation details may be returned for safe client-correctable errors. Stack traces, MongoDB errors, provider SDK errors, secrets, and raw prompt content must never be returned.

### 8.4 Error hierarchy

```ts
class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

class ValidationError extends AppError {}
class UnauthorizedError extends AppError {}
class ForbiddenError extends AppError {}
class NotFoundError extends AppError {}
class ConflictError extends AppError {}
class BudgetExceededError extends AppError {}
class PolicyBlockedError extends AppError {}
class ProviderUnavailableError extends AppError {}
```

The global error middleware must be the final Express middleware.

## 9. Middleware Order

```text
requestId
-> helmet/security headers
-> CORS
-> cookie parser
-> body-size limit
-> request logger context
-> public route check
-> authentication
-> organisation and user-status validation
-> rate limiter
-> feature flag and permission checks
-> Zod validation
-> controller
-> 404 handler
-> global error handler
```

### 9.1 Request context

```ts
interface AuthenticatedUserContext {
  userId?: string;
  orgId: string;
  role: UserRole;
  permissions: UserPermission[];
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedUserContext;
      log: Logger;
    }
  }
}
```

`orgId` must come from the verified access token and confirmed database record. Client-provided organisation IDs must not be trusted.

## 10. Authentication Technical Design

## 10.1 Password handling

- Hash new passwords with the approved Argon2id helper only; do not add a
  bcrypt or plaintext fallback.
- Never store or log plain passwords.
- Use a generic login failure message to avoid account enumeration.
- Lockout is not required for MVP, but rate limiting must protect the login route.

Login accepts `organisationSlug`, `email`, and `password`. The slug resolves
the tenant root first; only the Organisation record may provide trusted
`orgId`. The subsequent User lookup must use `{ orgId, emailNormalized }`.
Missing or suspended organisations, missing or disabled users, and incorrect
passwords all return the same public `401 INVALID_CREDENTIALS` response.

Login passwords must be non-empty and contain at most 128 Unicode code points
after NFC normalization. The 15-code-point minimum applies to new-password
creation, not verification of an existing password.

## 10.2 Access token

Recommended claims:

```ts
interface AccessTokenClaims {
  sub: string;
  orgId: string;
  role: UserRole;
  permissions: UserPermission[];
  sessionId: string;
  type: 'access';
  jti: string;
  iat: number;
  exp: number;
  iss: 'proxiai';
  aud: 'proxiai-api';
}
```

Access-token lifetime: 15 minutes.

Access tokens use HS256 with protected-header `typ: at+jwt`. Role claims use
the uppercase persistence enums. Permission claims use the canonical lowercase
namespaced `UserPermission` values without transformation. P2-06 must reload
the current User and Organisation and validate every permission against the
existing allowlist; token claims are never the sole authorization source.

## 10.3 Refresh token model

```ts
interface RefreshTokenDocument {
  _id: ObjectId;
  tokenId: string;
  sessionId: string;
  familyId: string;
  userId: string;
  orgId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  replacedByTokenId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

```text
unique: tokenId
unique: tokenHash
index: orgId + sessionId
index: orgId + familyId
TTL: expiresAt
```

`sessionId` identifies the login session. `familyId` identifies the
refresh-token rotation family. They are separate backend-generated UUIDs.
P2-04 creates only the initial token record. Rotation, reuse detection, family
revocation, and replacement links remain P2-05 behavior.

## 10.4 Refresh rotation algorithm

1. Read the refresh token from an `httpOnly` cookie.
2. Hash it using SHA-256.
3. Find the token record.
4. Reject when missing, expired, or revoked.
5. When `usedAt` is already set outside the bounded five-second concurrency
   grace, revoke every token in the same `familyId`, emit
   `auth.refresh_reuse_detected`, and return the generic refresh failure
   response.
6. Treat an already-used predecessor inside the concurrency grace, or a loser
   of the guarded atomic claim, as a concurrent rotation conflict. Return the
   generic refresh failure without revoking the family or clearing the browser
   cookie, so the winning replacement remains usable.
7. Mark the current token as used through the guarded atomic update.
8. Generate a new random refresh token.
9. Store only its hash in the same token family.
10. Issue a new access token and replace the refresh cookie.

Operational `5xx` refresh failures do not clear the refresh cookie. Cookie
clearing is reserved for terminal invalid-token failures where retaining the
credential cannot recover the session.

The database update should use a transaction when available. For the MVP, a guarded atomic update on the current token is acceptable if MongoDB transactions are difficult to configure locally.

## 10.5 Authentication routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Authenticate and create session |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh token |
| POST | `/auth/logout` | Refresh cookie | Revoke current session |
| GET | `/auth/me` | Access token | Return current user profile |

## 11. RBAC Design

### 11.1 Roles

```ts
type Role = 'EMPLOYEE' | 'TEAM_LEAD' | 'ORG_ADMIN';
```

### 11.2 Permissions

```ts
enum Permission {
  CHAT_SEND = 'chat:send',
  CHAT_VIEW_OWN = 'chat:view_own',
  TEAM_VIEW_LOGS = 'team:view_logs',
  ADMIN_VIEW_LOGS = 'admin:view_logs',
  ADMIN_VIEW_BILLING = 'admin:view_billing',
  ADMIN_MANAGE_USERS = 'admin:manage_users',
  ADMIN_CONFIGURE_POLICY = 'admin:configure_policy',
  ADMIN_EXPORT_AUDIT = 'admin:export_audit',
  PLATFORM_VIEW_HEALTH = 'platform:view_health',
}
```

### 11.3 Route guard

```ts
function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth?.permissions.includes(permission)) {
      return next(new ForbiddenError(403, 'FORBIDDEN', 'Access denied'));
    }
    next();
  };
}
```

Team-lead queries must add both `orgId` and `teamId`. Organisation administrators add `orgId`. Super administrators must use explicit platform routes; normal tenant routes must not silently bypass tenant checks.

## 12. MongoDB Data Models

This TDD defines implementation shape only. Full field-by-field database documentation belongs in `04_DATABASE_DESIGN.md`.

## 12.1 Organisation

```ts
interface Organisation {
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: 'free' | 'pro' | 'enterprise';
  monthlyTokenBudget: number;
  retentionMode: 'METADATA_ONLY' | 'ENCRYPTED_STORAGE';
  policyThresholds: {
    maskScore: number;
    blockScore: number;
  };
  featureFlags: {
    autoRouting: boolean;
    advancedPiiEngine: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

Validation rules:

- `maskScore` must be lower than `blockScore`.
- Both scores must be from 0 to 100.
- Budget must be zero or positive.

## 12.2 User

```ts
interface User {
  orgId: ObjectId;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  teamId?: ObjectId;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}
```

Unique index: `{ orgId: 1, email: 1 }`.

## 12.3 Conversation

```ts
interface Conversation {
  orgId: ObjectId;
  userId: ObjectId;
  title: string;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

Indexes:

```text
orgId + userId + lastMessageAt descending
orgId + _id
```

## 12.4 Message

```ts
interface Message {
  orgId: ObjectId;
  conversationId: ObjectId;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  contentEnc?: EncryptedPayload;
  tokenCount?: number;
  createdAt: Date;
}
```

`METADATA_ONLY` stores no content and `contentEnc` remains absent. Phase 9 adds
AES-256-GCM writes and authorised reads for `ENCRYPTED_STORAGE`.

The message-read contract is:

```ts
interface MessageSummary {
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  tokenCount?: number;
  createdAt: string;
  contentAvailable: boolean;
  content?: string;
}
```

`contentAvailable: false` requires `content` to be omitted. `contentEnc` and
encryption metadata are never exposed. `contentAvailable: true` contains
authorised decrypted `content` only after owner scope checks, while
`METADATA_ONLY` continues to return no content.

## 12.5 RequestLog

```ts
interface RequestLog {
  orgId: ObjectId;
  userId: ObjectId;
  conversationId: ObjectId;
  requestId: string;
  provider?: ProviderId;
  model?: string;
  routingReason?: 'manual' | 'auto' | 'fallback' | 'cache';
  intent?: Intent;
  policyAction: 'ALLOW' | 'ALLOW_WITH_MASK' | 'BLOCK';
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  estimatedCostMicros?: number;
  latencyMs: number;
  piiRiskScore: number;
  piiCategories: PiiCategory[];
  cacheHit: boolean;
  fallbackUsed: boolean;
  status: 'COMPLETED' | 'BLOCKED' | 'FAILED' | 'INTERRUPTED';
  errorCode?: string;
  createdAt: Date;
}
```

Primary index: `{ orgId: 1, createdAt: -1 }`.

## 12.6 AuditLog

```ts
interface AuditLog {
  auditId: string;
  orgId: string;
  actorId?: string;
  actorType: 'USER' | 'SYSTEM';
  actorRole?: UserRole;
  action: AuditAction;
  outcome: 'SUCCESS' | 'FAILURE';
  resourceType: AuditResourceType;
  resourceId?: string;
  metadata: SafeAuditMetadata;
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
  occurredAt: Date;
}
```

No update or delete repository method may be created for this model.

## 13. Conversation and Chat API

### 13.1 Routes

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/conversations` | `CHAT_SEND` | Create conversation |
| GET | `/conversations` | `CHAT_VIEW_OWN` | List own conversations |
| GET | `/conversations/:id` | `CHAT_VIEW_OWN` | Read own conversation metadata |
| PATCH | `/conversations/:id` | `CHAT_SEND` | Manually rename own conversation |
| GET | `/conversations/:id/messages` | `CHAT_VIEW_OWN` | Read retained messages |
| POST | `/chat/stream` | `CHAT_SEND` | Submit prompt and stream response |

### 13.2 Conversation title update

`PATCH /conversations/:id` accepts a strict `{ title }` body. The title is trimmed and must contain 1–120 characters. The repository update uses trusted authenticated `orgId`, authenticated `userId`, and the path conversation ID in one filter. Foreign-tenant, foreign-user, and nonexistent conversations return the same generic `404` response. Success returns the standard conversation summary envelope.

Titles are client-entered only. Prompt-derived and LLM-generated titles are not allowed.

### 13.3 Chat request schema

```ts
const ChatRequestSchema = z.object({
  conversationId: z.string().min(1),
  prompt: z.string().trim().min(1).max(20_000),
  clientRequestId: z.string().uuid(),
  providerId: z.enum(['groq', 'gemini', 'third']).optional(),
  routingMode: z.enum(['manual', 'auto']).default('auto'),
});
```

The exact prompt limit may be adjusted after provider testing. The server must also enforce provider context-window limits after token estimation.

## 14. End-to-End Chat Pipeline

```text
1. Authenticate user
2. Resolve trusted org and permission
3. Validate conversation ownership
4. Acquire idempotency key
5. Run rate limit
6. Load authoritative persisted budget status
7. Detect and classify PII
8. Calculate risk score
9. Evaluate policy
10. Append the safe durable policy AuditLog; failure returns `503 AUDIT_UNAVAILABLE` with no provider call
11. If BLOCK: append the safe blocked RequestLog/event, complete idempotency, and return JSON `403 POLICY_BLOCKED` before SSE headers
12. Build masked or original approved provider prompt
13. Check prompt cache only after the approved encrypted or safe-reference storage prerequisite
14. Load provider health and select the eligible provider order
15. Call primary through retry and circuit breaker
16. Fall back only before streaming if another approved adapter exists
17. Stream chunks to client
18. Persist known usage or an explicit unknown-usage accounting record
19. Persist retention-aware Message records only for a successfully completed provider stream
20. Reconcile the billing rollup when usage is known; otherwise apply the
    conservative provider/model capability reservation during budget reads
21. Mark idempotency result completed
22. Publish safe background jobs
23. Close SSE connection
```

The sequence above is the mandatory order. Policy checks must never be moved after routing or provider selection.

## 15. PII Pipeline

## 15.1 Categories

```ts
type PiiCategory =
  | 'CONTACT_INFO'
  | 'FINANCIAL'
  | 'GOVERNMENT_ID'
  | 'CREDENTIAL'
  | 'INTERNAL_SECRET'
  | 'BUSINESS_CONFIDENTIAL';
```

## 15.2 Detection result

```ts
interface DetectedSpan {
  start: number;
  end: number;
  category: PiiCategory;
  detector: string;
  confidence: number;
}

interface PiiAssessment {
  spans: DetectedSpan[];
  categories: PiiCategory[];
  riskScore: number;
  maskedText: string;
}
```

Raw matched text must not be included in logs, metrics, audit metadata, or queue payloads.

## 15.3 MVP detectors

- Email address
- Indian and international phone-like numbers
- Payment-card-like numbers with Luhn validation
- API keys and bearer tokens using known prefixes and entropy-like patterns
- Connection-string patterns
- Password-assignment patterns
- Government-ID-like patterns only when confidence is sufficient
- Organisation-configured confidential keywords

False positives are possible. The detector must be covered by unit tests for valid examples, invalid examples, masking boundaries, and overlapping matches.

## 15.4 Risk scoring

```ts
const PII_WEIGHTS: Record<PiiCategory, number> = {
  CONTACT_INFO: 10,
  FINANCIAL: 25,
  GOVERNMENT_ID: 30,
  CREDENTIAL: 40,
  INTERNAL_SECRET: 40,
  BUSINESS_CONFIDENTIAL: 20,
};

function calculateRisk(spans: DetectedSpan[]): number {
  return Math.min(
    100,
    spans.reduce((total, span) => total + PII_WEIGHTS[span.category], 0),
  );
}
```

Duplicate or overlapping detections should be normalized before scoring to avoid accidental double counting.

## 15.5 Masking

Use deterministic category labels:

```text
john@example.com -> [EMAIL_REDACTED]
9876543210 -> [PHONE_REDACTED]
sk-abc... -> [CREDENTIAL_REDACTED]
```

Mask from the end of the string toward the beginning so offsets remain valid.

## 16. Policy Engine

### 16.1 Contract

```ts
interface PolicyContext {
  orgId: string;
  userId: string;
  prompt: string;
  pii: PiiAssessment;
  budget: BudgetStatus;
  thresholds: {
    maskScore: number;
    blockScore: number;
  };
}

type PolicyDecision =
  | { action: 'ALLOW'; reason: string }
  | { action: 'ALLOW_WITH_MASK'; reason: string; providerPrompt: string }
  | { action: 'BLOCK'; reason: 'budget_exceeded' | 'high_risk_pii' };
```

### 16.2 Evaluation order

1. Budget exhausted → `BLOCK`.
2. Risk score greater than or equal to `blockScore` → `BLOCK`.
3. Risk score greater than or equal to `maskScore` → `ALLOW_WITH_MASK`.
4. Otherwise → `ALLOW`.

Configuration validation must prevent `maskScore >= blockScore`.

### 16.3 Audit metadata

Safe metadata only:

```ts
{
  action: decision.action,
  reason: decision.reason,
  riskScore: pii.riskScore,
  categories: pii.categories,
  detectorCount: pii.spans.length
}
```

Never store matched values or prompt content in audit metadata.

## 17. Prompt Cache

### 17.1 Eligibility

A request may be cached only when all conditions are true:

- Policy action is `ALLOW`.
- PII risk score is `0`.
- No sensitive span was detected.
- Retention mode permits response-content storage; `METADATA_ONLY` does not.
- The request does not contain user-specific dynamic context that would make reuse unsafe.
- The selected provider, model, deterministic settings, and policy/config fingerprint support deterministic reuse.

`ALLOW_WITH_MASK` and `BLOCK` requests are never cacheable. Masked prompts must not be cached. Organisation-wide reuse is permitted only when the request has no user-specific context, and cache entries are never shared across organisations.

### 17.2 Key

```text
cache:prompt:{opaqueHmac(canonicalCacheInput)}
```

`canonicalCacheInput` binds the trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and deterministic policy/config fingerprint. The Redis key exposes none of those values. Do not normalize whitespace or casing unless a future approved contract explicitly defines the transformation. Raw prompts, PII, email addresses, and secrets must never appear in a cache key.

### 17.3 Value

Plaintext assistant responses in Redis are not approved. Phase 9 provides an
encrypted MongoDB message store, not an approved Redis cache-value/replay
contract. Prompt-cache implementation remains deferred until cache-hit
accounting, policy/config fingerprinting, and an access-checked encrypted value
or reference contract are approved.

`PROMPT_CACHE_TTL_SECONDS=3600` becomes a required validated environment variable with no hidden default when cache implementation is enabled. It must not be added as a current startup requirement before the cache feature exists.

### 17.4 Failure behaviour

Cache reads and writes fail open. A lookup failure continues to provider execution, and a write failure must not fail an otherwise successful provider response. Cache failures must not bypass policy. Idempotency is separate and remains fail closed.

### 17.5 Future cache-hit stream and accounting

A valid future hit emits `request_started`, `policy`, `routing` with `routingReason=cache`, zero or more `token` events, then `done` with `cacheHit=true`. No new `cache_hit` event is introduced, and the provider adapter is not called. Exact provider/model metadata semantics remain deferred until implementation.

Provider usage on a true cache hit is zero, and synthetic provider usage is forbidden. The current `RequestLog` contract cannot safely distinguish non-billable cache delivery, so cache-hit accounting must be resolved before implementation.

## 18. Idempotency

### 18.1 Key

```text
chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}
```

### 18.2 State

```ts
type IdempotencyRecord =
  | {
      status: 'PROCESSING';
      requestId: string;
      requestFingerprint: string;
      startedAt: string;
    }
  | {
      status: 'COMPLETED';
      requestId: string;
      requestFingerprint: string;
      completedAt: string;
    };
```

TTL: `PROCESSING` is exactly 300 seconds and `COMPLETED` is exactly 3600 seconds. Both values are required validated environment variables with no hidden defaults.

The opaque request fingerprint is an HMAC over canonical non-sensitive request fields and a domain-separated HMAC of the exact prompt bytes. For chat, the bound fields are conversation ID, routing mode, selected provider or null, and prompt HMAC. Do not trim, normalize, log, or store raw prompt content while deriving the fingerprint.

### 18.3 Acquisition

Use `SET key value NX EX IDEMPOTENCY_PROCESSING_TTL_SECONDS`.

- New key: continue.
- Existing `processing`: return `409 REQUEST_IN_PROGRESS` or attach to existing result when practical. MVP uses `409`.
- Any existing record with a different request fingerprint: return `409 DUPLICATE_REQUEST` without exposing which field changed.
- Existing `COMPLETED`: always return `409 DUPLICATE_REQUEST`.
- Failure before provider execution releases the matching `PROCESSING` reservation so a safe retry is possible.
- Once provider execution may have started, do not release the reservation in a way that permits a duplicate paid call.

When Redis is unavailable, the chat write fails closed with `503 IDEMPOTENCY_UNAVAILABLE` because duplicate paid provider calls are otherwise possible.

The reservation handle must mark the provider-execution boundary immediately before the first provider iterator/network attempt. After that marker, `releaseBeforeExecution` must fail closed with `IDEMPOTENCY_UNAVAILABLE` instead of deleting the Redis record. There is no in-memory or local fail-open fallback when Redis restarts or becomes unavailable.

After provider execution may have started, convert the matching `PROCESSING`
record to `COMPLETED` only after the authoritative append-only `RequestLog`
write succeeds. If that write fails, propagate the safe operational error and
leave `PROCESSING` until its approved TTL rather than falsely recording a
completed request with no durable accounting evidence.

The key and record contain no prompt, response, email, raw tenant/user identifiers, PII, provider secret, token, final API status/code, or provider usage. `COMPLETED` is a non-replayable tombstone; response replay/storage remains deferred because the Phase 9 encrypted Message store is not an idempotency replay contract.

If the process crashes after provider execution may have started, the `PROCESSING` tombstone can expire after 300 seconds and permit a later retry. The MVP does not perform unsafe automatic reconciliation. Full durable recovery and replay remain deferred.

An expired or missing `PROCESSING` key is atomically reservable again. That retry is known-safe only when provider execution had not started; after a crash, the caller receives no claim that the previous provider attempt did or did not execute.

## 19. Provider Adapter Design

### 19.1 Provider types

```ts
type ProviderId = 'groq' | 'gemini' | 'third';

type ProviderErrorCode =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_REQUEST'
  | 'CONTENT_REJECTED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';
```

### 19.2 Adapter interface

```ts
interface ProviderCapabilities {
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsSystemPrompt: boolean;
  costPerMillionInputTokens: number;
  costPerMillionOutputTokens: number;
  expectedLatencyMs: number;
  tier: 'fast' | 'balanced' | 'power';
}

interface CompletionRequest {
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

interface StreamChunk {
  text: string;
}

interface CompletionUsage {
  inputTokens: number;
  outputTokens: number;
}

interface ProviderCompletionResult {
  text: string;
  model: string;
  usage: CompletionUsage;
  providerRequestId?: string;
}

interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  complete(request: CompletionRequest): Promise<ProviderCompletionResult>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(usage: CompletionUsage): number;
}
```

### 19.3 Normalized provider error

```ts
class ProviderError extends Error {
  constructor(
    public providerId: ProviderId,
    public code: ProviderErrorCode,
    public retryable: boolean,
    public statusCode?: number,
    message = 'Provider request failed',
  ) {
    super(message);
  }
}
```

Provider adapters must translate all SDK-specific exceptions into `ProviderError` before returning control to routing or retry code.
For Groq streaming, terminal `x_groq.error` metadata is a provider failure,
never a successful iterator end. Missing terminal usage remains unavailable
and must not be synthesized as zero.

## 20. Intent Classification

### 20.1 Types

```ts
type Intent =
  | 'simple_qa'
  | 'summarization'
  | 'code_generation'
  | 'code_debugging'
  | 'data_analysis'
  | 'creative_writing'
  | 'unknown';

interface IntentResult {
  intent: Intent;
  complexity: 'low' | 'medium' | 'high';
  confidence: number;
}
```

### 20.2 MVP rules

- Code fences, stack traces, error keywords, `debug`, `fix`, or `refactor` → likely `code_debugging`.
- `write code`, `create function`, or language names → `code_generation`.
- `analyze`, tabular data, SQL, CSV, statistics → `data_analysis`.
- `summarize`, `shorten`, `key points` → `summarization`.
- `story`, `poem`, `creative` → `creative_writing`.
- Short factual prompts → `simple_qa`.
- Otherwise → `unknown`.

This result is advisory. It must not override policy or provider capability constraints.

## 21. Routing Engine

### 21.1 Input

```ts
interface RoutingContext {
  requestedProviderId?: ProviderId;
  routingMode: 'manual' | 'auto';
  intent: IntentResult;
  estimatedInputTokens: number;
  budget: BudgetStatus;
  providerHealth: Record<ProviderId, HealthStatus>;
}
```

### 21.2 Candidate filtering

Remove providers that:

- Do not support streaming for the chat route.
- Cannot fit estimated input plus configured output tokens.
- Are in `OPEN` circuit state.
- Are disabled by plan or configuration.
- Cannot be used because the organisation budget is exhausted.

### 21.3 Manual routing

Manual selection is respected only when the provider is allowed, healthy enough, and capable. Policy can still block the request before manual selection is evaluated.

### 21.4 Automatic scoring

```text
score =
  0.40 * capabilityMatch
+ 0.20 * latencyScore
+ 0.20 * costScore
+ 0.20 * healthScore
```

Each component is normalized from 0 to 1. Ties are broken by lower estimated cost, then stable provider ID order to keep tests deterministic.

When budget remaining is below 10%, providers with tier `power` are excluded.

### 21.5 Output

```ts
interface RoutingDecision {
  orderedProviders: ProviderId[];
  selectedProvider: ProviderId;
  reason: string;
  scores: Partial<Record<ProviderId, number>>;
}
```

Scores may be stored in debug logs but need not be persisted in the MVP request log.

## 22. Retry and Backoff

### 22.1 Retryable conditions

- Network errors
- Timeouts
- HTTP 429
- HTTP 500, 502, 503, 504

### 22.2 Non-retryable conditions

- Invalid API key or authentication
- Invalid request
- Unsupported model
- Content rejection
- Client validation errors

### 22.3 Algorithm

```ts
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const providerError = normalizeProviderError(error);
      if (!providerError.retryable || attempt === maxAttempts) throw providerError;

      const exponentialMs = Math.min(500 * 2 ** (attempt - 1), 4_000);
      const jitterMs = Math.floor(Math.random() * 250);
      await sleep(exponentialMs + jitterMs);
    }
  }
  throw new Error('Unreachable');
}
```

The overall provider call must also have a timeout using `AbortController`.

## 23. Circuit Breaker

### 23.1 State

```ts
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitSnapshot {
  state: CircuitState;
  failureCount: number;
  openedAt?: number;
  lastFailureAt?: number;
}
```

### 23.2 MVP defaults

- Failure threshold: 5 consecutive failed operations
- Cooldown: 30 seconds
- Half-open trial: 1 request
- Successful half-open trial resets breaker
- Failed half-open trial reopens breaker

The state is in process memory for the MVP. Redis health data is used as a routing hint, not as authoritative distributed breaker state.

### 23.3 Counting rule

Only provider availability failures should increment the breaker. Validation errors, content policy rejection, and authentication configuration errors must not be counted as transient health failures.

## 24. Fallback Execution

Fallback occurs only before any response token has been sent.

```ts
for (const providerId of routingDecision.orderedProviders) {
  try {
    const stream = await openProviderStream(providerId, request);
    return { providerId, stream };
  } catch (error) {
    recordProviderFailure(providerId, error);
    continue;
  }
}
throw new ProviderUnavailableError(...);
```

Once the first token has been delivered, provider switching is not attempted. If the provider fails mid-stream:

1. Send terminal SSE event `error` with code `STREAM_INTERRUPTED`.
2. Persist an unknown-usage accounting record when final usage is unavailable.
3. Mark the idempotency reservation completed only after the append-only
   RequestLog commit succeeds. If persistence fails after provider execution,
   retain `PROCESSING` until its approved TTL instead of falsely recording a
   durable completion.
4. Do not automatically splice a second provider response.
5. Let the user retry with the same visible prompt and a new client request ID.

## 25. SSE Technical Design

### 25.1 Headers

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

### 25.2 Event types

```text
event: request_started
event: policy
event: routing
event: fallback
event: token
event: done
event: error
```

Example:

```text
event: token
data: {"text":"Hello"}

```

### 25.3 Done payload

```ts
interface DoneEvent {
  requestId: string;
  provider: ProviderId | 'cache';
  model?: string;
  usage?: CompletionUsage;
  cacheHit: boolean;
  masked: boolean;
}
```

### 25.4 Client disconnect

Listen for `req.on('close')`. Abort the provider request when possible. Mark the request as `interrupted` only when processing had started. Do not continue generating and billing tokens after a known disconnect when the provider SDK supports cancellation.

### 25.5 Heartbeat

Send an SSE comment every 15 seconds during long waits:

```text
: heartbeat

```

This is transport maintenance, not a product feature.

## 26. Retention and Encryption

## 26.1 Retention modes in MVP

### Metadata Only

Persist request metadata, usage, provider, risk score, and operational status. Do not persist prompt or response content.

### Encrypted Storage

Persist message content using AES-256-GCM before writing to MongoDB.

## 26.2 Encrypted payload

```ts
interface EncryptedPayload {
  algorithm: 'AES-256-GCM';
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: number;
}
```

Use a random 12-byte IV for every encryption operation. Never reuse an IV with the same key.

All binary fields use canonical unpadded base64url. The authentication tag is
exactly 16 bytes and ciphertext is non-empty. Encryption and decryption use
deterministic UTF-8 AAD built from a version marker plus trusted `orgId`, entity
type, entity ID, field name, and the immutable conversation/message context
required by that entity. Moving ciphertext to another tenant, resource, or
field must fail authentication.

## 26.3 Encryption service and keyring

```ts
interface EncryptionService {
  encrypt(input: EncryptionInput): EncryptedPayload;
  decrypt(input: DecryptionInput): string;
}
```

The MVP uses one application-level versioned keyring. Runtime configuration is:

- `MESSAGE_ENCRYPTION_KEYS_JSON`: a JSON object mapping positive integer
  versions to canonical base64url-encoded, exactly 32-byte AES keys;
- `MESSAGE_ENCRYPTION_ACTIVE_KEY_VERSION`: the version used for new writes.

Both values are absent together or present together. The active version must
exist in the validated keyring. Key material is never stored in MongoDB,
returned by APIs, logged, placed in Docker build arguments, or exposed to the
frontend. Production injects both values through the canonical runtime secret.
Old key versions remain available for reads until an explicit verified
re-encryption migration completes. Automatic rotation and per-organisation
keys are deferred.

The application may run in metadata-only mode without a keyring only when no
active organisation uses `ENCRYPTED_STORAGE` and no encrypted title/content
operation is requested. Startup/readiness validation fails safely when
persisted encrypted-storage configuration requires a missing key version.
Startup performs an in-memory non-sensitive encrypt/decrypt canary for every
configured key version. The canary is never persisted or logged. Failure stops
encrypted-storage readiness; it does not remove or replace key material.

## 26.4 Persistence enforcement

The retention mode must be read before constructing message write objects.

```ts
function buildMessageWrite(
  mode: RetentionMode,
  message: PlainMessage,
): MessageWrite | null {
  if (mode === 'METADATA_ONLY') {
    return { ...message.metadata, contentStored: false };
  }
  return {
    ...message.metadata,
    contentStored: true,
    contentEnc: encryptionService.encrypt(message.content, trustedAad),
  };
}
```

The code must not construct a plain-content MongoDB document and remove content later.

The chat completion path persists user and assistant records only after a
successful stream completion. Partial or interrupted assistant output is not
persisted. Attachments remain outside the current MVP: there is no multipart
request, upload endpoint, file reference, or provider attachment contract.

For a successful `ALLOW` or `ALLOW_WITH_MASK` stream, the retention writer creates two
append-oriented Message records after provider completion: the original user
message and the assistant response. `METADATA_ONLY` writes metadata records
with `contentStored=false`; `ENCRYPTED_STORAGE` encrypts each content value
before constructing the MongoDB write and stores `contentStored=true`. A
blocked, failed, or interrupted stream stores no message content. RequestLog
usage remains append-only and independent from retained content.

The two Message inserts and Conversation `messageCount`/`lastMessageAt` update
commit in one MongoDB transaction. The unique tenant/request/role index makes a
retry idempotent. Encryption or transaction failure stores no plaintext and no
partial message pair, preserves the authoritative RequestLog outcome, and emits
only a safe persistence error. If SSE tokens were already delivered, the
server sends a terminal error rather than a false `done` event; it does not
repeat the paid provider call automatically.

The owner message-read path requires authentication plus current
`chat:view_own`, then proves Conversation ownership with trusted
`{ orgId, userId, conversationId }`, then reads Messages with trusted
`{ orgId, conversationId }`. A metadata-only item returns
`contentAvailable=false` and omits `content`. A successfully decrypted item
returns `contentAvailable=true` plus `content`; the encryption envelope is
never an API field. A missing key, tag mismatch, or malformed envelope fails
the whole read safely and never returns partial plaintext or ciphertext.

Canonical safe failures are `503 ENCRYPTION_UNAVAILABLE` when required runtime
key material, a referenced key version, or encryption-service readiness is
unavailable, and `500 MESSAGE_CONTENT_UNAVAILABLE` for malformed envelopes or
authentication-tag failure. Client responses contain no key
version, envelope field, database identifier, stack, or crypto-library error.

Conversation titles are also encrypted at rest. The persisted
plain title becomes a fixed non-sensitive fallback (`New conversation`), while
an optional encrypted title envelope stores a manual custom title. Owner list,
read, and `chat:send` rename paths decrypt only after trusted ownership checks. Prompt-
derived and LLM-generated titles remain prohibited.

`METADATA_ONLY` and `ENCRYPTED_STORAGE` are the only MVP retention modes. A
retention change is prospective: switching to metadata-only stops future
content writes but does not silently delete or rewrite existing ciphertext;
switching to encrypted storage does not reconstruct historical content.
Custom TTL, `CUSTOM_RETENTION`, `NO_STORAGE`, and automated retention deletion
remain deferred.

## 27. Audit Logging

### 27.1 Events

MVP audit actions include:

- `auth.login_succeeded`
- `auth.login_failed`
- `auth.login_operational_error`
- `auth.logout_succeeded`
- `auth.refresh_reuse_detected`
- `policy.allow`
- `policy.mask`
- `policy.block`
- `user.role_changed`
- `user.team_changed`
- `user.status_changed`
- `user.sessions_revoked`
- `organisation.policy_changed`
- `organisation.budget_changed`
- `organisation.retention_changed`
- `alert.resolved`
- `alert.reopened`
- `audit.exported`

User creation and invitation remain deferred because no approved onboarding
contract exists.

### 27.2 Repository

```ts
interface AuditRepository {
  append(entry: NewAuditLog): Promise<void>;
  listByOrg(filter: AuditFilter): Promise<CursorPage<AuditLog>>;
}
```

No `update`, `delete`, or generic save method is allowed once the durable audit
repository is implemented in Phase 9. P2-04 emits structured authentication
security events only and does not create the MongoDB audit collection.

`AuditLog` uses backend-generated UUID `auditId`, immutable trusted `orgId`,
optional trusted actor ID and role, allowlisted actor type/action/resource
type/outcome, optional resource ID, canonical `requestId`, bounded IP address
and user agent fields, action-specific safe metadata, and `occurredAt` only.
Metadata is built field-by-field through an action-specific Zod contract,
cannot exceed 8 KiB after serialization, and never accepts arbitrary request
objects. The model and repository reject every update, replace, and delete
operation.

Declared indexes are limited to:

- unique `{ auditId: 1 }`;
- `{ orgId: 1, occurredAt: -1, auditId: -1 }` for export/pagination;
- `{ orgId: 1, actorId: 1, occurredAt: -1 }`;
- `{ orgId: 1, action: 1, occurredAt: -1 }`;
- `{ orgId: 1, resourceType: 1, resourceId: 1, occurredAt: -1 }`.

### 27.3 Failure handling

- Policy blocks and admin actions should fail closed when their audit write fails because these are compliance-relevant actions.
- Login-success audit failure may log an operational error and continue only if the product would otherwise become unavailable. This exception must be clearly logged.
- Raw prompts, responses, tokens, passwords, cookies, and API keys must never be included.

Every Phase 9 admin mutation runs the tenant-scoped state change and its audit
append in one MongoDB transaction. If a transaction or audit append fails, the
mutation rolls back and returns `503 AUDIT_UNAVAILABLE`. No queue or best-effort
fallback is allowed for admin mutations. Atlas/production must support MongoDB
transactions; an unsupported standalone deployment cannot enable these routes.

Policy decisions append durable safe audit metadata before provider execution.
Audit failure returns `503 AUDIT_UNAVAILABLE` and therefore still produces zero
provider calls. Authentication and session-security operations keep their
availability/safety ordering: session revocation is never rolled back because
an audit append fails, while a safe operational event records the audit
failure. A login attempt without a trusted organisation never invents an
`orgId`; it remains a structured operational security event only.

### 27.4 Phase 9 admin mutation contract

- `PATCH /admin/users/:userId/role` accepts strict `{ role }`, requires
  `admin:manage_users`, scopes by trusted `orgId`, and derives the exact
  permission set from the role. Client permission arrays are rejected.
- `PATCH /admin/users/:userId/team` accepts strict `{ teamId: uuid | null }`,
  verifies the Team through `{ orgId, teamId }`, and preserves the active
  `TEAM_LEAD` team requirement.
- `PATCH /admin/users/:userId/status` accepts only `ACTIVE` or `DISABLED`.
  Disabling a user revokes every active refresh session for trusted
  `{ orgId, userId }` in the same transaction; access-token middleware already
  rejects the now-disabled user on the next request.
- `POST /admin/users/:userId/revoke-sessions` has an empty body and revokes all
  active refresh sessions without changing user status.
- `PATCH /admin/policy` updates only approved thresholds and/or monthly token
  budget after validating the complete resulting policy.
- `PATCH /admin/retention` accepts only `METADATA_ONLY` or
  `ENCRYPTED_STORAGE`; encrypted mode requires a validated active keyring.
- `PATCH /admin/alerts/:alertId` accepts strict `{ resolved: boolean }` and
  updates the existing tenant-scoped alert rather than creating a duplicate.

The canonical role mapping is deterministic:

```text
EMPLOYEE  -> chat:send, chat:view_own
TEAM_LEAD -> chat:send, chat:view_own, team:view_logs
ORG_ADMIN -> every current tenant UserPermission
```

Role/status changes that would leave an organisation without an active
`ORG_ADMIN` return `409 LAST_ACTIVE_ORG_ADMIN`. An active `TEAM_LEAD` without a
trusted same-organisation team returns `409 TEAM_ASSIGNMENT_REQUIRED`.
Foreign-tenant and nonexistent resources return the same generic `404`.

### 27.5 Audit CSV export

`GET /admin/audit/export` requires both `admin:export_audit` and the current
organisation's `auditExport` feature flag. `dateFrom` and `dateTo` are required
UTC timestamps, `dateTo` must not precede `dateFrom`, and the inclusive range
is limited to 90 days. The MVP exports at most 10,000 rows ordered by
`occurredAt` then `auditId`; a larger result returns `413 EXPORT_TOO_LARGE`
instead of truncating silently.

The server builds the bounded CSV, neutralizes cells beginning with `=`, `+`,
`-`, or `@`, appends `audit.exported` with safe range/filter/row-count metadata,
and only then commits response headers. Audit append failure returns
`503 AUDIT_UNAVAILABLE`. The CSV includes no prompt, response, password, token,
cookie, key, ciphertext, IV, authentication tag, or arbitrary metadata field.

## 28. BullMQ Design

## 28.1 Queues

| Queue | Job name | Producer | Consumer |
|---|---|---|---|
| `billing-queue` | `request.completed` | Chat finalizer | Billing worker |
| `analytics-queue` | `request.completed`, `request.blocked` | Chat outcome finalizer | Analytics worker |
| `anomaly-queue` | `usage.updated` | Analytics worker only | Anomaly worker |
| `email-queue` | `alert.created` | Alert service | Deferred Phase 8 email worker |
| `health-check-queue` | `provider.health_check` | Repeat scheduler | Health worker |
| `recovery-queue` | `async.enqueue_recovery_scan` | Repeat scheduler | Enqueue-recovery worker |

The architecture source mentions an archive queue. Custom retention, MongoDB
TTL message deletion, and an archive/retention worker are deferred and are not
implemented in the MVP.

## 28.2 Shared job options

```ts
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
```

### 28.3 Queue payload rule

Queue payloads contain identifiers and safe metadata only. They must not include raw prompts, response text, credentials, cookies, or encryption keys.

```ts
interface RequestCompletedJob {
  schemaVersion: 1;
  jobType: 'request.completed';
  requestId: string;
  orgId: string;
  userId: string;
  status: 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  policyAction: 'ALLOW' | 'ALLOW_WITH_MASK';
  providerId: ProviderId;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  estimatedCostMicros?: number;
  occurredAt: string;
}

interface RequestBlockedJob {
  schemaVersion: 1;
  jobType: 'request.blocked';
  requestId: string;
  orgId: string;
  userId: string;
  status: 'BLOCKED';
  policyAction: 'BLOCK';
  occurredAt: string;
}

type AnalyticsRequestOutcomeJob =
  | RequestCompletedJob
  | RequestBlockedJob;
```

The usage object is all-or-nothing and contains only actual provider-reported values. Missing provider usage is a terminal data outcome for that event, not a reason for infinite retries. Pricing is not approved yet, so `estimatedCostMicros` is omitted; unknown cost is never represented as zero. `request.blocked` forbids provider, model, usage, and cost fields. Raw prompts, responses, PII values, secrets, headers, cookies, SDK objects, and free-form payload objects are forbidden.

Outcome values are explicit and are never inferred from absent usage or other
optional fields. `COMPLETED` means the provider stream reached its normal done
event. `FAILED` means provider execution started but ended in a terminal
operational failure. `INTERRUPTED` means the client disconnected or streaming
ended without a normal done event. `BLOCKED` is emitted only after policy chose
`BLOCK`, before provider selection or execution.

The chat outcome finalizer appends the corresponding immutable RequestLog before
publishing an outcome event. Billing consumes only `request.completed`.
Analytics consumes both event types. Queue publication failure emits safe
operational metadata and never changes the already determined client outcome.

### 28.4 Failed-enqueue recovery

The append-only RequestLog is the authoritative recovery source. Required
publications are derived deterministically: non-blocked outcomes require both
billing and analytics jobs; blocked outcomes require analytics only. A safe
publication ledger is unique by `{ orgId, requestId, queueName, jobType }` and
stores only `PENDING`, `ENQUEUED`, `COMPLETED`, or `FAILED`, attempt count, and
safe timestamps.

The API records `PENDING` when enqueue fails after RequestLog persistence. A
repeatable recovery scan runs at worker startup and every 60 seconds. It first
loads trusted organisation IDs, then scans each organisation's RequestLogs in
bounded cursor batches with `orgId` in every tenant-owned query. Missing
publication-ledger rows are created from safe RequestLog metadata so a crash
between persistence and recovery-record creation is recoverable.

Before enqueue, recovery checks the matching business worker ledger and the
deterministic BullMQ job ID. Completed work becomes `COMPLETED`; active,
waiting, or delayed work is not duplicated; absent work is enqueued and marked
`ENQUEUED`. A terminal BullMQ failed job or three failed publication attempts
becomes `FAILED` and is not automatically replayed. Existing billing and
analytics ledgers remain the final side-effect idempotency boundary.

RequestLog is never mutated. Recovery payloads contain no prompt, response,
PII, recipient, credential, provider secret, cookie, header, or arbitrary
object. Recovery cannot change an already delivered HTTP/SSE result.

`requestId` is the canonical correlation ID. Existing request-derived jobs preserve it, and scheduled jobs generate a server UUID request ID. Phase 7 does not introduce `traceId`; future distributed tracing may add a separate mapping without replacing `requestId`.

### 28.5 Idempotent workers

Every worker must tolerate duplicate delivery. Billing processing uses a separate tenant-scoped async ledger keyed uniquely by `{ orgId, requestId, jobType }`; it never mutates the append-only `RequestLog`.

```ts
interface AsyncJobLedgerRecord {
  orgId: string;
  requestId: string;
  jobType: string;
  state: 'PROCESSING' | 'COMPLETED';
  processingStartedAt: Date;
  completedAt?: Date;
  outcome?: 'APPLIED' | 'USAGE_UNAVAILABLE' | 'COST_UNAVAILABLE';
}
```

The ledger stores only safe identifiers, state, outcome, and timestamps. The worker loads the authoritative request using `{ orgId, requestId }`. The current minimal billing rollup is recomputed deterministically from `RequestLog` and written with `$set`, so retries cannot double-add usage. Duplicate `COMPLETED` work is a no-op. A retried `PROCESSING` job may rerun deterministic reconciliation; it must not apply incremental side effects without a separate atomic contribution contract.

Other idempotency keys remain:

- Billing upsert key: `orgId + period + userId`
- Daily analytics key: `orgId + date`
- Alert dedupe key: `orgId + userId + type + timeWindow`

### 28.5 Worker heartbeat

The billing worker probes Redis every 30 seconds through its existing BullMQ
worker connection. No second Redis connection or heartbeat key is created.
Heartbeat health is stale after 120 seconds, matching the approved worker
heartbeat alert boundary.

The internal safe health state contains only:

- fixed worker identity and type;
- whether the worker lifecycle is running;
- whether the latest heartbeat is fresh and successful;
- the last successful heartbeat timestamp;
- the last successful job timestamp when available.

A failed probe marks the worker unhealthy and emits a safe structured
operational event without job payloads, tenant data, connection details, or
secrets. Heartbeat failure does not block chat traffic. Worker shutdown clears
the timer and waits for any in-flight probe before closing the existing BullMQ
connection. Public detailed-health or metrics exposure remains a later approved
observability boundary.

## 29. Billing Worker

### 29.1 Period

Use UTC month in `YYYY-MM` format.

### 29.2 Update

The implemented authoritative MVP rollup remains one organisation-month record containing `usedTokens` and `sourceRequestCount`. The billing worker deterministically aggregates trusted `{ orgId, period }` `RequestLog` records and upserts those totals with `$set`. Missing usage does not add zero tokens and is recorded as terminal `USAGE_UNAVAILABLE` in the async ledger. During a synchronous budget read, each unresolved record for a currently approved provider/model contributes a separate conservative liability reservation equal to that model contract's maximum input plus maximum output tokens. This reservation is not actual usage, is not written into `usedTokens`, and prevents one unresolved request from causing an unconditional organisation-wide outage while preserving fail-closed budget arithmetic. Unknown or unsupported historical provider/model contracts still return `BUDGET_ACCOUNTING_UNAVAILABLE`.

Richer user/provider/cost reporting rollups are separate Phase 7 projections. They must not replace or weaken the current authoritative budget source until their schemas, idempotent contribution rules, and pricing configuration are approved.

### 29.3 Budget status

```ts
interface BudgetStatus {
  monthlyBudgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  remainingPercent: number;
  exceeded: boolean;
}
```

Budget checks should read the current billing rollup plus any safe in-flight estimate where practical. For the MVP, a small race near the exact budget boundary is accepted and documented; strict reservation-based accounting is deferred.

### 29.4 Retry and failure contract

- Retry up to three attempts with exponential backoff starting at 1,000 ms for transient MongoDB, Redis/BullMQ, or worker-availability failures.
- Do not retry schema/version errors, missing trusted scope, unsupported job types, unknown provider usage, or unavailable pricing.
- Retain exhausted jobs in BullMQ's failed set. This failed set is the MVP dead-letter mechanism; no second DLQ queue is introduced.
- Emit only safe failure metadata such as queue, job type, request ID, provider ID, attempt count, and normalized error category.
- A failed async job never changes the already delivered chat response. Durable `RequestLog` data remains available for later reconciliation.

## 30. Analytics and Anomaly Workers

### 30.1 Analytics

The minimal P7-06 projection stores UTC-daily organisation and user aggregates:

- Request count
- Successful request count (`COMPLETED`)
- Blocked request count (`BLOCKED`)
- Failed request count (`FAILED`)
- Interrupted request count (`INTERRUPTED`)
- Masked request count (`ALLOW_WITH_MASK`)
- Provider/model request count for `request.completed` only
- Known input/output/total token usage and known-usage request count

Unknown usage remains unknown and does not contribute synthetic zero tokens.
Pricing, user-facing reports, fallback/cache analytics, latency percentiles, and
advanced analytics are outside this minimal worker task.

### 30.2 Anomaly rule

MVP rule:

```text
current UTC-day user known tokens > 2 × previous 7-day active-day average
```

Baseline rules:

- Use only prior days with fully known token usage.
- Exclude unknown-usage days; never convert unknown usage to zero.
- Require at least three prior active days in the previous seven UTC days.
- If fewer than three qualifying days exist, produce no anomaly decision.
- Evaluate only when the tenant's trusted
  `Organisation.featureFlags.anomalyDetection` value is `true`.

The anomaly severity is `HIGH`, and a newly created alert starts as `OPEN`.
Request-level, request-volume, blocked-rate, and provider-error anomaly rules
are not part of the MVP.

### 30.3 Alert deduplication

Only one unresolved `{ orgId, userId, observedDay, ANOMALY }` alert may exist.
Duplicate or retried `usage.updated` jobs must atomically update the existing
same-day alert. Re-evaluation may update or resolve that record and must not
create another alert.

### 30.4 Other Phase 7 job ownership

- Analytics consumes `request.completed` and `request.blocked`, creates tenant-scoped daily aggregates, and treats absent usage/cost as unknown rather than zero.
- Analytics is the only `usage.updated` producer. The job contains trusted
  tenant/user scope and a safe aggregate reference; it contains no prompt,
  response, PII, secret, or email data.
- Anomaly consumes `usage.updated`, evaluates only approved aggregate known
  token data, and persists the safe tenant-scoped anomaly alert. P7-07 does not
  enqueue `alert.created`, email, or notification work.
- Email consumes `alert.created` only. The strict job contains schema version,
  job type, canonical request ID, trusted `orgId`, alert ID, one allowlisted
  template ID, optional trusted subject `userId` when required, and
  `occurredAt`. It never contains a recipient email, rendered subject/body,
  prompt, response, detected PII value, credential, secret, or arbitrary
  content.
- Recipients are current tenant `ORG_ADMIN` users resolved only through trusted
  `orgId` storage queries. Client input cannot supply or override a recipient.
- Delivery idempotency uses `{ orgId, alertId, templateId }`, so duplicate or
  retried jobs cannot send the same intended notification twice.
- Email uses the existing bounded three-attempt exponential-backoff policy.
  Exhausted jobs remain in BullMQ's failed set with safe operational metadata.
- Email is created only for `alert.created`. Reminders, escalations, and alert
  resolution emails are deferred. The provider, credentials, sender,
  provider-specific timeout/error mapping, allowlisted template values, and
  rendered template content remain unresolved. Phase 7 explicitly waives email
  implementation; it remains deferred after Phase 8 until these decisions are approved.
- Provider health consumes `provider.health_check`, is platform-scoped, and carries provider ID, request ID, schema version, and schedule timestamp only.

## 31. Provider Health Worker

Run once every 60 seconds for every provider ID from the approved enabled-
provider registry. The scheduler generates the canonical server request ID;
clients cannot enqueue arbitrary provider IDs.

### 31.1 Redis key

```text
health:{providerId}
```

### 31.2 Value

```ts
interface HealthStatus {
  state: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  checkedAt: string;
}
```

The Redis value contains no raw provider response, raw error, SDK payload,
credential, header, model output, or prompt. It expires after 120 seconds.

Phase 7 provider health is Redis-only. MongoDB history and incident timelines
are Phase 10 observability work.

The current production enabled-provider registry contains configured Groq only.
The fake adapter is test-only and must never be scheduled by the production
health worker. Adding another production provider requires an approved registry
change first.

### 31.3 Failure behaviour

Routing reads the Redis state before the existing ordered candidate execution.
`UNHEALTHY` skips the candidate. `HEALTHY` and `UNKNOWN` do not change existing
capability, circuit-breaker, retry, or fallback behavior. Missing, expired, or
unreadable state is `UNKNOWN`. Redis failure therefore falls back to static
capabilities and local circuit-breaker state; health checks log only safe
failure categories and do not crash the worker process.

Canonical adapter mapping:

```text
healthy   -> HEALTHY
degraded  -> UNKNOWN
unhealthy -> UNHEALTHY
```

## 32. Redis Key Catalog

| Purpose | Key | TTL | Failure mode |
|---|---|---:|---|
| Prompt cache | `cache:prompt:{opaqueHmac(canonicalCacheInput)}` | `PROMPT_CACHE_TTL_SECONDS=3600` when enabled | Fail open; implementation deferred pending Phase 9 storage |
| Idempotency | `chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}` | `PROCESSING=300s`; `COMPLETED=3600s` | Fail closed for chat write |
| Provider health | `health:{providerId}` | 120 seconds; refreshed every 60 seconds | Missing/error becomes `UNKNOWN`; use static/local state |
| Rate limit | `rate:{orgId}:{userId}:{window}` | Window length | Fail closed on login; configurable on chat |
| Queue data | BullMQ-managed keys | Queue-managed | Async features delayed |

All custom keys must include a namespace and tenant identifier where tenant-specific.

## 33. Rate Limiting

Recommended MVP limits:

| Route | Limit |
|---|---|
| Login | 10 attempts per IP and opaque account key per 15 minutes |
| Refresh | 30 per session per 15 minutes |
| Chat FREE | 10 per user and 60 per organisation per minute |
| Chat PRO | 30 per user and 300 per organisation per minute |
| Chat ENTERPRISE | 60 per user and 1200 per organisation per minute |
| Admin export | 5 per admin per hour |

Chat enforces both configured plan limits. The six required environment values
have no hidden defaults. Enterprise custom overrides remain deferred.
Rate-limit errors return `429 RATE_LIMITED` with a safe retry-after value.

Login rate-limit keys must not contain raw IP, email, or organisation slug.
Derive IP and account key components with HMAC-SHA-256 using the dedicated
`AUTH_RATE_LIMIT_SECRET`. Trust forwarded IP headers only through the approved
loopback, link-local, or private-network reverse-proxy boundary; public peers
cannot supply a trusted forwarding chain. Login fails closed with a generic `503` when
Redis rate limiting is unavailable.

## 34. Admin API Design

### 34.0 Phase 8 canonical implementation boundary

Phase 8 implements read-only organisation administration over authoritative
persisted fields only. Permissions use the existing lowercase namespaced
allowlist. Every repository query receives trusted `req.auth.orgId`; ordinary
client input never supplies tenant scope.

Supported routes are `GET /admin/summary`, `GET /admin/logs`,
`GET /admin/billing`, `GET /admin/alerts`, `GET /admin/users`, and
`GET /admin/teams`. Results omit raw prompts, responses, message ciphertext,
credentials, prices/cost, latency, cache, fallback, and PII-risk fields because
the current authoritative schemas do not persist those values.

Team-lead log access is deferred because `RequestLog` has no trusted `teamId`.
Role/team/status/session, policy/budget/retention, and alert-resolution
mutations now use the Phase 9 append-only admin-audit guarantee. Audit export
is tenant-scoped and bounded. `ENCRYPTED_STORAGE` requires a validated active
keyring; `CUSTOM_RETENTION` is not an MVP mode.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/summary` | `admin:view_logs` | Persisted request, usage, alert, budget, and provider-health summary |
| GET | `/admin/logs` | `admin:view_logs` | Cursor pagination and persisted-field filters |
| GET | `/admin/billing` | `admin:view_billing` | Authoritative token accounting |
| GET | `/admin/alerts` | `admin:view_logs` | Read-only anomaly alerts |
| GET | `/admin/users` | `admin:manage_users` | Read-only organisation users |
| GET | `/admin/teams` | `admin:manage_users` | Read-only organisation teams and member counts |

Every query must apply `orgId` from `req.auth`. Team-lead routes use separate endpoints or explicit team-scoped query logic.

## 35. Cursor Pagination

### 35.1 Cursor payload

```ts
interface CursorPayload {
  createdAt: string;
  id: string;
}
```

Encode as base64url JSON. Sign with HMAC for tamper resistance if implementation is simple; otherwise validate all decoded fields and treat cursor as opaque but untrusted.

### 35.2 Query

```ts
const query = {
  orgId,
  ...(cursor && {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  }),
};
```

Sort by `{ createdAt: -1, _id: -1 }` and fetch `limit + 1`.

## 36. Search Filters

Supported MVP filters:

- Employee email or user ID
- Provider
- Date from/to
- PII-only
- Status
- Fallback used

No full-text search over encrypted message content.

Validation:

- Limit from 1 to 100, default 25.
- Date range must be valid and bounded.
- Provider and status must be enums.
- Employee lookup must remain inside the authenticated organisation.

## 37. Structured Logging

### 37.1 Logger configuration

```ts
const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.apiKey',
      '*.prompt',
      '*.responseText',
      '*.contentEnc',
    ],
    censor: '[REDACTED]',
  },
});
```

### 37.2 Required context

- `requestId` as the canonical correlation ID
- Future distributed trace ID only after an approved tracing migration
- `orgId`
- `userId`
- Route
- Status code
- Duration
- Provider ID
- Error code

Prompt and response content must never be logged.

## 38. Metrics

### 38.1 Registry and scrape boundary

Phase 10 uses one process-local Prometheus registry per runtime. The API exposes
`GET /metrics` only inside the private runtime network. The worker exposes a
separate internal-only metrics listener on validated
`WORKER_METRICS_PORT=9464` because it does not run the public API.
The ALB must not route either metrics endpoint publicly. Scrapes do
not require application authentication because network isolation is mandatory;
public exposure is a deployment failure.

The frontend has no Prometheus registry. Default Node.js process metrics may be
enabled without custom tenant or request labels. `/metrics` itself is excluded
from HTTP request metrics to avoid scrape feedback.

The worker listener binds inside the worker container, serves only
`GET /metrics`, returns `404` for application routes, starts once with worker
infrastructure, and closes before dependency shutdown. Deployment security
groups/firewalls must not publish port `9464`.

### 38.2 Canonical application metric inventory

| Metric | Type | Labels | Observation contract |
|---|---|---|---|
| `proxiai_http_requests_total` | Counter | `route`, `method`, `status_class` | Increment once when a handled API/health response finishes |
| `proxiai_http_request_duration_seconds` | Histogram | `route`, `method`, `status_class` | Observe once from request entry to response finish/close |
| `proxiai_chat_requests_total` | Counter | `outcome`, `policy_action` | Increment once for `COMPLETED`, `FAILED`, `INTERRUPTED`, or pre-stream `BLOCKED` after policy is known |
| `proxiai_chat_completion_duration_seconds` | Histogram | `outcome` | Observe accepted non-blocked chat execution through finalization |
| `proxiai_chat_time_to_first_token_seconds` | Histogram | `provider` | Observe only when the first provider token is actually emitted; never synthesize zero |
| `proxiai_provider_requests_total` | Counter | `provider`, `outcome` | Count actual adapter executions, including interrupted streams; policy blocks never increment it |
| `proxiai_provider_request_duration_seconds` | Histogram | `provider`, `outcome` | Observe actual adapter execution duration only |
| `proxiai_provider_errors_total` | Counter | `provider`, `error_category` | Increment from normalized `ProviderError` categories only |
| `proxiai_provider_retries_total` | Counter | `provider`, `error_category`, `outcome` | Count an actual retry schedule or retry exhaustion, not initial attempts |
| `proxiai_provider_fallbacks_total` | Counter | `provider`, `outcome` | Count only candidate positions after the primary or the bounded all-unavailable terminal outcome |
| `proxiai_provider_circuit_state` | Gauge | `provider`, `state` | One-hot gauge; exactly one state is `1` per enabled provider |
| `proxiai_provider_circuit_transitions_total` | Counter | `provider`, `from_state`, `to_state` | Increment only when the state actually changes |
| `proxiai_provider_health_state` | Gauge | `provider`, `state` | One-hot projection of the approved Redis health state |
| `proxiai_policy_decisions_total` | Counter | `action`, `reason` | Increment once per evaluated policy decision |
| `proxiai_pii_detections_total` | Counter | `category` | Add the number of final non-overlapping classified spans in each category |
| `proxiai_idempotency_operations_total` | Counter | `operation`, `outcome` | Count reserve, completion, and safe pre-execution release outcomes |
| `proxiai_dependency_ready` | Gauge | `dependency` | `1` when the current MongoDB/Redis readiness state is ready, otherwise `0` |
| `proxiai_queue_jobs_total` | Counter | `queue`, `outcome` | Count successful enqueue, completion, retry, terminal failure, or schema rejection at the owning boundary |
| `proxiai_queue_job_duration_seconds` | Histogram | `queue`, `outcome` | Observe each worker processing attempt with its bounded result |
| `proxiai_queue_depth` | Gauge | `queue`, `state` | Collect BullMQ waiting, active, delayed, and failed counts at scrape time |
| `proxiai_worker_running` | Gauge | `worker` | `1` only while the managed worker lifecycle is running |
| `proxiai_worker_healthy` | Gauge | `worker` | `1` only while lifecycle and heartbeat freshness checks pass |
| `proxiai_worker_heartbeat_age_seconds` | Gauge | `worker` | Age of the last successful heartbeat; absent until a heartbeat succeeds |
| `proxiai_worker_last_successful_job_age_seconds` | Gauge | `worker` | Age of the last successful job; absent until a job succeeds |
| `proxiai_audit_writes_total` | Counter | `outcome` | Count durable AuditLog append success/failure without action or tenant labels |

Canonical histogram buckets in seconds:

```text
HTTP:     0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
Chat/LLM: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60
Queue:    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60
```

### 38.3 Strict bounded label values

- `route`: registered normalized Express templates only. Approved values are
  `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`,
  `/api/v1/auth/me`, `/api/v1/conversations`,
  `/api/v1/conversations/:conversationId`,
  `/api/v1/conversations/:conversationId/messages`, `/api/v1/chat/stream`,
  `/api/v1/admin/summary`, `/api/v1/admin/logs`, `/api/v1/admin/billing`,
  `/api/v1/admin/alerts`, `/api/v1/admin/users`, `/api/v1/admin/teams`,
  `/api/v1/admin/users/:userId/role`, `/api/v1/admin/users/:userId/team`,
  `/api/v1/admin/users/:userId/status`,
  `/api/v1/admin/users/:userId/revoke-sessions`, `/api/v1/admin/policy`,
  `/api/v1/admin/retention`, `/api/v1/admin/alerts/:alertId`,
  `/api/v1/admin/audit/export`, `/health/live`, `/health/ready`, and
  `unmatched`. Raw paths and query strings are forbidden.
- `method`: `GET`, `POST`, `PATCH`, `OPTIONS`, or `OTHER`.
- `status_class`: `2xx`, `3xx`, `4xx`, or `5xx`.
- `provider`: values from `ENABLED_PRODUCTION_PROVIDER_IDS`; currently `groq`.
- `error_category`: `timeout`, `rate_limit`, `authentication`,
  `invalid_request`, `unavailable`, or `provider_error`.
- `policy_action`: `ALLOW`, `ALLOW_WITH_MASK`, or `BLOCK`.
- `action`: `ALLOW`, `ALLOW_WITH_MASK`, or `BLOCK`.
- `reason`: `risk_below_mask_threshold`, `mask_threshold_reached`,
  `budget_exceeded`, or `high_risk_pii`.
- `category`: `CONTACT_INFO`, `FINANCIAL`, `GOVERNMENT_ID`, `CREDENTIAL`,
  `INTERNAL_SECRET`, or `BUSINESS_CONFIDENTIAL`.
- `outcome` is metric-specific:
  - chat: `COMPLETED`, `FAILED`, `INTERRUPTED`, `BLOCKED`;
  - provider: `succeeded`, `failed`, `interrupted`;
  - retry: `scheduled`, `exhausted`;
  - fallback: `attempted`, `succeeded`, `failed`, `all_unavailable`,
    `skipped_open_circuit`;
  - idempotency: `reserved`, `processing_duplicate`, `completed_duplicate`,
    `fingerprint_mismatch`, `unavailable`, `completed`, `released`,
    `release_refused_after_provider_start`;
  - queue: `enqueued`, `completed`, `retried`, `failed`, `invalid_payload`;
  - queue duration: `completed`, `retryable_failure`, `terminal_failure`,
    `invalid_payload`;
  - audit: `success`, `failure`.
- `operation`: `reserve`, `mark_completed`, or `release_before_execution`.
- `state` is metric-specific: circuit `CLOSED`, `OPEN`, `HALF_OPEN`; provider
  health `HEALTHY`, `UNHEALTHY`, `UNKNOWN`; queue depth `waiting`, `active`,
  `delayed`, `failed`.
- `queue`: `billing-queue`, `analytics-queue`, `anomaly-queue`,
  `health-check-queue`, or `enqueue-recovery-queue`.
- `worker`: `billing`, `analytics`, `anomaly`, `provider_health`, or
  `enqueue_recovery`.
- `dependency`: `mongodb` or `redis`.

Any value outside an allowlist must be rejected by instrumentation or mapped
only to the explicit fixed fallback (`unmatched`, `OTHER`, or `UNKNOWN`) defined
above. Instrumentation must not dynamically create new label values.

### 38.4 Prohibited labels and values

Metrics must never contain `orgId`, `userId`, `teamId`, `requestId`,
`clientRequestId`, conversation/message/session/token/family/audit/alert/job IDs,
provider request IDs, email, IP address, user agent, model, raw URL/path/query,
Redis key, Mongo query/collection value, prompt, masked prompt, response,
detected value, headers, cookies, credentials, secrets, exception messages, or
stack traces. Correlation IDs remain in redacted structured logs, never labels
or exemplars.

### 38.5 Honest deferrals

`proxiai_prompt_cache_requests_total` and response-replay metrics are reserved
names but MUST NOT be registered or emitted until those execution paths are
implemented under their approved Phase 9 storage prerequisites. Emitting a
constant zero series would falsely claim observability of a nonexistent path.

Metrics are global operational telemetry, not authoritative tenant analytics,
billing, audit, or admin-dashboard data. Existing tenant-scoped persisted stores
remain authoritative for those product views.

## 39. Health Endpoints

### 39.1 `/health/live`

Returns `200` when the process event loop is running.

### 39.2 `/health/ready`

Returns `200` only when:

- MongoDB is connected.
- Redis is connected.

Returns `503` otherwise.

Provider health is separate routing/operational state. It must not make the
base API process unready because transient provider degradation is handled by
the approved routing, retry, circuit-breaker, and fallback flow.

### 39.3 `/health/detailed`

Admin-only or disabled in production MVP. Returns dependency status without credentials or connection strings.

## 40. Frontend Technical Boundaries

Recommended structure:

```text
frontend/src/
├── app/
├── pages/
│   ├── LoginPage.tsx
│   ├── ChatPage.tsx
│   ├── ConversationsPage.tsx
│   └── AdminDashboardPage.tsx
├── components/
│   ├── ChatComposer.tsx
│   ├── MessageList.tsx
│   ├── StreamingMessage.tsx
│   ├── KpiCard.tsx
│   ├── AlertList.tsx
│   └── ProtectedRoute.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useChatStream.ts
├── services/
│   ├── apiClient.ts
│   └── authService.ts
└── types/
```

### 40.1 Token storage

- Access token: memory only.
- Refresh token: secure HTTP-only cookie managed by backend.
- On page refresh, call `/auth/refresh` once to restore session.
- Never use localStorage for refresh token.

### 40.2 SSE client

Because standard `EventSource` cannot easily send a POST body or custom authorization header, use `fetch` streaming for `/chat/stream` rather than browser `EventSource`.

The frontend reads `response.body.getReader()`, parses SSE frames, and updates the assistant message incrementally.

### 40.3 UI states

- Idle
- Submitting
- Streaming
- Masked notice
- Fallback notice
- Completed
- Blocked
- Interrupted
- Failed

The send button is disabled while one request for the conversation is actively streaming.

## 41. Security Controls

### 41.1 Input validation

- Zod validation on every request body, query, and route parameter.
- MongoDB queries built from validated values only.
- Never pass raw query objects from the client into Mongoose.

### 41.2 Tenant isolation

- Every tenant-owned collection includes `orgId`.
- Repository methods require `orgId` as an argument.
- Controllers cannot call `findById(id)` for tenant data without also enforcing organisation scope.
- Integration tests must prove cross-tenant IDs return 404 or 403.

### 41.3 CORS and cookies

- Allow only configured frontend origin.
- `credentials: true` only for trusted origin.
- Refresh cookie: host-only `httpOnly`, `Secure` in production,
  `SameSite=Lax`, path `/api/v1/auth`, seven-day max age.
- Cookie `Domain` is omitted. The MVP assumes the frontend and API are
  same-site; cross-site cookie deployment is not designed in P2-04.

### 41.4 HTTP hardening

- Helmet middleware.
- Request body size limit.
- Disable `x-powered-by`.
- No stack traces in production responses.
- Container runs as non-root.

### 41.5 SSRF

Users cannot submit provider URLs. Provider endpoints are fixed in server configuration. This prevents the provider abstraction from becoming a generic outbound HTTP proxy.

## 42. Transaction and Consistency Decisions

The MVP avoids large multi-document transactions where possible.

### 42.1 Chat finalization order

1. Finish or interrupt provider stream.
2. Create final `RequestLog`.
3. Persist messages according to retention.
4. Mark idempotency result.
5. Enqueue asynchronous jobs.

If job enqueue fails after persistence, log the safe failure and create the
durable recovery signal defined in Section 28.4. The bounded backfill worker
reconstructs safe jobs from RequestLog without changing the already completed
request response.

### 42.2 Audit-sensitive changes

Admin configuration update and audit append should use a MongoDB transaction when available. Without transaction support, write audit first with proposed change metadata, then update configuration, and create a failure audit entry if update fails.

## 43. Testing Strategy for Implementation

## 43.1 Unit tests

Required modules:

- Environment parsing
- Password and token helpers
- Refresh-token reuse detection
- Permission mapping
- PII detectors
- Span normalization and masking
- Risk scoring
- Policy engine
- Intent classifier
- Routing score and tie-breaker
- Retry classification
- Circuit-breaker transitions
- Cache normalization and hash
- Cursor encoding/decoding
- Encryption round trip
- Provider error normalization

## 43.2 Integration tests

Use test MongoDB and Redis containers or isolated test databases.

Required flows:

- Login, refresh, logout
- Refresh-token reuse revokes family
- Cross-organisation conversation access denied
- Blocked prompt never calls provider mock
- Masked prompt sends only masked text to provider mock
- Idempotency prevents duplicate provider invocation
- **DEFERRED —** Cache-hit provider bypass after Phase 9 safe-storage and accounting prerequisites exist
- Provider fallback selects second provider
- Mid-stream failure returns interruption event
- Metadata-only mode stores no message content
- Encrypted-storage mode does not store plaintext
- Admin filters remain tenant-scoped
- Audit entries are created for policy and admin actions
- Worker duplicate job does not double count

## 43.3 End-to-end tests

Minimum demo scenarios:

1. User logs in and receives streamed response.
2. Email is masked before provider call.
3. API key pattern is blocked.
4. Primary provider fails and fallback succeeds.
5. Admin sees request, cost, latency, and fallback count.

## 43.4 Test doubles

Create `FakeProviderAdapter` with configurable behaviours:

- Successful completion
- Successful stream
- Timeout
- Rate limit
- Authentication error
- Failure before first token
- Failure after N tokens

This keeps tests deterministic and avoids real provider cost.

## 44. Docker Design

### 44.1 Backend Dockerfile

The executable Dockerfiles are canonical. Frontend and backend use pinned
Node 22 Debian-slim build stages and a distroless non-root runtime. Only
production dependencies and build output enter the final images. `.env`, Git,
tests, local data, and development output are excluded by `.dockerignore`.

The backend image defaults to `/usr/local/bin/node dist/server.js` and exposes
the API on `8080`. The same immutable digest runs the worker with
`/usr/local/bin/node dist/worker.js`; the worker has no public application
port. The frontend standalone image serves `3000`. Health checks use
dependency-free frontend `/healthz`, API `/health/ready`, and worker lifecycle
plus heartbeat/queue evidence.

A separate command runs workers:

```text
node dist/worker.js
```

### 44.2 Docker Compose services

- `gateway`
- `api`
- `worker`
- `frontend`
- `redis`

The production-like local stack uses an explicit external/container-reachable
MongoDB URI; it does not silently create a different database authority. The
API and worker use the same image but different commands. Redis runs with AOF
and `noeviction`. Nginx mirrors the approved same-origin production routing.
Prometheus/Grafana and Bull Board are not part of this Compose contract.

## 45. AWS ECS/Fargate MVP Deployment

Recommended services:

1. `proxiai-api`
2. `proxiai-worker`
3. `proxiai-frontend`

The API and BullMQ worker run as separate ECS services from the same backend image. The worker has no HTTP listener, uses an explicit desired-count deployment parameter, and must remain continuously available. Deployment readiness requires worker heartbeat and queue-processing smoke evidence.

Active staging/rollback proof uses one 256 CPU/512 MiB frontend, API, and worker
task with no autoscaling. Desired count zero is a deliberate cost-stop state,
not a healthy deployed environment. Production promotes the same tested image
digests to one task per service. Reviewed snapshot-driven power controls manage
demo cost; worker and metrics endpoints remain private.

## 46. Implementation Sequence

## Week 1 — Core Foundation

1. Backend and frontend scaffolding
2. Environment validation
3. MongoDB and Redis clients
4. Shared response and error handling
5. Organisation, user, refresh-token models
6. Login, refresh, logout, and auth middleware
7. Conversation creation and list routes
8. One fake provider and one real provider adapter
9. Basic RequestLog persistence

Exit gate: an authenticated user can create a conversation and receive a non-streamed provider response in local Docker.

## Week 2 — Provider Routing and Resilience

1. Provider interface and three adapters
2. Capability registry
3. Provider error normalization
4. Retry/backoff
5. Circuit breaker
6. Health cache
7. Rule-based intent classifier
8. Routing engine and fallback
9. Provider test doubles

Exit gate: primary provider failure reliably selects the next eligible provider.

## Week 3 — PII, Policy, Redis, and Workers

1. PII detectors
2. Classification and scoring
3. Masking
4. Policy engine
5. Idempotency
6. Secure prompt-cache contract; implementation deferred to Phase 9 prerequisites
7. BullMQ setup
8. Billing and analytics workers
9. Audit log

Exit gate: normal, masked, blocked, duplicate, fingerprint-mismatch, expiry, and Redis fail-closed flows pass integration tests. Cache-hit and response-replay gates remain deferred to Phase 9 prerequisites.

## Week 4 — Streaming and Admin

1. SSE server implementation
2. Fetch-stream frontend hook
3. Conversation message UI
4. Mid-stream interruption handling
5. Admin summary API
6. Logs with cursor pagination and filters
7. Billing and alert views
8. RBAC checks

Exit gate: end-to-end demo works in browser for employee and organisation admin.

## Week 5 — Security, Observability, and Deployment

1. Encryption-at-rest support
2. Pino redaction
3. Prometheus metrics
4. Health endpoints
5. Docker multi-stage builds
6. Docker Compose cleanup
7. ECS/Fargate staging, production, and rollback deployment tests
8. Final integration and E2E tests
9. Documentation updates

Exit gate: fresh local setup and deployed demo both pass the acceptance checklist.

## 47. Coding Standards

- Keep controllers thin.
- Keep provider SDK code inside adapters.
- Use dependency injection through constructor arguments or explicit factory functions.
- No direct `process.env` reads outside `config/env.ts`.
- No direct Redis key creation outside dedicated Redis services.
- No raw Mongoose model use from controllers.
- All async functions must handle or propagate errors.
- Avoid hidden side effects in utility functions.
- Use descriptive domain names rather than generic `data`, `item`, or `handler` names.
- Public interfaces and difficult algorithms require comments; obvious code does not.

## 48. Definition of Technical Completion

The TDD implementation is complete when:

- Every MVP route has schema validation.
- Every tenant-owned database query is organisation-scoped.
- Every provider implements the same adapter interface.
- PII and policy complete before any provider call.
- Blocked prompts never reach provider mocks in tests.
- Masked prompts send only masked content.
- Duplicate IDs do not create duplicate provider calls.
- Fallback works before first token.
- Mid-stream failure returns a visible interruption event.
- Metadata-only mode stores no content.
- Encrypted mode stores no plaintext content.
- Refresh-token reuse revokes the family.
- Audit logs have no update/delete path.
- Queue workers are idempotent.
- Logs redact secrets and content.
- Health and metrics endpoints work.
- Docker Compose starts the complete local system.
- Required unit, integration, and E2E tests pass.

## 49. Known MVP Limitations

1. Circuit-breaker state is local to one API instance.
2. Budget enforcement may have a small race near the exact monthly limit.
3. Regex PII detection can produce false positives and false negatives.
4. No automatic provider switch after partial response streaming.
5. One environment master key protects encrypted content.
6. Prompt-cache implementation and response replay remain deferred to Phase 9 safe-storage/accounting prerequisites; the approved future contract is restricted to low-risk requests with zero detected spans.
7. No full-text search over encrypted prompt content.
8. Worker desired count, task sizing, and autoscaling remain explicit deployment parameters.
9. Provider cost tables may need manual updates.
10. The design supports compliance evidence but does not make ProxiAI certified.

## 50. Open Technical Questions

1. Which third provider will be used alongside Groq and Gemini for the MVP?
2. Which provider models and current token prices should be configured at implementation time?
3. Will MongoDB run locally only for the first demo or use MongoDB Atlas?
4. Should organisation registration be self-service or seed-script based for the MVP?
5. Should encrypted conversation content be visible to organisation administrators, or only to the originating employee? The safer default is employee-only.
6. Which hosting option will keep the BullMQ worker continuously available?
7. Is Razorpay required in the first deployed demo, or can subscription plans be seeded manually?

None of these questions requires adding a new feature. They only resolve implementation choices inside the approved scope.

## 51. Traceability Summary

| PRD/SDD capability | Main technical sections |
|---|---|
| Authentication and session security | 10, 11 |
| Tenant isolation and RBAC | 9, 11, 41 |
| Conversations and chat | 13, 14, 25, 40 |
| PII and policy | 15, 16 |
| Provider abstraction | 19 |
| Routing and resilience | 20–24 |
| Cache and idempotency | 17, 18, 32 |
| Retention and encryption | 26 |
| Audit | 27 |
| Billing, analytics, anomaly | 28–30 |
| Provider health | 31 |
| Admin dashboard and pagination | 34–36 |
| Observability | 37–39 |
| Security | 41 |
| Testing | 43 |
| Deployment | 44, 45 |

## 52. TDD Self-Audit

### 52.1 Scope audit — PASS

No new product capability was introduced. The design remains inside the approved beginner-friendly PRD and SDD. Advanced approval workflows, SSO, BYOK, ML classification, Kafka, distributed circuit-breaker state, multi-region deployment, and seamless mid-stream fallback remain deferred.

### 52.2 Beginner and solo-developer audit — PASS

The implementation uses one backend repository, one API process, one worker process, MongoDB, Redis, and a small React frontend. Complex behaviour is split into ordered weekly phases with explicit exit gates.

### 52.3 Security-order audit — PASS

Authentication, tenant validation, idempotency, PII detection, and policy evaluation occur before provider selection. Blocked prompts have no code path to a provider adapter.

### 52.4 Tenant-isolation audit — PASS

Tenant-owned models include `orgId`; repositories require trusted organisation scope; cross-tenant integration tests are mandatory; client-provided organisation identifiers cannot override authentication context.

### 52.5 Sensitive-data audit — PASS

Raw sensitive spans are excluded from logs, metrics, queues, and audit metadata. Metadata-only retention writes no prompt or response content. Encrypted storage uses AES-256-GCM with unique IVs.

### 52.6 Reliability audit — PASS FOR MVP

Retries, timeouts, circuit breakers, pre-stream fallback, idempotency, queue retries, worker idempotency, and health checks are specified. Distributed breaker state and strict budget reservation are correctly identified as post-MVP improvements.

### 52.7 Consistency audit — PASS

The TDD follows the PRD and SDD terminology, roles, retention modes, policy actions, provider pattern, Redis responsibilities, queue responsibilities, and five-week delivery plan.

### 52.8 Implementability audit — PASS

Every major subsystem includes contracts, state, error behaviour, persistence expectations, or route definitions. The design is detailed enough to begin coding without first adding another design layer.

### 52.9 Important corrections made during audit

- BullMQ is used directly for asynchronous jobs; a second Redis Pub/Sub abstraction is not required for the MVP.
- Browser `EventSource` is not used for authenticated POST chat requests; the frontend uses `fetch` streaming and parses SSE frames.
- Fallback is limited to failures before the first token, preventing unsafe response splicing.
- Redis cache failure is fail-open, while Redis idempotency failure is fail-closed for paid chat writes.
- Prometheus labels exclude organisation and user IDs to avoid sensitive, high-cardinality metrics.
- A separate archive worker is not mandatory while MongoDB TTL handles the approved retention need.

## 53. Final Approval

**Approved as the technical implementation baseline for the ProxiAI beginner solo-developer MVP.**

The next document should be `04_DATABASE_DESIGN.md`, created only after this TDD is accepted.
