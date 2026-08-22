# ProxiAI API Specification (OpenAPI Design)

## 1. Document Control

| Field | Value |
|---|---|
| Project | ProxiAI — Enterprise AI Gateway & Audit Platform |
| Document | API Specification and OpenAPI Design |
| Version | 1.0 |
| API version | v1 |
| OpenAPI target | OpenAPI 3.1.0 |
| Status | MVP Implementation Baseline |
| Intended audience | Solo developer, frontend developer, tester, reviewer, interviewer |
| Primary inputs | `01_PRD.md`, `02_SDD.md`, `03_TDD.md`, `04_DATABASE_DESIGN.md`, and ProxiAI Architecture Document v2.0 |
| Scope rule | No feature beyond the approved beginner-friendly MVP is introduced |
| Base path | `/api/v1` |

## 2. Purpose

This document defines the HTTP and streaming API contract for the ProxiAI MVP. It is the implementation agreement between the React frontend, Express backend, automated tests, and future API consumers.

The specification covers:

- Authentication and session rotation
- Current-user profile
- Conversation creation and retrieval
- Prompt submission using authenticated POST plus SSE-formatted streaming
- Organisation-scoped administration endpoints
- Billing, alert, policy, retention, and audit-export endpoints
- Liveness and readiness endpoints
- Standard success and error envelopes
- Request validation, permissions, pagination, filtering, and error codes
- OpenAPI modeling decisions and limitations for streaming responses

This document does not add product features. It converts the already approved PRD, SDD, TDD, and database design into explicit request and response contracts.

## 3. Scope Guardrails

### 3.1 Included

- JSON REST endpoints under `/api/v1`
- Cookie-based refresh-token flow
- Bearer access-token authentication
- Server-Sent Events formatted over a `POST /chat/stream` fetch request
- Organisation isolation derived from the authenticated session
- Role and permission requirements
- Cursor pagination
- Safe validation errors
- Standard API envelopes
- CSV audit export
- Health endpoints
- API examples and contract test expectations

### 3.2 Explicitly deferred

- SSO or SAML endpoints
- BYOK management endpoints
- Approval workflow endpoints
- WebSocket APIs
- GraphQL
- Public third-party developer API keys
- API marketplace or OAuth client registration
- Model training or fine-tuning APIs
- Full-text search over encrypted message content
- Multi-region routing APIs
- Custom enterprise policy-language APIs
- Webhook subscriptions for customers
- Native mobile-specific APIs

## 4. API Design Principles

1. **The server is the security boundary.** Frontend visibility is never treated as authorization.
2. **Tenant identity is trusted only from authentication context.** Employee and organisation-admin endpoints do not accept an arbitrary `orgId` to choose a tenant.
3. **Every normal JSON response uses one standard envelope.**
4. **Every error has a stable machine-readable code.**
5. **Sensitive values are never echoed in errors, logs, or audit metadata.**
6. **Breaking changes require a new URL version.** Additive optional fields do not require `/v2`.
7. **List endpoints use cursor pagination.** Offset/page-number pagination is not used.
8. **The chat stream uses `fetch()` and SSE frame parsing.** Browser `EventSource` is not used because the request is authenticated and requires a POST body.
9. **Policy evaluation happens before any provider call.** A blocked request never leaves ProxiAI.
10. **The MVP contract remains small enough for one solo developer to implement and test.**

## 5. Server URLs

### 5.1 Local development

```text
http://localhost:8080/api/v1
```

### 5.2 Production

```text
https://<configured-cloud-run-domain>/api/v1
```

The production host is deployment-specific and must not be hardcoded in frontend source code. The frontend reads it from an environment variable such as `VITE_API_BASE_URL`.

## 6. Content Types

| Use case | Content type |
|---|---|
| Normal request and response | `application/json` |
| Chat streaming response | `text/event-stream` |
| Audit export | `text/csv` |
| Health responses | `application/json` |

All JSON is UTF-8. Timestamps use ISO 8601 UTC strings, for example:

```text
2026-07-23T10:15:30.000Z
```

## 7. Authentication Model

### 7.1 Access token

Protected APIs require:

```http
Authorization: Bearer <access-token>
```

The access token is a short-lived JWT, recommended lifetime 15 minutes.

Expected claims:

```json
{
  "sub": "user-public-id",
  "orgId": "organisation-public-id",
  "role": "EMPLOYEE",
  "permissions": ["chat:send", "chat:view_own"],
  "sessionId": "session-uuid",
  "type": "access",
  "jti": "access-token-uuid",
  "iat": 1784800000,
  "exp": 1784800900,
  "iss": "proxiai",
  "aud": "proxiai-api"
}
```

Access tokens use HS256 and protected-header `typ: at+jwt`. Role claims use
uppercase persistence enums; permission claims use canonical lowercase
namespaced values. P2-06 must validate permissions against the `UserPermission`
allowlist and reload current User and Organisation state. Token claims alone
are never sufficient authorization.

### 7.2 Refresh token

The refresh token is stored in an `httpOnly`, `Secure` production cookie and is never returned in a JSON body.

Recommended cookie properties:

```text
HttpOnly: true
Secure: true in production
SameSite: Lax
Path: /api/v1/auth
Max-Age: 7 days
```

The cookie name may be `proxiai_refresh`.

The cookie is host-only because `Domain` is omitted. The MVP assumes the
frontend and API are same-site; cross-site cookie deployment is outside P2-04.

### 7.3 Refresh-token rotation

Each refresh token is single-use. A successful refresh:

1. Marks the current token as used.
2. Issues a replacement token in the same family.
3. Replaces the cookie.
4. Returns a new access token.

Reuse of an already-used token revokes the complete token family and returns the same generic public refresh failure as other invalid refresh states.

### 7.4 Permission model

| Permission | Purpose |
|---|---|
| `chat:send` | Create a conversation and send a prompt |
| `chat:view_own` | View own conversations and retained messages |
| `team:view_logs` | View logs limited to the assigned team |
| `admin:view_logs` | View organisation-wide operational data |
| `admin:view_billing` | View organisation billing rollups |
| `admin:manage_users` | Reserved for user-management implementation within approved scope |
| `admin:configure_policy` | Update PII thresholds, budget, and retention mode |
| `admin:export_audit` | Export organisation audit data |
| `platform:view_health` | View detailed platform health |

## 8. Standard JSON Envelopes

### 8.1 Success envelope

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": null
  }
}
```

Type definition:

```ts
interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    nextCursor?: string | null;
  };
}
```

`nextCursor` is included only for cursor-paginated endpoints.

### 8.2 Error envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "requestId": "req_01J...",
    "details": [
      {
        "field": "prompt",
        "message": "Prompt is required."
      }
    ]
  }
}
```

Type definition:

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

### 8.3 Error safety

The API must never return:

- Stack traces
- MongoDB error text
- Redis connection strings
- Provider SDK response bodies containing secrets
- API keys
- Refresh tokens
- Raw detected PII values
- Raw prompt or response content in an error object
- Encryption keys, IVs, or authentication tags beyond intentionally returned encrypted data, which the MVP does not expose

## 9. Common Headers

### 9.1 Request headers

| Header | Required | Description |
|---|---:|---|
| `Authorization` | Protected routes | Bearer access token |
| `Content-Type` | JSON POST/PATCH | `application/json` |
| `Accept` | Recommended | `application/json` or `text/event-stream` |
| `X-Request-ID` | Optional | Client-provided correlation ID; server validates or replaces it |

### 9.2 Response headers

| Header | Description |
|---|---|
| `X-Request-ID` | Correlates frontend errors with backend logs |
| `Content-Type` | Response media type |
| `Retry-After` | Included where practical for `429` responses |
| `Cache-Control` | `no-store` for auth and sensitive responses; `no-cache` for SSE |

## 10. HTTP Status Code Policy

| Status | Use |
|---:|---|
| `200` | Successful read, update, login, refresh, or streamed connection established |
| `201` | Resource created |
| `400` | Invalid request or malformed cursor |
| `401` | Missing, expired, or invalid authentication |
| `402` | Monthly token budget exhausted |
| `403` | Authenticated but permission denied, feature disabled, or policy blocked |
| `404` | Resource absent within the authenticated tenant scope |
| `409` | Duplicate/in-progress idempotency request or state conflict |
| `413` | Request body or prompt exceeds allowed size |
| `422` | Semantically invalid request where `400` is insufficient; optional in MVP |
| `429` | Rate limit exceeded |
| `500` | Unexpected internal failure |
| `503` | Required dependency or all eligible providers unavailable |

The implementation should prefer a small consistent set. `400` may be used instead of `422` throughout MVP.

## 11. Stable Error Code Catalog

| Code | HTTP | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Request failed schema validation |
| `INVALID_CURSOR` | 400 | Pagination cursor cannot be decoded or validated |
| `INVALID_CREDENTIALS` | 401 | Generic login failure |
| `UNAUTHORIZED` | 401 | Access token missing or invalid |
| `ACCESS_TOKEN_EXPIRED` | 401 | Access token expired |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token missing, unknown, expired, used, revoked, or linked to an inactive User or Organisation |
| `FORBIDDEN` | 403 | Permission or tenant ownership check failed |
| `FEATURE_DISABLED` | 403 | Subscription or feature flag does not permit an action |
| `POLICY_BLOCKED` | 403 | Prompt blocked before provider contact |
| `BUDGET_EXCEEDED` | 402 | Monthly token budget has been exhausted |
| `NOT_FOUND` | 404 | Tenant-scoped resource not found |
| `REQUEST_IN_PROGRESS` | 409 | Same client request is already processing |
| `DUPLICATE_REQUEST` | 409 | Completed duplicate or client request ID reused with a different request fingerprint |
| `PROMPT_TOO_LARGE` | 413 | Prompt or estimated provider context is too large |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `PROVIDER_UNAVAILABLE` | 503 | No eligible provider completed the request |
| `IDEMPOTENCY_UNAVAILABLE` | 503 | Redis cannot safely coordinate duplicate protection for a billable request |
| `DEPENDENCY_UNAVAILABLE` | 503 | Required database or Redis dependency unavailable |
| `INTERNAL_ERROR` | 500 | Unexpected internal error |

Provider-specific internal errors are normalized before they reach controllers.

## 12. Shared Schema Definitions

### 12.1 Role

```yaml
type: string
enum: [EMPLOYEE, TEAM_LEAD, ORG_ADMIN]
```

### 12.2 Retention mode

MVP-supported values:

```yaml
type: string
enum: [METADATA_ONLY, ENCRYPTED_STORAGE]
```

`CUSTOM_RETENTION` and `NO_STORAGE` are deferred and are not exposed in the MVP API.

### 12.3 Provider ID

```yaml
type: string
enum: [groq, gemini, third]
```

`third` is a configuration placeholder for the third approved provider adapter. The actual deployed identifier should replace it consistently once selected.

### 12.4 Policy action

```yaml
type: string
enum: [ALLOW, ALLOW_WITH_MASK, BLOCK]
```

`REQUIRE_APPROVAL` is not in the beginner MVP API.

### 12.5 Request status

```yaml
type: string
enum: [COMPLETED, BLOCKED, FAILED, INTERRUPTED]
```

### 12.6 Provider routing reason

```yaml
type: string
enum: [manual, auto, fallback, cache]
```

## 13. Endpoint Summary

| Method | Path | Authentication | Permission | Response |
|---|---|---|---|---|
| POST | `/auth/login` | Public | None | JSON |
| POST | `/auth/refresh` | Refresh cookie | None | JSON |
| POST | `/auth/logout` | Refresh cookie | None | JSON |
| GET | `/auth/me` | Bearer | Authenticated | JSON |
| POST | `/conversations` | Bearer | `chat:send` | JSON |
| GET | `/conversations` | Bearer | `chat:view_own` | JSON |
| GET | `/conversations/{conversationId}` | Bearer | `chat:view_own` | JSON |
| PATCH | `/conversations/{conversationId}` | Bearer | `chat:send` | JSON |
| GET | `/conversations/{conversationId}/messages` | Bearer | `chat:view_own` | JSON |
| POST | `/chat/stream` | Bearer | `chat:send` | SSE stream |
| GET | `/admin/summary` | Bearer | `admin:view_logs` | JSON |
| GET | `/admin/logs` | Bearer | `admin:view_logs` | JSON |
| GET | `/admin/billing` | Bearer | `admin:view_billing` | JSON |
| GET | `/admin/alerts` | Bearer | `admin:view_logs` | JSON |
| GET | `/admin/users` | Bearer | `admin:manage_users` | JSON |
| GET | `/admin/teams` | Bearer | `admin:manage_users` | JSON |
| PATCH | `/admin/users/{userId}/role` | Bearer | `admin:manage_users` | JSON |
| PATCH | `/admin/users/{userId}/team` | Bearer | `admin:manage_users` | JSON |
| PATCH | `/admin/users/{userId}/status` | Bearer | `admin:manage_users` | JSON |
| POST | `/admin/users/{userId}/revoke-sessions` | Bearer | `admin:manage_users` | JSON |
| PATCH | `/admin/policy` | Bearer | `admin:configure_policy` | JSON |
| PATCH | `/admin/retention` | Bearer | `admin:configure_policy` | JSON |
| PATCH | `/admin/alerts/{alertId}` | Bearer | `admin:view_logs` | JSON |
| GET | `/admin/audit/export` | Bearer | `admin:export_audit` | CSV |
| GET | `/health/live` | Public | None | JSON |
| GET | `/health/ready` | Public | None | JSON |
| GET | `/health/detailed` | Bearer or disabled | `platform:view_health` | JSON |

`PATCH /admin/alerts/{alertId}` is not a new feature: it is the API contract for the already approved alert-resolution requirement.

Phase 7 closure adds no public HTTP route. Provider-health scheduling and
failed-enqueue recovery are internal worker contracts. The current provider
state is Redis-only and uses `HEALTHY`, `UNHEALTHY`, or `UNKNOWN`; any future
admin/provider-health response remains Phase 8/10 work. Alert listing,
resolution, reopening, and email delivery are not Phase 7 worker work: listing
is Phase 8, audited state changes are Phase 9, and email remains deferred.

# 14. Authentication APIs

## 14.1 POST `/auth/login`

Authenticates a user, creates a refresh-token session, sets the refresh cookie, and returns an access token plus safe profile data.

### Request

```json
{
  "organisationSlug": "example-organisation",
  "email": "employee@example.com",
  "password": "user-entered-password"
}
```

### Validation

| Field | Rules |
|---|---|
| `organisationSlug` | Required, lowercase slug after trim, 2–63 characters |
| `email` | Required, valid email, normalized to lower case |
| `password` | Required, non-empty string, maximum 128 Unicode code points after NFC normalization |

Login passwords preserve spaces and casing and are never trimmed or truncated.
Verification normalizes to Unicode NFC. The 15-code-point new-password minimum
does not apply to login verification.

This length, Unicode, and composition policy follows current NIST guidance,
but ProxiAI does not claim full password-verifier compliance yet. Compromised
or common-password blocklisting remains pending. Login attempts are bounded by
the implemented Redis-backed account/IP rate limiter, and unavailable real
credentials take the implemented dummy Argon2 verification path for
missing-user timing equalization.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "expiresInSeconds": 900,
    "user": {
      "userId": "usr_7dd6...",
      "email": "employee@example.com",
      "displayName": "Example Employee",
      "role": "EMPLOYEE",
      "permissions": ["chat:send", "chat:view_own"],
      "teamId": "team_21f...",
      "organisation": {
        "orgId": "org_891...",
        "name": "Example Organisation",
        "plan": "FREE",
        "retentionMode": "METADATA_ONLY"
      }
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

### Errors

| Status | Code | Condition |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body |
| 401 | `INVALID_CREDENTIALS` | Organisation, account state, or password failure; generic message |
| 429 | `RATE_LIMITED` | Too many attempts |
| 500 | `INTERNAL_ERROR` | Unexpected failure |

### Security requirements

- Never reveal whether an email exists.
- Never return or log the password.
- Never log the raw organisation slug, email, password hash, access token,
  refresh token, cookie, request body, or sensitive headers.
- Set `Cache-Control: no-store`.
- Emit structured security events. Phase 9 also appends approved durable audit
  events once a trusted organisation has been resolved; no password, email,
  token, cookie, or raw request body is included.

## 14.2 POST `/auth/refresh`

Rotates the single-use refresh token and returns a new access token.

### Request

No JSON body. The refresh token is read from the secure cookie.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "expiresInSeconds": 900
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

A replacement refresh cookie is set.

### Anonymous bootstrap — `204 No Content`

When no refresh cookie is present, the endpoint returns `204` and clears any
stale browser cookie attributes. This is an expected anonymous bootstrap state;
it performs no token lookup or rotation. An invalid, expired, used, or revoked
cookie still returns the generic `401 INVALID_REFRESH_TOKEN`, while operational
dependency failures remain `503 AUTH_TEMPORARILY_UNAVAILABLE`.

### Errors

| Status | Code | Condition |
|---:|---|---|
| 401 | `INVALID_REFRESH_TOKEN` | Unknown, expired, used, revoked, or linked to an inactive User or Organisation |
| 503 | `AUTH_TEMPORARILY_UNAVAILABLE` | Refresh cannot be completed because a required auth dependency failed |

Confirmed replay outside the bounded concurrency window revokes the token
family. A concurrent loser inside that window returns the same safe public
authentication failure without revoking the winning family. Operational `5xx`
responses do not clear the refresh cookie; the client may retry after the
dependency recovers.

## 14.3 POST `/auth/logout`

Revokes the current session and clears the refresh cookie.

### Authentication

Refresh cookie only.

### Request

No body.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "loggedOut": true
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Logout is idempotent from the user's perspective. The cookie is cleared even when the stored session is already revoked.

Missing, unknown, or already revoked refresh tokens still return the standard success envelope.

If a required auth dependency fails while resolving or revoking a known refresh token, the API returns `503 AUTH_TEMPORARILY_UNAVAILABLE` after clearing the cookie.

## 14.4 GET `/auth/me`

Returns the current safe authentication context plus the same safe user and
organisation profile used by login. The profile includes the prospective
retention mode so the workspace can explain storage behavior before submission.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "userId": "usr_7dd6...",
    "orgId": "org_891...",
    "role": "EMPLOYEE",
    "permissions": ["chat:send", "chat:view_own"],
    "sessionId": "session-uuid",
    "teamId": "team_21f...",
    "user": {
      "userId": "usr_7dd6...",
      "email": "employee@example.com",
      "displayName": "Example Employee",
      "role": "EMPLOYEE",
      "permissions": ["chat:send", "chat:view_own"],
      "teamId": "team_21f...",
      "organisation": {
        "orgId": "org_891...",
        "name": "Example Organisation",
        "plan": "FREE",
        "retentionMode": "METADATA_ONLY"
      }
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

The endpoint must not return password hashes, token records, encrypted message content, secret keys, raw JWT payloads, or internal MongoDB identifiers.
It also excludes encryption key versions, ciphertext envelopes, IVs, and
authentication tags. `retentionMode` communicates policy only; it does not
claim that historical content exists.

# 15. Conversation APIs

## 15.1 POST `/conversations`

Creates a conversation owned by the authenticated user.

### Permission

`chat:send`

### Request

```json
{
  "title": "Optional conversation title"
}
```

The title is optional. The API uses the safe default `New conversation`. Prompt-derived and LLM-generated titles are not allowed.

### Validation

| Field | Rules |
|---|---|
| `title` | Optional, trimmed string, 1–120 characters when present |

### Success — `201 Created`

```json
{
  "success": true,
  "data": {
    "conversationId": "conv_2fb...",
    "title": "Optional conversation title",
    "messageCount": 0,
    "createdAt": "2026-07-23T10:15:30.000Z",
    "lastMessageAt": null
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

### Rules

- `orgId` and owner `userId` come from authenticated context.
- A client cannot create a conversation for another user or tenant.
- Titles are client-entered only. Phase 9 stores manual custom titles encrypted
  at rest and keeps only the fixed `New conversation` fallback plaintext.

## 15.2 GET `/conversations`

Lists conversations owned by the authenticated user.

### Permission

`chat:view_own`

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---:|---|
| `limit` | integer | 25 | 1–100 |
| `cursor` | string | none | Opaque cursor returned by previous call |

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "conversationId": "conv_2fb...",
        "title": "API design help",
        "messageCount": 4,
        "createdAt": "2026-07-23T10:15:30.000Z",
        "lastMessageAt": "2026-07-23T10:18:02.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": "eyJsYXN0TWVzc2FnZUF0IjoiLi4uIn0"
  }
}
```

### Isolation rule

The repository query must include both trusted `orgId` and authenticated `userId`.

## 15.3 GET `/conversations/{conversationId}`

Returns one conversation header owned by the authenticated user.

### Path parameter

| Parameter | Rules |
|---|---|
| `conversationId` | Required opaque public ID |

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "conversationId": "conv_2fb...",
    "title": "API design help",
    "messageCount": 4,
    "createdAt": "2026-07-23T10:15:30.000Z",
    "lastMessageAt": "2026-07-23T10:18:02.000Z"
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

A conversation belonging to another tenant or user returns the same `404 NOT_FOUND` shape as a nonexistent conversation.

## 15.4 PATCH `/conversations/{conversationId}`

Manually renames a conversation owned by the authenticated user.

### Permission

`chat:send`

### Request

```json
{
  "title": "Quarterly planning"
}
```

The body is strict: `title` is the only accepted property. It is trimmed and must contain 1–120 characters. The client cannot provide `orgId` or `userId`.

### Success — `200 OK`

Returns the standard conversation summary envelope used by `GET /conversations/{conversationId}`.

### Rules

- The update filter includes trusted authenticated `orgId`, authenticated `userId`, and the path `conversationId`.
- Foreign-tenant, foreign-user, and nonexistent conversations return the same generic `404 NOT_FOUND` response.
- Titles are manual only; prompt-derived and LLM-generated titles are prohibited.

## 15.5 GET `/conversations/{conversationId}/messages`

Returns retained messages for a conversation owned by the authenticated user.

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---:|---|
| `limit` | integer | 50 | 1–100 |
| `cursor` | string | none | Opaque message cursor |

### Success — retention-aware message summaries

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "messageId": "msg_f1a...",
        "role": "user",
        "tokenCount": 6,
        "createdAt": "2026-07-23T10:16:00.000Z",
        "contentAvailable": false
      },
      {
        "messageId": "msg_d7b...",
        "role": "assistant",
        "tokenCount": 120,
        "createdAt": "2026-07-23T10:16:02.000Z",
        "contentAvailable": false
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": null
  }
}
```

`contentAvailable=false` omits `content`. For an encrypted record successfully
decrypted after tenant and owner authorization, the same item uses
`contentAvailable=true` and includes string `content`. The API never returns
`contentEnc`, algorithm, ciphertext, IV, authentication tag, key version, or a
partially decrypted page. `METADATA_ONLY` continues to expose no content.
Partial or interrupted assistant output is not persisted.

# 16. Chat Streaming API

## 16.1 POST `/chat/stream`

Submits a prompt, applies PII and policy checks, selects a provider, and streams the assistant response.

### Permission

`chat:send`

### Request headers

```http
Authorization: Bearer <access-token>
Content-Type: application/json
Accept: text/event-stream
```

### Request body

```json
{
  "conversationId": "conv_2fb...",
  "prompt": "Please explain circuit breakers.",
  "clientRequestId": "d03bb577-1fd4-4c1e-ac93-34f9c58c3db8",
  "providerId": "groq",
  "routingMode": "manual"
}
```

### Schema

| Field | Required | Rules |
|---|---:|---|
| `conversationId` | Yes | Non-empty public ID; must belong to authenticated user and tenant |
| `prompt` | Yes | Trimmed, 1–20,000 characters; exact provider token limit checked later |
| `clientRequestId` | Yes | UUID; idempotency scope is organisation + user/request context |
| `providerId` | Manual only | One configured provider ID |
| `routingMode` | No | `manual` or `auto`; default `auto` |

Rules:

- When `routingMode=manual`, `providerId` is required.
- When `routingMode=auto`, `providerId` is ignored or rejected to avoid ambiguity. The implementation should reject conflicting fields with `VALIDATION_ERROR`.
- Auto routing must be feature-enabled for the organisation. Otherwise return `FEATURE_DISABLED` or require manual routing according to plan behavior.

### Attachment boundary

The current MVP accepts JSON prompt text only. It has no upload endpoint,
multipart request, file reference, or paperclip/upload UI. A future attachment
contract must define storage, MIME and size allowlists, malware scanning,
tenant ownership, provider capability, retention, and deletion before any
attachment implementation begins.

### Initial HTTP responses

Before stream headers are committed, failures use the normal JSON error envelope.

| Status | Code | Condition |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body or routing combination |
| 401 | `UNAUTHORIZED` | Invalid access token |
| 402 | `BUDGET_EXCEEDED` | Budget already exhausted |
| 403 | `FORBIDDEN` | Conversation ownership or permission failure |
| 403 | `FEATURE_DISABLED` | Auto routing unavailable for plan |
| 404 | `NOT_FOUND` | Conversation not found within scope |
| 409 | `REQUEST_IN_PROGRESS` | Same idempotency key currently processing |
| 413 | `PROMPT_TOO_LARGE` | Body or provider context too large |
| 429 | `RATE_LIMITED` | Chat rate limit exceeded |
| 503 | `IDEMPOTENCY_UNAVAILABLE` | Redis unavailable when safe idempotency cannot be guaranteed |

After validation and policy readiness, the server responds:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
X-Request-ID: req_01J...
```

## 16.2 SSE frame format

Each event follows:

```text
event: <event-name>
data: <single-line JSON>

```

The frontend must tolerate an SSE frame being split across network chunks.

## 16.3 SSE event catalog

### `request_started`

Sent once after the stream is accepted.

```text
event: request_started
data: {"requestId":"req_01J...","clientRequestId":"d03bb577-1fd4-4c1e-ac93-34f9c58c3db8"}

```

### `policy`

Sent after policy evaluation. It must not expose detected raw values.

```text
event: policy
data: {"action":"ALLOW_WITH_MASK","riskScore":25,"categories":["CONTACT_INFO"],"masked":true}

```

For a normal prompt:

```text
event: policy
data: {"action":"ALLOW","riskScore":0,"categories":[],"masked":false}

```

### `routing`

Sent after provider selection and before first token.

```text
event: routing
data: {"provider":"gemini","routingReason":"auto","intent":"summarization","fallbackPosition":0}

```

The score internals may be omitted in MVP. A safe human-readable reason can be added without revealing secrets.

### `fallback`

Sent only when a provider fails before token streaming begins and another provider is selected.

```text
event: fallback
data: {"fromProvider":"gemini","toProvider":"groq","reason":"PROVIDER_TIMEOUT","attempt":2}

```

### `token`

Sent zero or more times.

```text
event: token
data: {"text":"The circuit breaker"}

```

Token chunks are presentation fragments, not guaranteed linguistic tokens.

### `done`

Sent once after successful completion.

```text
event: done
data: {"requestId":"req_01J...","messageId":"msg_d7b...","provider":"groq","model":"configured-model","routingReason":"fallback","usage":{"inputTokens":18,"outputTokens":142,"totalTokens":160},"latencyMs":1480,"cacheHit":false,"masked":false}

```

### `error`

Sent when the stream has already started and a failure occurs.

```text
event: error
data: {"code":"PROVIDER_UNAVAILABLE","message":"The response was interrupted because no provider was available.","requestId":"req_01J...","retryable":true}

```

The server closes the stream after a terminal `done` or `error` event.

### Internal request outcome events

These are backend BullMQ events, not additional public SSE event names. A
successful `done` maps to `request.completed` with `status: COMPLETED`. A
provider-path terminal failure maps to `status: FAILED`. Client disconnect or
stream termination without a normal done event maps to `status: INTERRUPTED`.
Each completed/provider-path event carries the evaluated `policyAction` as
`ALLOW` or `ALLOW_WITH_MASK` plus safe provider/model identifiers. Missing
usage does not determine status.

A policy block maps to the analytics-only `request.blocked` event with
`status: BLOCKED` and `policyAction: BLOCK`. It carries no provider, model,
usage, cost, prompt, response, detected value, or secret. The public behavior
remains the JSON `403 POLICY_BLOCKED` response before SSE headers and before any
provider call.

### SSE heartbeat

During long waits, the server may send comments every 15 seconds:

```text
: heartbeat

```

Clients ignore comment frames.

## 16.4 Policy-blocked behavior

A blocked prompt must never reach provider selection. The preferred MVP behavior is to return a JSON `403 POLICY_BLOCKED` before starting the stream:

```json
{
  "success": false,
  "error": {
    "code": "POLICY_BLOCKED",
    "message": "This request was blocked by your organisation's data policy.",
    "requestId": "req_01J...",
    "details": {
      "riskScore": 80,
      "categories": ["CREDENTIAL", "INTERNAL_SECRET"]
    }
  }
}
```

The details contain categories only, never detected values.

## 16.5 Cache-hit behavior

A valid future cache hit uses this existing event sequence:

```text
request_started
policy
routing (routingReason=cache)
token*
done (cacheHit=true)
```

No `cache_hit` event is added. The provider adapter call is skipped entirely. The response remains tenant-scoped, policy-eligible, and backed by approved encrypted storage or an access-checked safe reference. Exact provider/model metadata semantics remain deferred until the implementation contract is finalized.

Provider usage on a true cache hit is zero and must never be synthesized. The current request-accounting schema does not safely represent non-billable cache delivery, so cache-hit accounting and the dedicated encrypted/reference cache-value contract must be resolved before implementation. The Phase 9 Message store is not a prompt-cache replay contract.

## 16.6 Idempotency behavior

- The key is derived from the authenticated tenant plus `clientRequestId`.
- The stored opaque fingerprint binds canonical non-sensitive request fields plus an HMAC of exact prompt bytes; no raw prompt is stored.
- A matching duplicate in-progress request returns `409 REQUEST_IN_PROGRESS` before stream commitment.
- Reusing the same client request ID with a different fingerprint returns `409 DUPLICATE_REQUEST` without identifying the changed field.
- `COMPLETED` is a non-replayable tombstone; every completed duplicate returns `409 DUPLICATE_REQUEST`.
- P6 stores no response body, provider response, final API status/code, or provider usage for replay. Replay remains deferred until Phase 9 safe encrypted/reference storage exists.
- The MVP must not trigger a second billable provider call for the same accepted `clientRequestId`.
- A process crash after provider execution may have started can outlive the 300-second `PROCESSING` TTL and permit a later retry. No automatic reconciliation is promised by this endpoint.

## 16.7 Client disconnect

When the client disconnects:

- Abort the provider request when the provider SDK supports cancellation.
- Stop writing SSE frames.
- Finalize a safe `INTERRUPTED` request log.
- Do not continue generating paid output unnecessarily.
- Do not treat client cancellation as a provider failure for circuit-breaker purposes.

# 17. Admin Summary API

> **Phase 8 canonical boundary:** Admin APIs are read-only and organisation
> scoped. The backend exposes only fields present in current authoritative
> schemas. Monetary cost, latency, cache, fallback, routing reason, and PII-risk
> metrics are omitted. Team-lead request-log access, admin mutations, alert
> resolution, and audit export remain deferred until their trusted ownership or
> Phase 9 append-only audit prerequisites exist.

## 17.1 GET `/admin/summary`

Returns organisation-scoped dashboard KPIs for a selected period.

### Permission

`admin:view_logs`

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `period` | string | `month` | `today`, `7d`, `30d`, or `month` |

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "period": "month",
    "requests": {
      "total": 1240,
      "completed": 1182,
      "blocked": 32,
      "failed": 26
    },
    "tokens": {
      "total": 894220,
      "budget": 1000000,
      "remaining": 105780,
      "remainingPercent": 10.58
    },
    "alerts": {
      "active": 4
    },
    "providers": [
      {
        "providerId": "groq",
        "state": "CLOSED",
        "averageLatencyMs": 430,
        "lastCheckedAt": "2026-07-23T10:15:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Unknown usage is represented explicitly and never converted to zero. Cost is
omitted because provider pricing is not approved and is not persisted.

# 18. Admin Request Log API

## 18.1 GET `/admin/logs`

Returns organisation-scoped request metadata. It never returns raw prompt or response content.

### Permission

`admin:view_logs`

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---:|---|
| `limit` | integer | 25 | 1–100 |
| `cursor` | string | none | Opaque cursor |
| `userId` | UUID | none | User public ID within current organisation |
| `provider` | string | none | Configured provider enum |
| `dateFrom` | datetime | none | Inclusive UTC lower bound |
| `dateTo` | datetime | none | Inclusive UTC upper bound |
| `status` | string | none | `COMPLETED`, `BLOCKED`, `FAILED`, `INTERRUPTED` |

The maximum permitted date range should be bounded in configuration to avoid expensive unbounded queries.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "requestId": "req_01J...",
        "userId": "d7dd6154-d0a3-4c27-b28c-bf332ac3219a",
        "provider": "groq",
        "model": "configured-model",
        "routingReason": "fallback",
        "status": "COMPLETED",
        "tokens": {
          "input": 18,
          "output": 142,
          "total": 160
        },
        "policyAction": "ALLOW",
        "createdAt": "2026-07-23T10:16:02.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2..."
  }
}
```

### Tenant and team scope

- An organisation admin receives organisation-wide results.
- Team-lead access is not exposed until a trusted RequestLog-to-team ownership contract exists.
- Cross-tenant IDs must behave as not found, not as permission-disclosure errors.

# 19. Admin Billing API

## 19.1 GET `/admin/billing`

Returns pre-aggregated billing and token usage.

### Permission

`admin:view_billing`

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `period` | string | current `YYYY-MM` | Must match `YYYY-MM` |
| `userId` | string | none | Optional user in same organisation |

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "period": "2026-07",
    "budget": {
      "tokenLimit": 1000000,
      "tokensUsed": 894220,
      "tokensRemaining": 105780,
      "remainingPercent": 10.58,
      "threshold80Reached": true,
      "exhausted": false
    },
    "totals": {
      "requestCount": 1240,
      "inputTokens": 384220,
      "outputTokens": 510000,
      "totalTokens": 894220,
      "knownUsageRequestCount": 1239,
      "unknownUsageRequestCount": 1
    },
    "byProvider": [
      {
        "providerId": "groq",
        "requestCount": 820,
        "totalTokens": 520000
      },
      {
        "providerId": "gemini",
        "requestCount": 420,
        "totalTokens": 374220
      }
    ]
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

Pricing is not approved, so the API omits cost instead of reporting a fabricated
zero or estimate. Unknown usage remains visible separately from known totals.

# 20. Admin Alerts APIs

## 20.1 GET `/admin/alerts`

Lists organisation alerts.

When anomaly alerts are implemented, the daily token anomaly is exposed as
`type: "anomaly"`, `severity: "high"`, and `resolved: false` for internal
status `OPEN`. Safe anomaly fields may include `observedDay`,
`normalUsage`, `observedUsage`, and `baselineActiveDays`; they never contain
prompt, response, PII, unknown token values, or secrets. The anomaly is scoped
to the authenticated organisation.

### Permission

`admin:view_logs`

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---:|---|
| `limit` | integer | 25 | 1–100 |
| `cursor` | string | none | Opaque cursor |
| `type` | string | `ANOMALY` | Only `ANOMALY` exists in the current MVP |
| `resolved` | boolean | false | Filter resolution state |

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "alertId": "alt_91c...",
        "type": "ANOMALY",
        "severity": "HIGH",
        "message": "Daily token usage exceeded the approved rolling baseline.",
        "userId": "d7dd6154-d0a3-4c27-b28c-bf332ac3219a",
        "observedDay": "2026-07-20",
        "resolved": false,
        "createdAt": "2026-07-20T08:00:00.000Z",
        "resolvedAt": null
      }
    ]
  },
  "meta": {
    "requestId": "req_01J...",
    "nextCursor": null
  }
}
```

## 20.2 PATCH `/admin/alerts/{alertId}`

Marks an alert resolved or reopens it.

An anomaly update targets the existing tenant-scoped
`{ orgId, userId, observedDay, ANOMALY }` record. Re-evaluation and future admin
resolution reuse that record and do not create duplicate same-day alerts.

### Permission

`admin:view_logs`

### Request

```json
{
  "resolved": true
}
```

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "alertId": "alt_91c...",
    "resolved": true,
    "resolvedAt": "2026-07-23T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

The alert transition and durable audit append commit in one MongoDB
transaction. Audit failure returns `503 AUDIT_UNAVAILABLE` with no state
change.

## 20.3 Admin User Mutation APIs — Phase 9

All routes require `admin:manage_users`, trusted authenticated `orgId`, strict
Zod bodies, generic `404` for foreign/missing resources, and a MongoDB
transaction containing both the mutation and append-only audit record. Clients
cannot submit `orgId`, permissions, or arbitrary user fields.

## PATCH `/admin/users/{userId}/role`

```json
{ "role": "TEAM_LEAD" }
```

`role` is one of `EMPLOYEE`, `TEAM_LEAD`, or `ORG_ADMIN`. The backend replaces
permissions with the canonical role mapping; it never merges client-provided
permission strings. An active `TEAM_LEAD` requires a trusted same-organisation
team. Removing the last active `ORG_ADMIN` returns
`409 LAST_ACTIVE_ORG_ADMIN`.

## PATCH `/admin/users/{userId}/team`

```json
{ "teamId": "d7dd6154-d0a3-4c27-b28c-bf332ac3219a" }
```

`teamId` is a UUID or `null`. A non-null Team is loaded through trusted
`{ orgId, teamId }`. Removing an active team lead's assignment returns
`409 TEAM_ASSIGNMENT_REQUIRED`.

## PATCH `/admin/users/{userId}/status`

```json
{ "status": "DISABLED" }
```

Only `ACTIVE` and `DISABLED` are accepted. Disabling revokes all active refresh
sessions for trusted `{ orgId, userId }` in the same transaction. Reactivation
does not issue or restore a session. The last active `ORG_ADMIN` cannot be
disabled.

## POST `/admin/users/{userId}/revoke-sessions`

The request has no JSON body. It revokes every active refresh session for the
tenant-scoped user and returns a standard success envelope containing only
`userId`, `revokedSessionCount`, and `effectiveAt`.

All four routes return `503 AUDIT_UNAVAILABLE` without a partial admin mutation
when the transaction/audit append cannot commit.

# 21. Admin Policy API

## 21.1 PATCH `/admin/policy` — Phase 9

Updates approved organisation policy thresholds and monthly token budget.

### Permission

`admin:configure_policy`

### Request

```json
{
  "maskThreshold": 20,
  "blockThreshold": 60,
  "monthlyTokenBudget": 1000000
}
```

All fields are optional for PATCH, but at least one must be present.

### Validation

- Thresholds are integers from 0 to 100.
- `blockThreshold` must be greater than `maskThreshold` after applying the complete resulting configuration.
- `monthlyTokenBudget` is a non-negative integer.
- An update cannot silently reset omitted values.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "policy": {
      "maskThreshold": 20,
      "blockThreshold": 60
    },
    "monthlyTokenBudget": 1000000,
    "updatedAt": "2026-07-23T10:22:00.000Z"
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

### Audit rule

Write old and new safe configuration values. Do not include unrelated organisation fields or secrets.

# 22. Admin Retention API

## 22.1 PATCH `/admin/retention` — Phase 9

Updates the organisation retention mode.

### Permission

`admin:configure_policy`

### Request — metadata only

```json
{
  "mode": "METADATA_ONLY"
}
```

### Request — encrypted storage

```json
{
  "mode": "ENCRYPTED_STORAGE"
}
```

### Validation

- `CUSTOM_RETENTION` and `NO_STORAGE` are not MVP modes.
- `ENCRYPTED_STORAGE` requires a validated active encryption keyring.
- The update applies prospectively. It does not silently decrypt, rewrite, or restore historical content.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "retention": {
      "mode": "METADATA_ONLY"
    },
    "effectiveAt": "2026-07-23T10:25:00.000Z"
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

The policy is enforced before future message persistence.

# 23. Audit Export API

## 23.1 GET `/admin/audit/export` — Phase 9

Exports append-only audit records for the current organisation as CSV.

### Permission

`admin:export_audit`

The organisation's `auditExport` feature flag must also be enabled.

### Query parameters

| Parameter | Required | Rules |
|---|---:|---|
| `dateFrom` | Yes | Inclusive UTC date/time |
| `dateTo` | Yes | Inclusive UTC date/time; must be after `dateFrom` |
| `action` | No | Optional exact/prefix action filter |

The inclusive date range is limited to 90 days. At most 10,000 rows may be
exported; larger results return `413 EXPORT_TOO_LARGE` and are never silently
truncated.

### Success — `200 OK`

```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="proxiai-audit-2026-07-01-to-2026-07-23.csv"
Cache-Control: no-store
X-Request-ID: req_01J...
```

Recommended CSV columns:

```text
occurredAt,actorId,actorType,action,resourceType,resourceId,ipAddress,userAgent,metadata
```

`metadata` should be safe JSON escaped as a CSV field. It must never contain raw prompts, responses, passwords, credentials, refresh tokens, or detected sensitive values.

The bounded CSV is generated first, formula-dangerous cells beginning with
`=`, `+`, `-`, or `@` are neutralized, then `audit.exported` is appended with
safe range/filter/row-count metadata before response headers are committed.
Audit failure returns `503 AUDIT_UNAVAILABLE`.

# 24. Health APIs

## 24.1 GET `/health/live`

Reports whether the application process is running.

### Authentication

Public.

### Success — `200 OK`

```json
{
  "status": "ok",
  "service": "proxiai-api",
  "time": "2026-07-23T10:30:00.000Z"
}
```

This endpoint must not query MongoDB, Redis, or providers.

## 24.2 GET `/health/ready`

Reports whether the instance is ready to receive traffic.

### Authentication

Public, but output is intentionally minimal.

### Success — `200 OK`

```json
{
  "status": "ready",
  "checks": {
    "mongo": "up",
    "redis": "up"
  },
  "time": "2026-07-23T10:30:00.000Z"
}
```

### Not ready — `503 Service Unavailable`

```json
{
  "status": "not_ready",
  "checks": {
    "mongo": "up",
    "redis": "down"
  },
  "time": "2026-07-23T10:30:00.000Z"
}
```

No connection strings, exception messages, provider keys, or topology details are returned.

## 24.3 GET `/health/detailed`

Provides additional dependency status for platform operations.

### Availability

- Disabled in production MVP unless needed.
- Otherwise requires `platform:view_health`.

### Success — `200 OK`

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "dependencies": {
      "mongo": {
        "status": "up",
        "latencyMs": 8
      },
      "redis": {
        "status": "up",
        "latencyMs": 3
      },
      "providers": [
        {
          "providerId": "groq",
          "state": "CLOSED",
          "averageLatencyMs": 430,
          "lastCheckedAt": "2026-07-23T10:29:00.000Z"
        }
      ],
      "queues": [
        {
          "name": "billing-queue",
          "waiting": 0,
          "failed": 0
        }
      ]
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

# 25. Cursor Pagination Contract

## 25.1 Cursor content

The cursor is opaque to clients. Internally it contains the final item's stable sort fields:

```json
{
  "createdAt": "2026-07-23T10:16:02.000Z",
  "id": "mongo-object-id-or-public-id"
}
```

It is base64url encoded. Signing with HMAC is recommended when implementation is straightforward.

## 25.2 Sort order

List endpoints sort by:

```text
createdAt descending, _id descending
```

For conversations, `lastMessageAt` may be the primary sort key, with `_id` as the tie-breaker.

## 25.3 Client rules

- Treat cursor as an opaque string.
- Do not modify or construct it.
- Pass `nextCursor` exactly as returned.
- A `null` or absent `nextCursor` means no next page.

## 25.4 Server rules

- Validate decoded types.
- Reject invalid cursors with `400 INVALID_CURSOR`.
- Query with trusted `orgId` and other ownership filters before cursor conditions.
- Fetch `limit + 1` to determine `hasMore`.
- Never include tenant identity in a way that lets the cursor override authenticated scope.

# 26. Validation Standards

## 26.1 Body validation

Use Zod schemas at the route boundary. Unknown properties should be rejected or stripped consistently; rejecting is preferred for configuration updates.

## 26.2 Identifier validation

Public IDs must follow the chosen UUID or prefixed-ID format. A syntactically valid ID still requires tenant and ownership checks.

## 26.3 String normalization

- Trim user-entered strings.
- Normalize emails to lower case for lookup.
- Normalize passwords to Unicode NFC before hashing and verification.
- Do not trim, case-fold, or truncate passwords.
- Do not mutate prompts beyond approved masking and provider preparation.

## 26.4 Prompt validation

- Required and non-empty after trim.
- Maximum 20,000 characters for initial MVP safety.
- Provider-specific token/context limits checked after token estimation.
- Body-size middleware must reject excessive payloads before parsing large content.

## 26.5 Date validation

- ISO 8601 UTC inputs.
- `dateFrom <= dateTo`.
- Bounded ranges for logs and exports.

# 27. CORS, Cookies, and CSRF

## 27.1 CORS

- Allow only configured frontend origins.
- Enable credentials because the refresh cookie is used.
- Do not use wildcard origin with credentials.
- Restrict allowed headers to required values.

## 27.2 CSRF

The access-token APIs use an Authorization header, reducing ambient-cookie CSRF risk. Refresh and logout use cookies and must rely on:

- `SameSite=Lax` or stricter where compatible
- Origin validation for state-changing cookie-authenticated requests
- Narrow cookie path
- Secure HTTPS production transport

A separate anti-CSRF token may be added if deployment requirements demand cross-site cookie behavior; it is not required for the simple same-site MVP setup.

# 28. Rate-Limit Contract

Recommended MVP limits:

| Route group | Limit |
|---|---|
| Login | 10 attempts per IP per 15 minutes |
| Refresh | 30 attempts per session per 15 minutes |
| Chat FREE | 10 per user and 60 per organisation per minute |
| Chat PRO | 30 per user and 300 per organisation per minute |
| Chat ENTERPRISE | 60 per user and 1200 per organisation per minute |
| Audit export | 5 exports per admin per hour |

Both the trusted-user and trusted-organisation chat counters are enforced.
The active Organisation plan selects the pair. Redis keys contain only
domain-separated HMAC digests of trusted identifiers; prompts and emails never
enter rate-limit keys. The six `CHAT_RATE_LIMIT_*_RPM` environment values are
required and have no hidden defaults. Custom enterprise overrides are deferred.

Example response:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "requestId": "req_01J...",
    "details": {
      "retryAfterSeconds": 60
    }
  }
}
```

`Retry-After: 60` should also be returned where possible.

# 29. Versioning and Compatibility

- All MVP business endpoints use `/api/v1`.
- Health endpoints may remain unversioned at `/health/...` at the server root; the implementation must choose one convention and use it consistently. This document models them as `/health/...`, matching the TDD.
- New optional response fields are backward-compatible.
- Removing or renaming a field is breaking.
- Changing an enum meaning is breaking.
- Adding a new enum value can affect exhaustive clients and should be communicated.
- `/api/v1` must remain functional during any future `/api/v2` migration window.

# 30. OpenAPI 3.1 Starter Definition

The following starter definition is intentionally compact. It provides the structure Codex or the developer can move into `docs/openapi.yaml` during implementation. Detailed examples and business rules remain in this Markdown document.

```yaml
openapi: 3.1.0
info:
  title: ProxiAI API
  version: 1.0.0
  description: Enterprise AI gateway and audit platform MVP API.
servers:
  - url: http://localhost:8080/api/v1
    description: Local development
  - url: https://{host}/api/v1
    description: Production
    variables:
      host:
        default: api.example.com
security:
  - bearerAuth: []
tags:
  - name: Auth
  - name: Conversations
  - name: Chat
  - name: Admin
  - name: Health
paths:
  /auth/login:
    post:
      tags: [Auth]
      security: []
      operationId: login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Authenticated
          headers:
            Set-Cookie:
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginSuccess'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'
  /auth/refresh:
    post:
      tags: [Auth]
      security:
        - refreshCookie: []
      operationId: refreshSession
      responses:
        '200':
          description: Token rotated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TokenSuccess'
        '204':
          description: No refresh cookie; anonymous bootstrap
        '401':
          $ref: '#/components/responses/Unauthorized'
  /auth/logout:
    post:
      tags: [Auth]
      security:
        - refreshCookie: []
      operationId: logout
      responses:
        '200':
          description: Logged out
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LogoutSuccess'
        '503':
          $ref: '#/components/responses/ServiceUnavailable'
  /auth/me:
    get:
      tags: [Auth]
      operationId: getCurrentUser
      responses:
        '200':
          description: Current user
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CurrentUserSuccess'
        '401':
          $ref: '#/components/responses/Unauthorized'
  /conversations:
    post:
      tags: [Conversations]
      operationId: createConversation
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateConversationRequest'
      responses:
        '201':
          description: Conversation created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConversationSuccess'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
    get:
      tags: [Conversations]
      operationId: listConversations
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
      responses:
        '200':
          description: Conversation page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConversationListSuccess'
        '401':
          $ref: '#/components/responses/Unauthorized'
  /conversations/{conversationId}:
    get:
      tags: [Conversations]
      operationId: getConversation
      parameters:
        - $ref: '#/components/parameters/ConversationId'
      responses:
        '200':
          description: Conversation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConversationSuccess'
        '404':
          $ref: '#/components/responses/NotFound'
    patch:
      tags: [Conversations]
      operationId: updateConversationTitle
      parameters:
        - $ref: '#/components/parameters/ConversationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateConversationTitleRequest'
      responses:
        '200':
          description: Conversation renamed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ConversationSuccess'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
  /conversations/{conversationId}/messages:
    get:
      tags: [Conversations]
      operationId: listConversationMessages
      parameters:
        - $ref: '#/components/parameters/ConversationId'
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
      responses:
        '200':
          description: Message page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MessageListSuccess'
        '404':
          $ref: '#/components/responses/NotFound'
  /chat/stream:
    post:
      tags: [Chat]
      operationId: streamChat
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatRequest'
      responses:
        '200':
          description: SSE-formatted chat stream. Event schemas are documented in 05_OPENAPI_SPEC.md.
          content:
            text/event-stream:
              schema:
                type: string
        '400':
          $ref: '#/components/responses/BadRequest'
        '402':
          description: Budget exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          description: Duplicate or in-progress request
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '429':
          $ref: '#/components/responses/RateLimited'
        '503':
          description: Dependency or provider unavailable
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /admin/summary:
    get:
      tags: [Admin]
      operationId: getAdminSummary
      parameters:
        - name: period
          in: query
          schema:
            type: string
            enum: [today, 7d, 30d, month]
            default: month
      responses:
        '200':
          description: KPI summary
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
  /admin/logs:
    get:
      tags: [Admin]
      operationId: listRequestLogs
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: userId
          in: query
          schema: { type: string, format: uuid }
        - name: provider
          in: query
          schema: { $ref: '#/components/schemas/ProviderId' }
        - name: dateFrom
          in: query
          schema: { type: string, format: date-time }
        - name: dateTo
          in: query
          schema: { type: string, format: date-time }
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/RequestStatus' }
        - name: policyAction
          in: query
          schema: { type: string, enum: [ALLOW, ALLOW_WITH_MASK, BLOCK] }
      responses:
        '200':
          description: Request-log page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
  /admin/billing:
    get:
      tags: [Admin]
      operationId: getBilling
      parameters:
        - name: period
          in: query
          schema:
            type: string
            pattern: '^\\d{4}-(0[1-9]|1[0-2])$'
      responses:
        '200':
          description: Billing rollup
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
  /admin/alerts:
    get:
      tags: [Admin]
      operationId: listAlerts
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: status
          in: query
          schema: { type: string, enum: [OPEN, RESOLVED] }
        - name: userId
          in: query
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Alert page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
  /admin/alerts/{alertId}:
    patch:
      tags: [Admin]
      operationId: updateAdminAlertState
      parameters:
        - name: alertId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              additionalProperties: false
              required: [resolved]
              properties:
                resolved: { type: boolean }
      responses:
        '200': { description: Alert state updated }
        '404': { $ref: '#/components/responses/NotFound' }
        '503': { description: Audit transaction unavailable }
  /admin/policy:
    patch:
      tags: [Admin]
      operationId: updateAdminPolicy
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdatePolicyRequest' }
      responses:
        '200': { description: Policy or budget updated }
        '503': { description: Audit transaction unavailable }
  /admin/retention:
    patch:
      tags: [Admin]
      operationId: updateAdminRetention
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateRetentionRequest' }
      responses:
        '200': { description: Prospective retention mode updated }
        '503': { description: Audit or encryption unavailable }
  /admin/audit/export:
    get:
      tags: [Admin]
      operationId: exportAdminAudit
      parameters:
        - name: dateFrom
          in: query
          required: true
          schema: { type: string, format: date-time }
        - name: dateTo
          in: query
          required: true
          schema: { type: string, format: date-time }
        - name: action
          in: query
          schema: { type: string, maxLength: 100 }
      responses:
        '200': { description: Formula-safe tenant audit CSV }
        '403': { $ref: '#/components/responses/Forbidden' }
        '413': { description: Export exceeds 10,000 rows }
        '503': { description: Audit append unavailable }
  /admin/users:
    get:
      tags: [Admin]
      operationId: listAdminUsers
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: role
          in: query
          schema: { type: string, enum: [EMPLOYEE, TEAM_LEAD, ORG_ADMIN] }
        - name: status
          in: query
          schema: { type: string, enum: [INVITED, ACTIVE, DISABLED] }
        - name: teamId
          in: query
          schema: { type: string, format: uuid }
      responses:
        '200':
          description: Organisation user page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
  /admin/users/{userId}/role:
    patch:
      tags: [Admin]
      operationId: updateAdminUserRole
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateUserRoleRequest' }
      responses:
        '200': { description: Role and canonical permissions updated }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { description: Last active admin or team invariant conflict }
        '503': { description: Audit transaction unavailable }
  /admin/users/{userId}/team:
    patch:
      tags: [Admin]
      operationId: updateAdminUserTeam
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateUserTeamRequest' }
      responses:
        '200': { description: Team assignment updated }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { description: Active team lead assignment conflict }
        '503': { description: Audit transaction unavailable }
  /admin/users/{userId}/status:
    patch:
      tags: [Admin]
      operationId: updateAdminUserStatus
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateUserStatusRequest' }
      responses:
        '200': { description: User status updated and sessions revoked when disabled }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { description: Last active admin conflict }
        '503': { description: Audit transaction unavailable }
  /admin/users/{userId}/revoke-sessions:
    post:
      tags: [Admin]
      operationId: revokeAdminUserSessions
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200': { description: Active refresh sessions revoked }
        '404': { $ref: '#/components/responses/NotFound' }
        '503': { description: Audit transaction unavailable }
  /admin/teams:
    get:
      tags: [Admin]
      operationId: listAdminTeams
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - name: isActive
          in: query
          schema: { type: boolean }
      responses:
        '200':
          description: Organisation team page
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SuccessEnvelope'
        '403':
          $ref: '#/components/responses/Forbidden'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
    refreshCookie:
      type: apiKey
      in: cookie
      name: proxiai_refresh
  parameters:
    Limit:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 25
    Cursor:
      name: cursor
      in: query
      schema: { type: string }
    ConversationId:
      name: conversationId
      in: path
      required: true
      schema: { type: string }
  schemas:
    LoginRequest:
      type: object
      additionalProperties: false
      required: [organisationSlug, email, password]
      properties:
        organisationSlug:
          type: string
          minLength: 2
          maxLength: 63
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        email: { type: string, format: email, maxLength: 254 }
        password: { type: string, minLength: 1, maxLength: 128 }
    CreateConversationRequest:
      type: object
      additionalProperties: false
      properties:
        title: { type: string, minLength: 1, maxLength: 120 }
    UpdateConversationTitleRequest:
      type: object
      additionalProperties: false
      required: [title]
      properties:
        title: { type: string, minLength: 1, maxLength: 120 }
    ChatRequest:
      type: object
      additionalProperties: false
      required: [conversationId, prompt, clientRequestId]
      properties:
        conversationId: { type: string, minLength: 1 }
        prompt: { type: string, minLength: 1, maxLength: 20000 }
        clientRequestId: { type: string, format: uuid }
        providerId: { $ref: '#/components/schemas/ProviderId' }
        routingMode:
          type: string
          enum: [manual, auto]
          default: auto
    UpdatePolicyRequest:
      type: object
      additionalProperties: false
      minProperties: 1
      properties:
        maskThreshold: { type: integer, minimum: 0, maximum: 100 }
        blockThreshold: { type: integer, minimum: 0, maximum: 100 }
        monthlyTokenBudget: { type: integer, minimum: 0 }
    UpdateRetentionRequest:
      type: object
      additionalProperties: false
      required: [mode]
      properties:
        mode:
          type: string
          enum: [METADATA_ONLY, ENCRYPTED_STORAGE]
    UpdateUserRoleRequest:
      type: object
      additionalProperties: false
      required: [role]
      properties:
        role: { type: string, enum: [EMPLOYEE, TEAM_LEAD, ORG_ADMIN] }
    UpdateUserTeamRequest:
      type: object
      additionalProperties: false
      required: [teamId]
      properties:
        teamId: { type: [string, 'null'], format: uuid }
    UpdateUserStatusRequest:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status: { type: string, enum: [ACTIVE, DISABLED] }
    ProviderId:
      type: string
      enum: [groq, gemini, third]
    RequestStatus:
      type: string
      enum: [COMPLETED, BLOCKED, FAILED, INTERRUPTED]
    ErrorDetail:
      type: object
      additionalProperties: true
    ErrorEnvelope:
      type: object
      additionalProperties: false
      required: [success, error]
      properties:
        success:
          type: boolean
          const: false
        error:
          type: object
          additionalProperties: false
          required: [code, message, requestId]
          properties:
            code: { type: string }
            message: { type: string }
            requestId: { type: string }
            details: { $ref: '#/components/schemas/ErrorDetail' }
    SuccessEnvelope:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          const: true
        data: {}
        meta:
          type: object
          properties:
            requestId: { type: string }
            nextCursor:
              type: [string, 'null']
    LoginSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    TokenSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    LogoutSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    CurrentUserSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    ConversationSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    ConversationListSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
    MessageListSuccess:
      $ref: '#/components/schemas/SuccessEnvelope'
  responses:
    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
    Unauthorized:
      description: Authentication required or invalid
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
    Forbidden:
      description: Permission, feature, policy, or tenant access denied
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
    NotFound:
      description: Resource not found in authenticated scope
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
    RateLimited:
      description: Too many requests
      headers:
        Retry-After:
          schema: { type: integer }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorEnvelope' }
```

## 31. Known OpenAPI Limitation for SSE

OpenAPI can declare `text/event-stream`, but it does not fully model named SSE events and their individual JSON payload schemas in a universally supported way.

For MVP:

- `openapi.yaml` declares the endpoint response as `text/event-stream` with a string schema.
- This document remains the authoritative event catalog.
- Unit and integration tests validate each event payload.
- A future AsyncAPI document is unnecessary for the beginner MVP because the stream is a single HTTP request, not a separate message-broker public contract.

## 32. API Security Checklist

- [ ] Access token verified on every protected route
- [ ] User and organisation active state checked
- [ ] `orgId` taken from trusted auth context
- [ ] Resource ownership checked before decrypting content
- [ ] Permission guard applied at route level
- [ ] Zod validation applied after auth and permission context
- [ ] Body-size limit enabled
- [ ] Login and chat rate limits enabled
- [ ] Refresh cookie uses secure attributes
- [ ] CORS origin allowlist configured
- [ ] Cookie-authenticated state changes validate origin
- [ ] Raw provider errors normalized
- [ ] Stack traces never sent to clients
- [ ] Prompts and responses excluded from normal logs
- [ ] PII categories may be returned; raw detected spans may not
- [ ] Audit export is permission-gated and audited
- [ ] Health responses omit credentials and connection details
- [ ] Admin filters cannot escape tenant scope
- [ ] Cursor cannot override tenant or ownership filters

## 33. Contract Test Plan

### 33.1 Authentication

- Login success returns access token and sets refresh cookie.
- Invalid credentials always return the same safe message.
- Refresh rotates token and rejects reuse.
- Logout revokes session and clears cookie.
- `/auth/me` excludes password/token/internal fields.

### 33.2 Tenant isolation

- User A cannot access User B's conversation.
- Org A admin cannot filter or retrieve Org B's logs.
- Cross-tenant identifiers return `404` or safe `403` without confirming existence.
- Audit export contains only authenticated organisation records.

### 33.3 Chat

- Valid manual request streams expected event order.
- Valid auto-routing request works only when enabled.
- Conflicting manual/auto fields return `400`.
- Blocked prompt returns `403 POLICY_BLOCKED` before provider call.
- Masked request sends masked provider text and never exposes raw spans.
- Provider fallback occurs only before first token.
- Mid-stream failure emits terminal `error` and closes.
- Duplicate client request does not make a second provider call.
- Client disconnect aborts generation where supported.

### 33.4 Pagination and filtering

- Limit boundaries are enforced.
- Invalid cursor returns `INVALID_CURSOR`.
- Stable cursor avoids duplicate/omitted records with equal timestamps.
- Date, provider, PII, status, and fallback filters compose correctly.

### 33.5 Admin configuration

- Policy PATCH preserves omitted fields.
- Invalid threshold ordering is rejected.
- Retention PATCH rejects unsupported `CUSTOM_RETENTION` and `NO_STORAGE`.
- `ENCRYPTED_STORAGE` requires the validated active keyring.
- Updates create audit entries.

### 33.6 Error safety

- Unknown server errors return `INTERNAL_ERROR` only.
- No stack, provider body, secret, prompt, or response appears in error JSON.
- Request ID appears in all normal JSON errors.

## 34. Frontend Integration Rules

### 34.1 Access-token handling

- Keep the access token in memory where practical.
- Do not store the refresh token in JavaScript-accessible storage.
- On `401 ACCESS_TOKEN_EXPIRED`, call `/auth/refresh` once, then retry the original safe request once.
- Avoid infinite refresh loops.

### 34.2 Streaming client

Use `fetch`:

```ts
const response = await fetch(`${apiBase}/chat/stream`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  body: JSON.stringify(request),
  signal: abortController.signal,
});
```

Before reading `response.body`, inspect `Content-Type`:

- `application/json`: parse normal success/error envelope.
- `text/event-stream`: parse SSE frames incrementally.

### 34.3 Error presentation

- Display safe `message` to the user.
- Keep `requestId` available for support.
- Branch behavior using stable `code`, not message text.
- Never display raw `details` without a known safe UI formatter.

## 35. Implementation Order

1. Shared envelopes and error middleware
2. Bearer authentication and permission guard
3. Login, refresh, logout, and current-user APIs
4. Conversation create/list/read APIs
5. Chat request validation and pre-stream JSON errors
6. SSE event writer and parser contract
7. Admin summary and logs APIs
8. Billing and alert APIs
9. Policy and retention PATCH APIs
10. Audit CSV export
11. Health endpoints
12. OpenAPI YAML extraction and Swagger UI in development only
13. Contract tests

Swagger UI is optional for local development. It should not expose private operational details publicly in production.

## 36. Traceability Summary

| API area | PRD requirements | TDD sections | Database areas |
|---|---|---|---|
| Authentication | FR-AUTH-001–004 | Authentication Technical Design | Users, refresh tokens, audit logs |
| Tenant isolation | FR-ORG-001–002 | Middleware, RBAC, Security Controls | Every tenant collection and repository filter |
| Conversations | FR-CHAT-001, FR-CHAT-004 | Conversation and Chat API | Conversations, messages |
| Streaming chat | FR-CHAT-002–005 | Chat Pipeline, SSE Technical Design | Messages, request logs, billing jobs |
| PII and policy | FR-PII-001–005, FR-POLICY-001–005 | PII Pipeline, Policy Engine | Request logs, audit logs, organisation policy |
| Routing and fallback | FR-ROUTING-001–006, FR-RES-001–006 | Provider, Routing, Retry, Circuit Breaker, Fallback | Provider health, request logs |
| Idempotency/cache | FR-CACHE-001–002, FR-IDEMP-001–002 | Prompt Cache, Idempotency | Redis key catalog |
| Retention | FR-RET-001–004 | Retention and Encryption | Organisation, messages, TTL fields |
| Billing | FR-BILL-001–004 | Billing Worker | Billing rollups |
| Alerts | FR-ALERT-001–003 | Anomaly and Alert logic | Alerts |
| Audit | FR-AUDIT-001–003 | Audit Logging | Append-only audit logs |
| Admin dashboard | FR-ADMIN-001–004 | Admin APIs, Pagination, Filters | Request logs, billing, alerts, provider health |
| Health | FR-HEALTH-001–003 | Health Endpoints | Dependency checks only |

## 37. Open API Decisions

The following decisions must be resolved during implementation without expanding scope:

1. Select the exact third provider identifier to replace `third`.
2. Confirm whether public IDs use UUIDs or prefixed random IDs consistently.
3. Confirm the maximum allowed custom-retention days.
4. Confirm the maximum audit-export date range.
5. Confirm whether health endpoints are mounted at `/health/...` or `/api/v1/health/...`; this document follows the TDD's unversioned form.
6. Confirm whether completed idempotent requests are replayed or return a safe duplicate response. No second provider call is allowed in either case.

## 38. API Self-Audit

### 38.1 Scope audit — PASS

No SSO, BYOK management, approval workflow, WebSocket, Kafka, GraphQL, or other deferred feature was added.

### 38.2 Beginner and solo-developer audit — PASS

The API is limited to authentication, conversations, one streaming chat endpoint, a small admin surface, and health checks. It uses one response convention and one pagination model.

### 38.3 PRD/SDD/TDD consistency audit — PASS

The API order preserves authentication, idempotency, PII, policy, routing, provider call, persistence, and async processing boundaries.

### 38.4 Tenant-isolation audit — PASS

No employee or organisation-admin API accepts `orgId` as a tenant selector. Every resource lookup requires trusted tenant context.

### 38.5 Sensitive-data audit — PASS

Raw PII, prompts, responses, passwords, tokens, and provider secrets are excluded from error, audit, logs, and admin request-log contracts.

### 38.6 Streaming audit — PASS

The authenticated stream is correctly designed as POST plus `fetch()` SSE parsing rather than browser `EventSource`. Pre-stream failures use JSON; post-commit failures use terminal SSE events.

### 38.7 Error-contract audit — PASS

Stable codes, request IDs, safe messages, and correct HTTP categories are documented. Unknown errors do not leak internals.

### 38.8 Database-contract audit — PASS

Cursor fields, public IDs, encrypted message access, request-log metadata, billing rollups, alerts, and append-only audit behavior align with `04_DATABASE_DESIGN.md`.

### 38.9 OpenAPI audit — PASS WITH DOCUMENTED LIMITATION

The starter OpenAPI 3.1 structure covers the approved endpoints. SSE named-event payloads remain documented in Markdown because generic OpenAPI tooling does not model them fully.

### 38.10 Corrections made during audit

- Did not expose `orgId` as a client-controlled admin filter.
- Did not expose raw prompt or response content in admin logs.
- Did not include `NO_STORAGE` in the beginner MVP retention API.
- Did not include `REQUIRE_APPROVAL` in the policy action enum.
- Used decimal strings for cost values rather than unsafe JSON floating-point assumptions.
- Defined JSON errors before stream commitment and SSE errors afterward.
- Added stable `_id` tie-breaking requirements to cursor pagination.
- Kept health output minimal and secret-free.

## 39. Final Approval

**Status: Approved as the API contract baseline for the ProxiAI beginner solo-developer MVP.**

Implementation should create a machine-readable `docs/openapi.yaml` from this contract while preserving this Markdown file as the explanation, examples, security rules, and SSE event reference.

## 40. Public Admin Demo Authentication

### POST `/auth/demo-admin`

Starts the optional zero-cost recruiter admin demo. The endpoint is available
only when `PUBLIC_ADMIN_DEMO_ENABLED=true`; otherwise it returns the standard
`404 NOT_FOUND` envelope.

The request body must be absent or `{}`. Additional properties are rejected.
The backend resolves the fixed trusted `novastack` organisation and
`admin-demo@novastack.demo` user. It never accepts `orgId`, organisation slug,
email, role, permissions, or password from the client.

Success returns the standard envelope with `accessToken`,
`expiresInSeconds: 360`, authoritative ISO `expiresAt`, and the safe user
profile. No refresh token or refresh-token record is created. The response
clears any existing refresh cookie. The access token carries the trusted
internal `PUBLIC_ADMIN_DEMO` session mode; expiry and current database state
are authoritative.

Public demo sessions may use approved read-only admin APIs and owner-scoped
chat. Privileged admin mutations and audit export return `403` with code
`PUBLIC_DEMO_READ_ONLY` and the safe message "Administrative changes are
disabled in public demo mode."
