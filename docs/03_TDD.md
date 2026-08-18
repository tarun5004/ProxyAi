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
- Redis for idempotency, prompt cache, provider health, rate limiting, and BullMQ
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
- Pino logs, Prometheus metrics, health endpoints, Docker, and Cloud Run

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
| Deployment | GCP Cloud Run | Manual deploy for MVP |

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
APP_ENCRYPTION_KEY
GROQ_API_KEY
GEMINI_API_KEY
THIRD_PROVIDER_API_KEY
RESEND_API_KEY
EMAIL_FROM
FRONTEND_ORIGIN
LOG_LEVEL
```

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
  APP_ENCRYPTION_KEY: z.string().min(32),
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
  userId: string;
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
5. When `usedAt` is already set, revoke every token in the same `familyId`, emit `auth.refresh_reuse_detected`, and return the generic refresh failure response.
6. Mark the current token as used.
7. Generate a new random refresh token.
8. Store only its hash in the same token family.
9. Issue a new access token.
10. Replace the refresh cookie.

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
type Role = 'employee' | 'team_lead' | 'org_admin' | 'super_admin';
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
  retentionDays?: number;
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
  role: 'user' | 'assistant';
  contentEnc?: EncryptedPayload;
  tokenCount?: number;
  createdAt: Date;
}
```

In `METADATA_ONLY`, no content is stored. In `ENCRYPTED_STORAGE`, content is encrypted before persistence.

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
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  piiRiskScore: number;
  piiCategories: PiiCategory[];
  cacheHit: boolean;
  fallbackUsed: boolean;
  status: 'completed' | 'blocked' | 'failed' | 'interrupted';
  errorCode?: string;
  createdAt: Date;
}
```

Primary index: `{ orgId: 1, createdAt: -1 }`.

## 12.6 AuditLog

```ts
interface AuditLog {
  orgId: ObjectId;
  actorId?: ObjectId;
  actorType: 'user' | 'system' | 'super_admin';
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
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
| GET | `/conversations/:id/messages` | `CHAT_VIEW_OWN` | Read retained messages |
| POST | `/chat/stream` | `CHAT_SEND` | Submit prompt and stream response |

### 13.2 Chat request schema

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
10. If BLOCK: write safe policy event, complete idempotency, and return JSON `403 POLICY_BLOCKED` before SSE headers
11. Build masked or original approved provider prompt
12. Check prompt cache only after Phase 9 provides the approved encrypted or safe-reference storage prerequisite
13. Load provider health and select the eligible provider order
14. Call primary through retry and circuit breaker
15. Fall back only before streaming if another approved adapter exists
16. Stream chunks to client
17. Persist known usage or an explicit unknown-usage accounting record
18. Reconcile the billing rollup when usage is known
19. Mark idempotency result completed
20. Close SSE connection
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

Plaintext assistant responses in Redis are not approved. A future cache value may contain either an encrypted response payload or an access-checked safe reference plus the minimum safe coordination metadata. Neither storage capability exists yet, so prompt-cache implementation is deferred until Phase 9 provides one of them.

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

If accounting or budget reconciliation fails after provider execution may have started, the request path must still attempt to convert the matching `PROCESSING` record to the `COMPLETED` tombstone in a `finally` boundary. The operational error still propagates safely; tombstone failure also remains fail closed.

The key and record contain no prompt, response, email, raw tenant/user identifiers, PII, provider secret, token, final API status/code, or provider usage. `COMPLETED` is a non-replayable tombstone; response replay/storage remains deferred until Phase 9 provides approved encrypted payload or access-checked safe-reference storage.

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
3. Mark the idempotency reservation completed so the same client request ID cannot create another paid call.
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
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
  keyVersion: number;
}
```

Use a random 12-byte IV for every encryption operation. Never reuse an IV with the same key.

## 26.3 Encryption service

```ts
interface EncryptionService {
  encrypt(plainText: string): EncryptedPayload;
  decrypt(payload: EncryptedPayload): string;
}
```

The MVP uses one application master key from the environment. This is acceptable for the local/demo MVP only. GCP Secret Manager and per-organisation keys remain roadmap items.

## 26.4 Persistence enforcement

The retention mode must be read before constructing message write objects.

```ts
function buildMessageWrite(
  mode: RetentionMode,
  message: PlainMessage,
): MessageWrite | null {
  if (mode === 'METADATA_ONLY') return null;
  return {
    ...message.metadata,
    contentEnc: encryptionService.encrypt(message.content),
  };
}
```

The code must not construct a plain-content MongoDB document and remove content later.

## 27. Audit Logging

### 27.1 Events

MVP audit actions include:

- `auth.login_succeeded`
- `auth.login_failed`
- `auth.login_operational_error`
- `auth.logout`
- `auth.refresh_reuse_detected`
- `policy.allow`
- `policy.mask`
- `policy.block`
- `admin.user_created`
- `admin.user_role_changed`
- `admin.user_deactivated`
- `admin.policy_changed`
- `admin.budget_changed`
- `admin.retention_changed`
- `audit.exported`

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

### 27.3 Failure handling

- Policy blocks and admin actions should fail closed when their audit write fails because these are compliance-relevant actions.
- Login-success audit failure may log an operational error and continue only if the product would otherwise become unavailable. This exception must be clearly logged.
- Raw prompts, responses, tokens, passwords, cookies, and API keys must never be included.

## 28. BullMQ Design

## 28.1 Queues

| Queue | Job name | Producer | Consumer |
|---|---|---|---|
| `billing-queue` | `request.completed` | Chat finalizer | Billing worker |
| `analytics-queue` | `request.completed` | Chat finalizer | Analytics worker |
| `anomaly-queue` | `usage.updated` | Analytics/billing | Anomaly worker |
| `email-queue` | `alert.created` | Alert service | Email worker |
| `health-check-queue` | `provider.health_check` | Repeat scheduler | Health worker |

The architecture source mentions an archive queue. For the simplified MVP, retention deletion is handled through MongoDB TTL where applicable, so a separate archive worker is not required unless custom retention is implemented later.

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
  requestLogId: string;
  orgId: string;
  userId: string;
  providerId: ProviderId | 'cache';
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  occurredAt: string;
}
```

### 28.4 Idempotent workers

Every worker must tolerate duplicate delivery. Use a unique natural key or upsert operation.

Examples:

- Billing upsert key: `orgId + period + userId`
- Daily analytics key: `orgId + date`
- Alert dedupe key: `orgId + userId + type + timeWindow`

## 29. Billing Worker

### 29.1 Period

Use UTC month in `YYYY-MM` format.

### 29.2 Update

Atomic upsert:

```ts
$inc: {
  totalTokens: job.totalTokens,
  totalCostUsd: job.estimatedCostUsd,
  requestCount: 1,
  [`byProvider.${job.providerId}.tokens`]: job.totalTokens,
  [`byProvider.${job.providerId}.costUsd`]: job.estimatedCostUsd,
}
```

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

## 30. Analytics and Anomaly Workers

### 30.1 Analytics

Store daily organisation and user aggregates needed by the dashboard:

- Request count
- Total tokens
- Estimated cost
- Failure count
- Fallback count
- Cache-hit count
- Average latency accumulation

### 30.2 Anomaly rule

MVP rule:

```text
current daily user tokens > 2 × previous 7-day daily average
```

Do not flag when there is insufficient baseline data. Recommended minimum: 3 previous active days.

### 30.3 Alert deduplication

Only one unresolved anomaly alert per user per day.

## 31. Provider Health Worker

Run once every 60 seconds.

### 31.1 Redis key

```text
health:{providerId}
```

### 31.2 Value

```ts
interface HealthStatus {
  state: 'healthy' | 'degraded' | 'down';
  avgLatencyMs: number;
  consecutiveFailures: number;
  checkedAt: string;
}
```

### 31.3 Failure behaviour

When Redis is unavailable, routing falls back to static capabilities and local circuit-breaker state. Health checks should continue logging failures without crashing the worker process.

## 32. Redis Key Catalog

| Purpose | Key | TTL | Failure mode |
|---|---|---:|---|
| Prompt cache | `cache:prompt:{opaqueHmac(canonicalCacheInput)}` | `PROMPT_CACHE_TTL_SECONDS=3600` when enabled | Fail open; implementation deferred pending Phase 9 storage |
| Idempotency | `chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}` | `PROCESSING=300s`; `COMPLETED=3600s` | Fail closed for chat write |
| Provider health | `health:{providerId}` | 2 min refreshed | Use static/local state |
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
`AUTH_RATE_LIMIT_SECRET`. Do not trust forwarded IP headers without explicit
trusted-proxy configuration. Login fails closed with a generic `503` when
Redis rate limiting is unavailable.

## 34. Admin API Design

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/summary` | `ADMIN_VIEW_LOGS` | KPI summary |
| GET | `/admin/logs` | `ADMIN_VIEW_LOGS` | Cursor pagination and filters |
| GET | `/admin/billing` | `ADMIN_VIEW_BILLING` | Monthly rollups |
| GET | `/admin/alerts` | `ADMIN_VIEW_LOGS` | Unresolved/resolved alerts |
| PATCH | `/admin/policy` | `ADMIN_CONFIGURE_POLICY` | Thresholds and budget |
| PATCH | `/admin/retention` | `ADMIN_CONFIGURE_POLICY` | Metadata/encrypted mode |
| GET | `/admin/audit/export` | `ADMIN_EXPORT_AUDIT` | CSV export |

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

- `requestId`
- `traceId` when available
- `orgId`
- `userId`
- Route
- Status code
- Duration
- Provider ID
- Error code

Prompt and response content must never be logged.

## 38. Metrics

Core metrics:

```text
http_request_duration_seconds{route,method,status}
http_requests_total{route,method,status}
llm_provider_latency_seconds{provider}
llm_provider_errors_total{provider,error_code}
llm_requests_total{provider,status}
circuit_breaker_state{provider}
cache_requests_total{result}
queue_jobs_total{queue,status}
queue_job_duration_seconds{queue}
policy_decisions_total{action,reason}
pii_detections_total{category}
```

Do not put `orgId`, `userId`, prompt text, request ID, or other high-cardinality/sensitive values into Prometheus labels.

## 39. Health Endpoints

### 39.1 `/health/live`

Returns `200` when the process event loop is running.

### 39.2 `/health/ready`

Returns `200` only when:

- MongoDB is connected.
- Redis is connected.
- At least one provider is configured and not known to be down.

Returns `503` otherwise.

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

If job enqueue fails after persistence, log the failure and retry enqueue when possible. The request response should not be changed after the stream is already complete.

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
- Cache hit avoids provider invocation
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

Use a multi-stage build:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

A separate command runs workers:

```text
node dist/worker.js
```

### 44.2 Docker Compose services

- `backend`
- `worker`
- `frontend`
- `mongo`
- `redis`
- Optional `prometheus`
- Optional `grafana`

The API and worker use the same image but different commands.

## 45. Cloud Run MVP Deployment

Recommended services:

1. `proxiai-api`
2. `proxiai-worker`
3. Frontend hosted separately or as a static build service

Important limitation: Cloud Run is not ideal for permanently running BullMQ workers when configured to scale to zero. For the portfolio MVP, either keep one worker instance available or run the worker on a simple always-on environment. This operational decision must be tested before claiming production readiness.

The API may use minimum instances `0` during development and demo. Increase to `1` only when cold-start latency matters.

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
6. Prompt cache
7. BullMQ setup
8. Billing and analytics workers
9. Audit log

Exit gate: normal, masked, blocked, cached, and duplicate prompt flows pass integration tests.

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
7. Cloud Run deployment test
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
6. Prompt cache is intentionally restricted to low-risk simple requests.
7. No full-text search over encrypted prompt content.
8. Worker hosting on Cloud Run requires careful minimum-instance configuration.
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
