# ProxiAI Database Design Document

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | Database Design Document |
| Version | 1.0 |
| Status | MVP Implementation Baseline |
| Intended audience | Solo developer, reviewer, tester, interviewer |
| Primary inputs | `01_PRD.md`, `02_SDD.md`, `03_TDD.md`, and ProxiAI Architecture Document v2.0 |
| Scope rule | No feature beyond the approved beginner-friendly MVP is introduced |
| Primary database | MongoDB 7 with Mongoose |
| Supporting data store | Redis 7 for temporary and operational state |

## 2. Purpose

This document defines the persistent and temporary data design for the ProxiAI MVP. It converts the approved product, system, and technical requirements into MongoDB collections, Mongoose model rules, indexes, tenant-isolation constraints, retention behaviour, encryption boundaries, Redis key patterns, migration expectations, and database-level test cases.

The design is intentionally suitable for one beginner solo developer. It avoids premature sharding, event sourcing, multiple database engines, complex data warehouses, and advanced distributed locking. The first goal is a safe, understandable, and queryable database model that supports the complete MVP request flow.

## 3. Scope Guardrails

### 3.1 Included

- Multi-tenant organisation data
- Users, teams, roles, and permissions
- Refresh-token rotation and token-family reuse detection
- Conversations and messages
- Per-request operational logs
- Append-only audit logs
- Monthly billing and usage rollups
- Alerts
- Provider health history
- Organisation policy, budget, feature, and retention settings
- Metadata-only and encrypted-storage retention modes
- Optional custom-retention expiry field and TTL index
- MongoDB compound indexes for approved access patterns
- Redis keys for cache, idempotency, health, rate limiting, and BullMQ
- Seed and migration strategy
- Backup, restore, validation, and database test expectations

### 3.2 Explicitly deferred

- Multi-region database replication design
- MongoDB sharding
- Separate analytics warehouse
- Kafka-backed event store
- Full event sourcing
- Change Data Capture pipeline
- Search engine for encrypted prompt content
- Per-field customer-managed encryption keys
- Production HSM integration
- Object-lock audit archive
- Complex data lake or cold-storage architecture
- Cross-region disaster-recovery automation

## 4. Database Principles

1. **Tenant scope is mandatory.** Every tenant-owned collection must store `orgId` and every tenant query must include it.
2. **Security checks do not rely only on the frontend.** Backend repositories must enforce organisation filters.
3. **Sensitive content is encrypted before persistence.** Raw prompts, responses, provider keys, refresh tokens, and credentials must never be stored in plaintext.
4. **Audit data is separate from business request data.** Audit logs and request logs answer different questions and use different permissions.
5. **Indexes follow real access patterns.** The MVP will not add speculative indexes.
6. **Derived dashboard data is pre-aggregated only where needed.** Billing uses monthly rollups; normal request history remains in `RequestLog`.
7. **Retention is enforced before writing.** Metadata-only mode never constructs encrypted content fields.
8. **Database validation is defense in depth.** Zod validates API input and Mongoose schema validation protects persistence.
9. **Soft delete is used only where recovery or auditability matters.** Immutable records are not silently overwritten.
10. **The beginner implementation stays simple.** One MongoDB database and one Redis instance are sufficient for MVP.

## 5. Data Classification

| Classification | Examples | Storage rule |
|---|---|---|
| Public | Provider display name, UI label | Plaintext allowed |
| Internal | Feature flags, plan, provider health | Plaintext with access control |
| Confidential | User email, team membership, billing totals | Plaintext only where operationally required; tenant-scoped |
| Sensitive content | Prompts, responses, conversation message text | AES-256-GCM encrypted before MongoDB write |
| Secret | Provider API keys, refresh tokens, encryption keys | Never plaintext; refresh tokens hashed; provider keys encrypted; master key outside MongoDB |
| Security audit | Login events, policy decisions, admin changes | Append-only, restricted access, no raw sensitive content |

## 6. Identifier Strategy

### 6.1 MongoDB identifiers

MongoDB `_id` uses the default `ObjectId` for internal collection identity.

### 6.2 Public identifiers

Entities exposed through APIs should also use stable opaque public identifiers where useful:

```text
orgId: UUID string
userId: UUID string
teamId: UUID string
conversationId: UUID string
requestId: UUID string
alertId: UUID string
```

This avoids exposing MongoDB `ObjectId` values as the primary external contract and simplifies future migrations.

### 6.3 Identifier rules

- IDs are generated by the backend, never trusted from an unauthenticated client.
- `orgId` is copied from authenticated organisation context, not accepted as a free-form body field for employee routes.
- Client-generated request IDs are allowed only for idempotency and are stored separately as `clientRequestId`.
- Public identifiers are unique and immutable.

## 7. Naming and Type Conventions

- Collection names use plural lower-case names in MongoDB.
- TypeScript model names use singular PascalCase.
- Date fields use BSON `Date` and UTC.
- Currency values use integer micro-units where practical or `Decimal128`; floating-point arithmetic must not be used for authoritative totals.
- Token counts use non-negative integers.
- Boolean names start with `is`, `has`, or a clear state name.
- Enum values use upper snake case for policy and retention decisions.
- All schemas use `timestamps: true` only when updates are valid. Append-only collections use `createdAt` or `occurredAt` without `updatedAt`.

## 8. Collection Summary

| Collection | Purpose | Tenant scoped | Sensitive content | Main write source |
|---|---|---:|---:|---|
| `organisations` | Tenant configuration and plan | No, root tenant record | Policy and billing config | Admin service |
| `teams` | Team grouping inside an organisation | Yes | No | Admin service |
| `users` | Identity, role, team, status | Yes | Email | Auth/admin service |
| `refresh_tokens` | Rotating refresh-token families | Yes | Hashed token only | Auth service |
| `conversations` | Conversation header and ordering | Yes | Title may be sensitive | Chat service |
| `messages` | User and assistant message records | Yes | Encrypted content | Chat/retention service |
| `request_logs` | Per-request operational metadata | Yes | No raw prompt/response | Request pipeline |
| `audit_logs` | Append-only security and admin history | Yes | No raw prompt/response | Auth, policy, admin services |
| `billing_rollups` | Monthly organisation/user/provider totals | Yes | Financial usage data | Billing worker |
| `alerts` | PII, budget, anomaly, and system alerts | Yes | No raw prompt/response | Workers and policy engine |
| `provider_health` | Current and historical provider state | Platform-level | No | Health worker |

## 9. Organisation Collection

### 9.1 Purpose

Stores one record per customer organisation and contains the configuration required during every authenticated request.

### 9.2 Mongoose shape

```ts
interface OrganisationDocument {
  _id: Types.ObjectId;
  orgId: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  monthlyTokenBudget: number;
  currentBillingPeriod: string;
  retention: {
    mode: 'METADATA_ONLY' | 'ENCRYPTED_STORAGE' | 'CUSTOM_RETENTION';
    retentionDays?: number;
  };
  policy: {
    maskThreshold: number;
    blockThreshold: number;
  };
  routing: {
    autoRoutingEnabled: boolean;
    allowedProviders: string[];
    defaultProvider?: string;
    weights: {
      capability: number;
      latency: number;
      cost: number;
      health: number;
    };
  };
  featureFlags: {
    autoRouting: boolean;
    teamLeadView: boolean;
    anomalyDetection: boolean;
    auditExport: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### 9.3 Validation rules

- `orgId`, `name`, and `slug` are required.
- `slug` is lower-case and URL-safe.
- `monthlyTokenBudget >= 0`.
- `maskThreshold` is between 0 and 100.
- `blockThreshold` is between 0 and 100.
- `blockThreshold` must be greater than `maskThreshold`.
- `retentionDays` is required only for `CUSTOM_RETENTION`.
- `retentionDays` must be a positive integer.
- Routing weights must each be between 0 and 1.
- Routing weights should total 1.0. The service must normalize them if minor decimal variance exists.

### 9.4 Indexes

```ts
organisationSchema.index({ orgId: 1 }, { unique: true });
organisationSchema.index({ slug: 1 }, { unique: true });
organisationSchema.index({ status: 1 });
```

### 9.5 Update rules

- Plan, budget, retention, policy, and feature changes require `org_admin` permission.
- Every configuration change writes an `AuditLog` record containing old and new safe values.
- Encryption keys, provider secrets, and raw credentials are not stored in this collection.

## 10. Team Collection

### 10.1 Purpose

Groups users so a team lead can view only activity for assigned team members.

```ts
interface TeamDocument {
  _id: Types.ObjectId;
  teamId: string;
  orgId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 10.2 Indexes

```ts
teamSchema.index({ teamId: 1 }, { unique: true });
teamSchema.index({ orgId: 1, name: 1 }, { unique: true });
teamSchema.index({ orgId: 1, isActive: 1 });
```

### 10.3 Rules

- Team names are unique inside one organisation, not globally.
- A team cannot be assigned to a user from another organisation.
- Deactivation is preferred over deletion after users have activity.

## 11. User Collection

### 11.1 Purpose

Stores authentication identity, organisation membership, role, team, and account status.

```ts
interface UserDocument {
  _id: Types.ObjectId;
  userId: string;
  orgId: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  displayName: string;
  role: 'EMPLOYEE' | 'TEAM_LEAD' | 'ORG_ADMIN' | 'SUPER_ADMIN';
  permissions: string[];
  teamId?: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  failedLoginCount: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 11.2 Sensitive fields

- Passwords are stored only as approved Argon2id hashes; bcrypt and plaintext
  fallbacks are not supported.
- Password hashes are excluded from normal query projections.
- Email is required for login and may remain plaintext, but access is tenant-scoped.

### 11.3 Indexes

```ts
userSchema.index({ userId: 1 }, { unique: true });
userSchema.index({ orgId: 1, emailNormalized: 1 }, { unique: true });
userSchema.index({ orgId: 1, teamId: 1, status: 1 });
userSchema.index({ orgId: 1, role: 1, status: 1 });
```

### 11.4 Rules

- Email uniqueness is enforced per organisation for MVP.
- `SUPER_ADMIN` users are platform-level and must not be created through normal organisation routes.
- A disabled user cannot authenticate or refresh a session.
- Role changes revoke active refresh-token families.
- User deletion is not required for MVP. Disable the user and preserve audit history.

## 12. Refresh Token Collection

### 12.1 Purpose

Supports one-time refresh-token rotation, revocation, logout, and token-reuse detection.

```ts
interface RefreshTokenDocument {
  _id: Types.ObjectId;
  tokenId: string;
  sessionId: string;
  familyId: string;
  orgId: string;
  userId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  replacedByTokenId?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 12.2 Indexes

```ts
refreshTokenSchema.index({ tokenId: 1 }, { unique: true });
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ orgId: 1, sessionId: 1 });
refreshTokenSchema.index({ orgId: 1, familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

### 12.3 Rules

- Store only a SHA-256 or HMAC hash of the opaque refresh token.
- Raw token exists only in the secure cookie and transient application memory.
- `sessionId` and `familyId` are separate backend-generated UUIDs.
- P2-04 creates only an initial active token record.
- Successful rotation marks the old token `usedAt` and creates a new token in the same `familyId`.
- Reuse of a token with `usedAt` revokes every active token in the family.
- Expired records are removed through MongoDB TTL.

## 13. Conversation Collection

### 13.1 Purpose

Stores lightweight conversation metadata so lists can be loaded without scanning messages.

```ts
interface ConversationDocument {
  _id: Types.ObjectId;
  conversationId: string;
  orgId: string;
  userId: string;
  titleEnc?: EncryptedValue;
  titlePreview?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 13.2 Title handling

- For encrypted-storage mode, generated titles should be encrypted.
- `titlePreview` is optional and should contain no sensitive prompt text. The simplest MVP choice is a generic value such as `New conversation` until the user renames it.
- Metadata-only mode may keep only a generic title.

### 13.3 Indexes

```ts
conversationSchema.index({ conversationId: 1 }, { unique: true });
conversationSchema.index({ orgId: 1, userId: 1, lastMessageAt: -1 });
conversationSchema.index({ orgId: 1, status: 1, lastMessageAt: -1 });
```

### 13.4 Rules

- Employee reads require `{ orgId, userId, conversationId }`.
- Admin access to message content is not included in MVP.
- Archiving changes status but does not delete related request or audit records.

## 14. Message Collection

### 14.1 Purpose

Stores conversation messages independently from request metadata.

```ts
interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

interface MessageDocument {
  _id: Types.ObjectId;
  messageId: string;
  conversationId: string;
  orgId: string;
  userId: string;
  requestId?: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  contentEnc?: EncryptedValue;
  contentStored: boolean;
  tokenCount?: number;
  provider?: string;
  model?: string;
  createdAt: Date;
  expiresAt?: Date;
}
```

### 14.2 Retention rules

| Retention mode | Message persistence |
|---|---|
| `METADATA_ONLY` | Store no `contentEnc`; `contentStored = false` |
| `ENCRYPTED_STORAGE` | Store encrypted content; no expiry |
| `CUSTOM_RETENTION` | Store encrypted content with `expiresAt` |

### 14.3 Indexes

```ts
messageSchema.index({ messageId: 1 }, { unique: true });
messageSchema.index({ orgId: 1, conversationId: 1, createdAt: 1 });
messageSchema.index({ orgId: 1, requestId: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
```

### 14.4 Rules

- Raw content must be encrypted before calling `Message.create`.
- Encryption failures stop content persistence and must not fall back to plaintext.
- `contentEnc` must not be returned in raw database JSON. Repository code decrypts only for an authorised conversation owner.
- Audit and application logs must never include `contentEnc` values.
- Token count can remain stored in metadata-only mode.

## 15. Request Log Collection

### 15.1 Purpose

Stores one operational record per attempted prompt request. It powers admin logs, provider usage, latency analysis, fallback reporting, and troubleshooting.

```ts
interface RequestLogDocument {
  _id: Types.ObjectId;
  requestId: string;
  clientRequestId: string;
  orgId: string;
  userId: string;
  teamId?: string;
  conversationId: string;
  status: 'RECEIVED' | 'BLOCKED' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
  policyAction: 'ALLOW' | 'ALLOW_WITH_MASK' | 'BLOCK';
  policyReason?: string;
  piiRiskScore: number;
  piiCategories: string[];
  intent?: string;
  selectedProvider?: string;
  selectedModel?: string;
  routingReason?: 'MANUAL' | 'AUTO' | 'FALLBACK';
  attemptedProviders: string[];
  fallbackCount: number;
  cacheHit: boolean;
  circuitStateAtSelection?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostMicros?: number;
  latencyMs?: number;
  timeToFirstTokenMs?: number;
  errorCode?: string;
  createdAt: Date;
  completedAt?: Date;
}
```

Token fields are all present together or all absent. Provider-reported usage that is unavailable remains unknown. Estimated cost is absent until an approved pricing configuration exists; neither usage nor cost may be synthesized as zero.

The canonical Phase 7 outcome mapping is explicit:

- `request.completed` maps to RequestLog status `COMPLETED`, `FAILED`, or
  `INTERRUPTED` with policy action `ALLOW` or `ALLOW_WITH_MASK`; provider and
  model are required.
- `request.blocked` maps to status `BLOCKED` and policy action `BLOCK`;
  provider, model, usage, and cost are absent because provider execution is
  prohibited.

The RequestLog is appended before event publication. Analytics and billing
workers may read it using trusted `{ orgId, requestId }`, but never update or
delete it. Missing optional usage never determines or changes request status.

### 15.2 Data restrictions

Do not store:

- Raw prompt
- Raw response
- Masked prompt text
- API keys
- Authorization headers
- Stack traces
- Provider raw response bodies
- Detected secret values

### 15.3 Indexes

```ts
requestLogSchema.index({ requestId: 1 }, { unique: true });
requestLogSchema.index({ orgId: 1, createdAt: -1 });
requestLogSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
requestLogSchema.index({ orgId: 1, teamId: 1, createdAt: -1 });
requestLogSchema.index({ orgId: 1, selectedProvider: 1, createdAt: -1 });
requestLogSchema.index({ orgId: 1, status: 1, createdAt: -1 });
requestLogSchema.index({ orgId: 1, piiRiskScore: 1, createdAt: -1 });
```

### 15.4 Cursor pagination

Use `(createdAt, _id)` as the stable cursor pair to avoid duplicate or missing rows when multiple requests have the same timestamp.

```ts
const query = cursor
  ? {
      orgId,
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ],
    }
  : { orgId };

RequestLog.find(query)
  .sort({ createdAt: -1, _id: -1 })
  .limit(limit + 1);
```

## 16. Audit Log Collection

### 16.1 Purpose

Stores security, policy, authentication, administrative, and export events. It is separate from request logs.

```ts
interface AuditLogDocument {
  _id: Types.ObjectId;
  auditId: string;
  orgId: string;
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'SUPER_ADMIN';
  action: string;
  result: 'SUCCESS' | 'FAILURE';
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  occurredAt: Date;
}
```

### 16.2 Required event examples

```text
auth.login_succeeded
auth.login_failed
auth.login_operational_error
auth.logout
auth.refresh_reuse_detected
policy.allow
policy.mask
policy.block
user.invited
user.role_changed
user.disabled
organisation.policy_changed
organisation.retention_changed
organisation.budget_changed
audit.exported
provider.config_changed
```

P2-04 emits these authentication actions as structured security logs only.
The durable append-only `audit_logs` implementation remains Phase 9.

### 16.3 Indexes

```ts
auditLogSchema.index({ auditId: 1 }, { unique: true });
auditLogSchema.index({ orgId: 1, occurredAt: -1 });
auditLogSchema.index({ orgId: 1, actorId: 1, occurredAt: -1 });
auditLogSchema.index({ orgId: 1, action: 1, occurredAt: -1 });
```

### 16.4 Append-only enforcement

- Application repository exposes `create` and read methods only.
- No normal update or delete routes exist.
- Mongoose middleware rejects `updateOne`, `updateMany`, `findOneAndUpdate`, and delete operations for this model.
- Production database role should omit update/delete privileges for this collection when operationally practical.
- Metadata must contain safe identifiers, categories, scores, and changed values only. Never store raw prompts, responses, tokens, passwords, or keys.

## 17. Billing Rollup Collection

### 17.1 Purpose

Stores pre-aggregated monthly totals so budget checks and dashboards do not scan every request log.

```ts
interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  estimatedCostMicros: number;
}

interface BillingRollupDocument {
  _id: Types.ObjectId;
  orgId: string;
  period: string;
  userId?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  requestCount: number;
  completedRequestCount: number;
  failedRequestCount: number;
  cacheHitCount: number;
  fallbackRequestCount: number;
  estimatedCostMicros: number;
  byProvider: Record<string, ProviderUsage>;
  updatedAt: Date;
}
```

This richer document is a future reporting projection. The currently implemented authoritative budget rollup is intentionally minimal: `{ orgId, period, usedTokens, sourceRequestCount, updatedAt }`. It is derived from append-only `RequestLog` records and remains the budget source of truth until richer rollups are separately implemented and verified.

### 17.2 Record granularity

The MVP may keep:

1. One organisation-level monthly record with `userId` absent.
2. One user-level monthly record per user.

### 17.3 Indexes

```ts
billingRollupSchema.index(
  { orgId: 1, period: 1, userId: 1 },
  { unique: true },
);
billingRollupSchema.index({ orgId: 1, period: -1 });
```

### 17.4 Deterministic authoritative update

The current billing worker contract aggregates all trusted `RequestLog` records for `{ orgId, period }` and upserts `usedTokens` plus `sourceRequestCount` with `$set`. Reprocessing the same request therefore recomputes the same authoritative totals instead of incrementing them twice. Unknown usage never contributes a synthetic zero and keeps authoritative budget accounting unavailable.

Future user/provider/cost projections may use incremental contributions only after a separate atomic contribution or processing-ledger contract is implemented. They are not part of the current minimal budget rollup.

### 17.5 Idempotent billing rule

A BullMQ job ID should be derived from job type plus `requestId`, for example `billing-request-completed-${requestId}`. BullMQ custom job IDs must not contain `:`. BullMQ deduplication is only the first guard; the durable guard is a separate async job ledger with a unique `{ orgId, requestId, jobType }` index.

The ledger stores tenant scope, request ID, job type, `PROCESSING` or `COMPLETED` state, safe timestamps, and a bounded safe outcome. It never stores prompts, responses, PII values, secrets, token/cookie/header data, or arbitrary payloads. `RequestLog` remains append-only and must never receive `billingAppliedAt` or any worker mutation.

The implemented MVP collection is `billing_job_ledgers`. Its only declared
index is the unique compound guard `{ orgId: 1, requestId: 1, jobType: 1 }`;
the bounded outcome allowlist is `APPLIED`, `USAGE_UNAVAILABLE`, and
`COST_UNAVAILABLE`. Current token-only reconciliation does not invent a cost
outcome when pricing is absent.

## 18. Alert Collection

### 18.1 Purpose

Stores actionable PII, anomaly, budget, and provider-related alerts.

```ts
interface AlertDocument {
  _id: Types.ObjectId;
  alertId: string;
  orgId: string;
  userId?: string;
  requestId?: string;
  type: 'PII' | 'ANOMALY' | 'BUDGET_80' | 'BUDGET_EXCEEDED' | 'PROVIDER';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 18.2 Indexes

```ts
alertSchema.index({ alertId: 1 }, { unique: true });
alertSchema.index({ orgId: 1, status: 1, createdAt: -1 });
alertSchema.index({ orgId: 1, type: 1, createdAt: -1 });
alertSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
```

### 18.3 Rules

- Alert metadata must not contain raw PII or prompt content.
- Repeated budget alerts should be deduplicated for the same organisation and billing period.
- Anomaly alerts may reference normal and observed token totals but not message content.

## 19. Provider Health Collection

### 19.1 Purpose

Stores current provider state and small incident history for dashboard and troubleshooting.

```ts
interface ProviderIncident {
  startedAt: Date;
  endedAt?: Date;
  reason?: string;
}

interface ProviderHealthDocument {
  _id: Types.ObjectId;
  providerId: string;
  state: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  consecutiveSuccessCount: number;
  avgLatencyMs?: number;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  incidents: ProviderIncident[];
  updatedAt: Date;
}
```

### 19.2 Indexes

```ts
providerHealthSchema.index({ providerId: 1 }, { unique: true });
providerHealthSchema.index({ state: 1, lastCheckedAt: -1 });
```

### 19.3 Redis relationship

Redis is the hot-path source for current provider state. MongoDB stores durable history and dashboard data. If Redis is unavailable, routing may fall back to static provider configuration as defined in the TDD.

## 20. Relationship Map

```text
Organisation
  ├── Teams
  │    └── Users
  ├── Users
  │    ├── RefreshTokens
  │    ├── Conversations
  │    │    └── Messages
  │    ├── RequestLogs
  │    ├── BillingRollups
  │    └── Alerts
  ├── AuditLogs
  └── BillingRollups

ProviderHealth is platform-level and is not owned by one organisation.
```

MongoDB references use public IDs rather than Mongoose `populate` as the primary request mechanism. Explicit queries are easier to tenant-scope and reason about for the MVP.

## 21. Tenant-Isolation Design

### 21.1 Repository pattern

Every tenant-owned repository method accepts `orgId` as its first security filter.

```ts
async function findConversationForUser(
  orgId: string,
  userId: string,
  conversationId: string,
) {
  return Conversation.findOne({ orgId, userId, conversationId });
}
```

Forbidden pattern:

```ts
Conversation.findOne({ conversationId });
```

### 21.2 Organisation source

- `orgId` comes from the authenticated access token and verified user record.
- Employee endpoints ignore an `orgId` supplied in query/body.
- Super-admin endpoints use separate permission checks and explicit audit events.

### 21.3 Test requirement

For every tenant-owned repository, include a test where organisation A attempts to access organisation B's identifier. The expected result is `null`, `404`, or `403` according to route policy, never the foreign record.

## 22. Encryption Design

### 22.1 Algorithm

Use AES-256-GCM with a unique random 96-bit IV per encrypted value.

### 22.2 Stored envelope

```ts
interface EncryptedValue {
  ciphertext: string; // base64
  iv: string;         // base64
  authTag: string;    // base64
  keyVersion: number;
}
```

### 22.3 Additional authenticated data

Bind ciphertext to tenant and entity context using AAD:

```text
orgId:entityType:entityId:fieldName
```

This helps prevent moving ciphertext between organisations or fields without detection.

### 22.4 Key handling

- The master encryption key comes from environment configuration for MVP and later from GCP Secret Manager.
- The key is never stored in MongoDB.
- `keyVersion` allows future rotation.
- The MVP may use one application-level master key, but the design must not claim per-organisation cryptographic isolation.

### 22.5 Failure behaviour

- Encryption failure: do not persist plaintext; mark request persistence failure in safe logs and metrics.
- Decryption failure: return a safe error, record a security/operational log, and do not return partial ciphertext.
- Authentication-tag mismatch: treat as data corruption or tampering.

## 23. Retention and Deletion

### 23.1 Metadata Only

- Conversation headers may remain with generic titles.
- Message documents may exist without `contentEnc`, or message creation may be skipped while counters remain in the conversation header.
- Request metadata, billing, alerts, and audit records remain according to their separate purpose.

### 23.2 Encrypted Storage

- User and assistant message content is encrypted and retained.
- Request logs remain metadata-only.

### 23.3 Custom Retention

- Encrypted message records include `expiresAt`.
- MongoDB TTL index removes expired message content documents.
- TTL deletion is asynchronous and may occur after the exact expiry time.

### 23.4 Deletion boundaries

Deleting message content does not delete:

- Request metadata
- Billing totals
- Audit logs
- Security alerts

These records must not contain raw prompt or response text.

### 23.5 User deactivation

User deactivation preserves request and audit history. A later privacy-delete workflow is outside the MVP unless legally required for the deployment context.

## 24. Redis Data Design

Redis stores temporary or operational state, not authoritative long-term business history.

### 24.1 Prompt cache

```text
Key: cache:prompt:{opaqueHmac(canonicalCacheInput)}
Value: encrypted response payload OR access-checked safe reference with minimum safe metadata
TTL: PROMPT_CACHE_TTL_SECONDS=3600 when enabled
```

Rules:

- Cache only `ALLOW` decisions with risk score `0` and zero detected sensitive spans.
- Never cache `ALLOW_WITH_MASK`, `BLOCK`, masked prompts, or response content under `METADATA_ONLY` retention.
- Scope reuse to trusted `orgId`; organisation-wide reuse is allowed only without user-specific context.
- Bind trusted `orgId`, exact approved `providerPrompt` bytes, provider, model, deterministic settings, and policy/config fingerprint inside the opaque HMAC input.
- Do not normalize prompt whitespace or casing unless a future approved contract defines it.
- Never place raw prompts, PII, email addresses, or secrets in Redis keys or values.
- Plaintext assistant responses are prohibited. Cache implementation remains deferred until Phase 9 supplies encrypted payload storage or an access-checked safe-reference capability.
- Redis cache reads and writes fail open; provider execution continues. Idempotency remains fail closed.
- True cache hits have zero provider usage. Synthetic usage is prohibited, and the current `RequestLog` cannot represent non-billable cache delivery safely; accounting semantics must be resolved before implementation.

### 24.2 Idempotency

```text
Key: chat:idempotency:{opaqueHmac(orgId,userId,clientRequestId)}
Value: JSON { status, requestId, requestFingerprint, startedAt? or completedAt? }
TTL: 300 seconds for PROCESSING; 3600 seconds for COMPLETED
```

Rules:

- Create with `SET NX`.
- `PROCESSING` prevents a second provider call.
- The opaque fingerprint binds canonical non-sensitive request fields plus a domain-separated HMAC of exact prompt bytes; raw prompt content is never stored.
- A matching `PROCESSING` record returns `409 REQUEST_IN_PROGRESS`; any fingerprint mismatch returns `409 DUPLICATE_REQUEST`.
- `COMPLETED` is a non-replayable tombstone and always returns `409 DUPLICATE_REQUEST`.
- No response body, final API status/code, provider response, or provider usage is stored in the idempotency record. Replay remains deferred to Phase 9 safe encrypted/reference storage.
- Failure before provider execution may release only the matching reservation; possible provider execution must not be blindly released.
- A crash after provider execution may have started can leave `PROCESSING` until its 300-second expiry, after which retry may duplicate paid execution. No unsafe automatic reconciliation is approved for the MVP.
- Redis outage fails closed for new billable chat requests in the MVP to avoid duplicate paid calls.

### 24.3 Provider health

```text
Key: health:{providerId}
Value: JSON { state, circuitState, failureCount, avgLatencyMs, lastCheckedAt }
TTL: none; actively refreshed
```

### 24.4 Rate limiting

```text
Key: rate:{orgId}:{userId}:{windowStart}
Value: integer request count
TTL: window duration plus buffer
```

### 24.5 BullMQ

BullMQ owns queue-specific keys under its configured prefix. Use a project prefix such as:

```text
proxiai:bull
```

Do not manually edit BullMQ keys.

## 25. Query Catalogue

### 25.1 Employee conversation list

```ts
Conversation.find({ orgId, userId, status: 'ACTIVE' })
  .sort({ lastMessageAt: -1 })
  .limit(25);
```

Index used: `{ orgId, userId, lastMessageAt }`.

### 25.2 Conversation messages

```ts
Message.find({ orgId, conversationId })
  .sort({ createdAt: 1 });
```

Index used: `{ orgId, conversationId, createdAt }`.

### 25.3 Admin request log

```ts
RequestLog.find({ orgId, createdAt: { $gte: from, $lte: to } })
  .sort({ createdAt: -1, _id: -1 })
  .limit(limit + 1);
```

### 25.4 Team-lead activity

Resolve the authenticated lead's `teamId`, then query:

```ts
RequestLog.find({ orgId, teamId, createdAt: { $gte: from, $lte: to } });
```

### 25.5 Budget remaining

```text
Organisation.monthlyTokenBudget
  - organisation-level BillingRollup.totalTokens for current period
```

### 25.6 Active alerts

```ts
Alert.find({ orgId, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } })
  .sort({ createdAt: -1 });
```

### 25.7 Audit export

```ts
AuditLog.find({ orgId, occurredAt: { $gte: from, $lte: to } })
  .sort({ occurredAt: 1 });
```

Exports must stream or paginate rather than loading unlimited results into memory.

## 26. Transactions and Consistency

### 26.1 Where transactions are useful

Use a MongoDB transaction only where multiple writes must succeed together and the deployed MongoDB configuration supports transactions.

Candidate flows:

- Creating a conversation and its first message
- Refresh-token rotation: mark old token used and insert new token
- Changing a user's role and revoking token families

### 26.2 Where transactions are not required

The chat request flow intentionally uses eventual consistency for side effects:

- Request response returns after provider completion and essential request persistence.
- Billing rollups, analytics, anomaly detection, and email are asynchronous.
- A temporary delay in dashboard totals does not invalidate the chat response.

### 26.3 MVP fallback

If local MongoDB runs as standalone and transactions are unavailable, implement carefully ordered writes and idempotent recovery. For production-like testing, use a single-node replica set in Docker Compose so transactions are supported.

## 27. Schema Evolution and Migrations

### 27.1 Migration tool

Use a simple TypeScript migration runner, such as `migrate-mongo`, or a small internal script folder:

```text
backend/src/migrations/
  001-create-core-indexes.ts
  002-add-request-billing-applied.ts
  003-add-message-expiry-index.ts
```

### 27.2 Migration rules

- Migrations are ordered and immutable after release.
- Each migration has `up` and, where safe, `down` logic.
- Index creation is performed by migrations, not only through automatic Mongoose sync.
- Production startup must not silently drop or rebuild indexes.
- Backfills operate in batches and are resumable.
- Destructive changes require backup verification first.

### 27.3 Schema version

Optional document-level `schemaVersion` may be added only when a collection requires mixed historical shapes. Do not add it everywhere without need.

## 28. Seed Data

A development seed script may create:

- One demo organisation
- One organisation admin
- One team lead
- Two employees
- Three provider capability records in application config
- Safe sample conversations with non-sensitive placeholder text

Rules:

- Seed credentials use obvious development-only values.
- Seed script refuses to run when `NODE_ENV=production`.
- No real provider keys or personal information are committed.

## 29. Backup and Restore

### 29.1 MVP expectation

For local development:

```bash
mongodump --uri="$MONGO_URI" --out=./backup
mongorestore --uri="$MONGO_URI" ./backup
```

For hosted MongoDB, enable provider-managed backups where available.

### 29.2 Restore test

Before a demo or release milestone:

1. Create a backup.
2. Restore into a separate test database.
3. Run basic integrity queries.
4. Confirm encrypted messages decrypt with the expected key.
5. Confirm audit and billing totals are present.

### 29.3 Limitations

The MVP does not promise formal Recovery Point Objective or Recovery Time Objective. Those must be defined before production customer use.

## 30. Database Security

- Use a dedicated application database user.
- Grant only required database and collection privileges.
- Do not use a root/admin MongoDB account in application configuration.
- Enforce TLS for hosted MongoDB.
- Restrict network access to application infrastructure.
- Store MongoDB URI outside source control.
- Redact connection strings from logs.
- Disable development database browser exposure in production.
- Use query filters and validation to prevent NoSQL injection.
- Reject client objects containing MongoDB operators such as keys beginning with `$` where not expected.
- Use `.lean()` only when appropriate and ensure sensitive fields remain excluded.
- Disable automatic inclusion of `passwordHash`, `tokenHash`, and encrypted key fields through schema projections.

## 31. Performance Guidelines

### 31.1 Index discipline

- Verify important queries with `explain('executionStats')`.
- Remove indexes only after confirming they are unused.
- Avoid indexing high-cardinality arrays without a real query requirement.
- Do not create a text index over encrypted data.

### 31.2 Document growth

- Keep request logs narrow and metadata-only.
- Keep conversation messages separate from conversation headers.
- Cap provider incident history to a reasonable number, such as the most recent 100 incidents.
- Avoid unbounded arrays in organisation or user records.

### 31.3 Pagination

- Use cursor pagination for request logs, audit logs, alerts, and conversations.
- Do not use large `skip()` values.

### 31.4 Aggregation

- Use monthly billing rollups for dashboards and budget checks.
- Avoid repeated full scans of request logs.
- Phase 7 may add the approved minimal tenant-scoped UTC-daily analytics
  projection before reporting APIs. Dashboard-specific denormalization and
  richer reporting projections remain deferred until measured query needs
  justify them.

## 32. Database Error Handling

| Scenario | Expected behaviour |
|---|---|
| MongoDB unavailable before provider call | Reject request as not ready; no external call |
| MongoDB fails after provider response starts | End stream safely, log operational error, preserve no plaintext |
| Duplicate unique key | Map to safe conflict or idempotent result |
| Validation error | Return `VALIDATION_ERROR` without raw database details |
| Encryption failure | Never store plaintext; return or record safe persistence error |
| TTL deletion delayed | Accept eventual deletion; report policy in documentation |
| Billing worker duplicate | Atomic processed marker prevents double rollup |
| Audit write fails | High-severity log and metric; sensitive action may fail closed depending on action |
| Redis unavailable | Apply per-key failure behaviour from the TDD |

## 33. Database Test Strategy

### 33.1 Unit tests

- Mongoose validation rules
- Encryption envelope creation and decryption
- Retention-policy log/message builders
- Cursor encode/decode
- Billing increment builder
- Safe audit metadata filtering

### 33.2 Integration tests

- Unique email per organisation
- Same email allowed in another organisation if that remains the approved rule
- Cross-tenant conversation lookup returns no record
- Refresh-token reuse revokes family
- Message plaintext does not appear in MongoDB
- Metadata-only mode stores no message content
- Custom-retention message receives `expiresAt`
- Audit model rejects update/delete operations
- Billing worker retry does not double-count
- Cursor pagination has no duplicate rows
- Required indexes exist after migration

### 33.3 Security tests

- NoSQL operator injection is rejected
- Password and token hashes are excluded from API projections
- Encrypted message fields are never exposed through admin request-log APIs
- Organisation A cannot query organisation B data using known IDs
- Audit metadata rejects or removes sensitive keys

### 33.4 Performance checks

For MVP-sized test data:

- Insert at least 10,000 request logs.
- Verify org/date queries use the compound index.
- Verify cursor pagination does not use collection scan.
- Verify billing dashboard reads rollup records rather than aggregating all logs.

## 34. Implementation Sequence

### Step 1 — Database foundation

- MongoDB connection
- Mongoose base configuration
- Environment validation
- Migration runner
- Organisation, team, and user schemas

### Step 2 — Authentication data

- Password hashing
- Refresh-token schema
- TTL and family indexes
- Token rotation transaction or safe fallback

### Step 3 — Chat data

- Conversation schema
- Message schema
- Encryption helper
- Retention-aware write builder

### Step 4 — Operational metadata

- RequestLog schema
- Cursor pagination
- Provider health schema

### Step 5 — Async and admin data

- AuditLog schema and append-only repository
- BillingRollup schema and idempotent worker update
- Alert schema

### Step 6 — Hardening

- All indexes through migrations
- Cross-tenant integration tests
- Backup/restore check
- Query-plan verification
- Sensitive-field projection review

## 35. Definition of Database Done

The database design is implemented for MVP when:

- All approved collections exist with validation.
- Every tenant-owned collection includes `orgId`.
- Core indexes are created through migrations.
- Authentication tokens are hashed and rotate safely.
- Prompt and response content is never stored in plaintext.
- Metadata-only mode stores no content.
- Request logs contain operational metadata only.
- Audit logs are append-only at the application layer.
- Billing rollups are updated idempotently.
- Cursor pagination works without duplicates.
- Cross-organisation access tests pass.
- Backup and restore have been tested at least once.
- Database credentials and encryption keys are absent from source control and logs.

## 36. Known MVP Limitations

- One MongoDB deployment is used.
- No sharding is designed or required.
- One application encryption key may protect all organisations.
- TTL deletion is not immediate to the exact second.
- Provider health Redis and MongoDB states may briefly differ.
- Dashboard totals may lag while BullMQ jobs process.
- Full prompt search is unavailable because content is encrypted.
- Audit logs are append-only at the application level but not yet backed by immutable object storage.
- Formal RPO and RTO are not defined.

## 37. Open Database Questions

1. Should the same email be allowed in multiple organisations, or should one identity belong to multiple organisations through a membership model?
2. Which third provider will be used in the MVP?
3. Will the hosted MongoDB environment support transactions from the first deployment?
4. Is `CUSTOM_RETENTION` required in the first five-week build, or can it follow immediately after encrypted storage?
5. What exact cost precision is required for provider estimates?
6. Should organisation admins be allowed to view decrypted employee conversations? The current beginner-safe baseline says no.
7. How long should audit logs be retained for the portfolio/demo deployment?
8. Should generic conversation titles be used in metadata-only mode, or should title records be omitted entirely?

## 38. Traceability

| Approved capability | Database support |
|---|---|
| Multi-tenant isolation | `orgId` on every tenant-owned collection and scoped repositories |
| Authentication | `users`, `refresh_tokens` |
| Team lead access | `teams`, `users.teamId`, `request_logs.teamId` |
| Conversations and streaming | `conversations`, `messages`, `request_logs` |
| PII policy | Risk score and categories in `request_logs`; safe decisions in `audit_logs` |
| Provider fallback | Attempted providers, selected provider, fallback count in `request_logs` |
| Retention | Retention configuration, encrypted messages, optional `expiresAt` TTL |
| Billing and budget | `billing_rollups`, organisation budget |
| Alerts | `alerts` |
| Audit trail | Append-only `audit_logs` |
| Provider health | Redis hot state and `provider_health` history |
| Admin dashboard | Indexed request logs, billing rollups, alerts, provider health |

## 39. Database Self-Audit

### 39.1 Scope audit — PASS

No new product capability was introduced. Every collection supports an approved PRD, SDD, or TDD requirement. Advanced warehouse, search, sharding, and multi-region features remain deferred.

### 39.2 Beginner solo-developer audit — PASS

The design uses one MongoDB database, one Redis instance, Mongoose, a small migration runner, and direct repository queries. It avoids unnecessary microservices, joins across multiple databases, and complex distributed data patterns.

### 39.3 Tenant-isolation audit — PASS

Every tenant-owned collection contains `orgId`, required query examples include it, and explicit cross-tenant tests are defined. Public IDs alone never authorise access.

### 39.4 Sensitive-data audit — PASS

Raw prompts and responses are stored only as AES-256-GCM encrypted message fields when retention allows. Request logs, alerts, billing, and audit records explicitly exclude raw content and secrets.

### 39.5 Retention audit — PASS

Metadata-only mode does not construct content writes. Encrypted and custom-retention modes are separated. TTL deletion is documented as asynchronous, and operational metadata remains independent from content retention.

### 39.6 Authentication-data audit — PASS

Passwords and refresh tokens are never stored in plaintext. Refresh-token families, one-time use, reuse detection, revocation, and TTL cleanup are represented.

### 39.7 Query and index audit — PASS

Every high-frequency access pattern has a matching compound index. Cursor pagination uses a stable `(createdAt, _id)` pair. Billing reads use rollups rather than full scans.

### 39.8 Consistency audit — PASS WITH MVP LIMITATIONS

Critical authentication updates can use transactions. Billing is idempotent. Dashboard and alert data are eventually consistent by design. Local MongoDB must run as a replica set if transaction tests are required.

### 39.9 Audit immutability audit — PASS FOR MVP

The application model exposes create/read only and rejects updates/deletes. Stronger tamper-proof storage is correctly deferred to the production roadmap.

### 39.10 Final status

**Approved as the database implementation baseline for the ProxiAI beginner solo-developer MVP.**

The next document in the approved sequence is `05_OPENAPI_SPEC.md`, which should define the API contracts without changing this database scope.
