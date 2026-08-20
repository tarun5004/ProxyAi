<div align="center">
  <img src="frontend/public/proxiai-logo.png" alt="ProxiAI logo" width="112" />

  <h1>ProxiAI</h1>

  <p><strong>Policy-aware AI gateway for secure, governed, and observable enterprise AI usage.</strong></p>

  <p>
    ProxiAI sits between an organisation's users and external LLM providers. It inspects prompts,
    applies tenant policy, protects sensitive data, enforces usage controls, streams approved AI
    responses, and records operational metadata for billing, analytics, and audit-oriented workflows.
  </p>

  <p>
    <img src="https://img.shields.io/badge/status-pre--production%20MVP-f59e0b" alt="Pre-production MVP" />
    <img src="https://img.shields.io/badge/architecture-modular%20monolith-2563eb" alt="Modular monolith" />
    <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" alt="Next.js 16.3" />
    <img src="https://img.shields.io/badge/React-19.2-149eca?logo=react&logoColor=white" alt="React 19.2" />
    <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node.js 22" />
    <img src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" alt="TypeScript 6" />
    <img src="https://img.shields.io/badge/MongoDB-Mongoose-47a248?logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Redis-BullMQ-dc382d?logo=redis&logoColor=white" alt="Redis and BullMQ" />
    <img src="https://img.shields.io/badge/Docker-AWS%20ECS-2496ed?logo=docker&logoColor=white" alt="Docker and AWS ECS" />
  </p>
</div>

[!IMPORTANT]
Current status: pre-production MVP under active hardening. The repository contains a substantial end-to-end implementation and production-oriented infrastructure, but the current snapshot must not be represented as production-ready. Critical work remains around usage-accounting recovery, stream terminal handling, chat persistence, refresh-token concurrency, proxy-aware rate limiting, and deployment rollback safety.

Table of Contents

Overview

Why ProxiAI Exists

Recruiter Snapshot

Current Capabilities

System Architecture

Request Lifecycle

Technology Stack

Repository Structure

Core Backend Modules

Data Model

API Surface

Authentication Model

Security Design

Local Development

Environment Variables

Available Scripts

Testing and CI/CD

Ports, Routing, and Health Checks

AWS Deployment Architecture

Current Limitations

Roadmap

Documentation

Engineering Decisions Worth Reviewing

Contributing

Project Status Summary

Overview

ProxiAI is a multi-tenant AI governance platform designed to provide one controlled entry point for workplace AI usage.

Instead of allowing employees to send sensitive or ungoverned prompts directly to external providers, ProxiAI places a policy and observability layer in the middle:

Employee -> ProxiAI -> Approved LLM Provider

For each request, the platform can:

authenticate the user and resolve the organisation;

verify conversation ownership and permissions;

apply idempotency, rate-limit, and budget controls;

detect sensitive information such as credentials, connection strings, payment-card candidates, government identifiers, email addresses, and phone numbers;

calculate an explainable risk score;

return an ALLOW, ALLOW_WITH_MASK, or BLOCK policy decision;

route the approved prompt through a provider adapter;

stream the response to the browser through Server-Sent Events;

record safe request and usage metadata;

process billing, analytics, anomaly, health, and recovery work asynchronously.

The project demonstrates full-stack product development across frontend UX, API design, streaming, authentication, multi-tenant data modelling, queues, resilience patterns, containerisation, CI/CD, and AWS infrastructure.

Why ProxiAI Exists

Organisations adopting AI tools commonly face the following problems:

Problem

ProxiAI's approach

Employees use different AI providers with no shared control layer

One same-origin gateway for approved AI access

Sensitive information may be pasted into external services

Deterministic PII/secret detection, risk scoring, masking, and blocking

AI policy is inconsistent across teams

Organisation-scoped policy thresholds and permission checks

A provider outage can interrupt user workflows

Provider abstraction, retry policy, health state, circuit breaker, and fallback framework

Usage and cost are difficult to track

Request logs, token accounting, billing rollups, and monthly budget controls

Security teams lack reliable operational context

Request IDs, structured logs, policy events, safe metadata, and background analytics

Direct provider integrations create vendor coupling

A shared provider adapter contract isolates provider-specific code

Product principle

Security and policy checks must complete before an approved prompt reaches an external AI provider.

Recruiter Snapshot

Area

What this project demonstrates

Product thinking

A clearly defined enterprise problem, user roles, policy decisions, scope boundaries, and documented trade-offs

Frontend engineering

Next.js App Router, protected routes, responsive chat workspace, SSE rendering, Markdown responses, loading/error states, and policy inspection UI

Backend engineering

Express 5, TypeScript, feature-based modules, Zod validation, standard response envelopes, and graceful startup/shutdown

Security engineering

Tenant isolation, permission middleware, Argon2id passwords, JWT access tokens, rotating refresh tokens, PII controls, Helmet, CORS, and secret scanning

Distributed-system concepts

Idempotency, request correlation, rate limiting, circuit breakers, retry/backoff, background queues, durable recovery records, and health state

Data engineering

MongoDB domain models, indexes, append-oriented request records, billing rollups, analytics aggregates, and cursor pagination

DevOps

Multi-stage non-root containers, Docker Compose, Nginx path routing, GitHub Actions, Trivy, ECR, ECS/Fargate, ALB, CloudFormation, and rollback scripts

Engineering maturity

Extensive design documentation, automated tests, explicit known limitations, and a production-readiness hardening plan

Current Capabilities

Implemented in the current repository

Responsive marketing site and authenticated AI workspace.

Email/password login with organisation slug.

Protected workspace routes and authenticated user bootstrap.

Short-lived JWT access tokens held in frontend memory.

Opaque rotating refresh tokens stored in an HttpOnly cookie.

Organisation, user, role, permission, team, conversation, and message domain models.

Conversation creation, listing, retrieval, and title updates.

Authenticated chat streaming through POST /api/v1/chat/stream.

SSE events for request start, policy, routing, incremental tokens, completion, and safe terminal errors. A fallback event contract exists, but the current controller does not yet emit it.

Regex-based sensitive-data detection and overlap resolution.

PII classification and explainable risk scoring.

Policy outcomes: ALLOW, ALLOW_WITH_MASK, and BLOCK.

Tenant/user-scoped Redis idempotency reservations.

User- and organisation-level chat rate limits by plan.

Authoritative monthly token-budget checks.

Provider capability registry and adapter interface.

Groq as the currently enabled production provider.

Provider timeout, retry, circuit-breaker, fallback, and health-check foundations.

Structured request/usage records in MongoDB.

BullMQ workers for billing, analytics, anomaly detection, provider health, and failed-enqueue recovery.

Request correlation through generated request IDs.

Structured Pino logging and production-safe error envelopes.

API and frontend liveness/readiness endpoints.

Local same-origin routing through Nginx and Docker Compose.

Multi-stage non-root Docker images.

CI checks for secrets, dependencies, lint, types, tests, builds, and container builds.

AWS ECS/Fargate, ECR, ALB, Secrets Manager, CloudFormation, staging, smoke-test, and rollback scaffolding.

Designed but incomplete or deferred

End-to-end persistence of user and assistant chat messages.

Reliable reconciliation of provider outcomes with missing token usage.

Concurrency-safe refresh-token rotation across multiple browser tabs.

Complete administration dashboard and management APIs.

Multiple enabled production LLM providers.

Secure response-content caching.

Advanced policy authoring and approval workflows.

SSO/SAML, MFA, BYOK, multi-region deployment, and distributed circuit-breaker state.

System Architecture

ProxiAI uses a modular monolith for the API, plus a separate asynchronous worker process built from the same backend image.

flowchart LR
    U[Employee or Admin Browser]
    G[ALB or Local Nginx Gateway]
    F[Next.js Frontend\nPort 3000]
    A[Express API\nPort 8080]
    M[(MongoDB)]
    R[(Redis)]
    Q[BullMQ Queues]
    W[Background Worker]
    P[Groq LLM API]

    U -->|HTTPS or local HTTP| G
    G -->|/ and frontend routes| F
    G -->|/api/* and /health/*\npath preserved| A
    F -->|same-origin /api/v1/*| G

    A -->|users, organisations, conversations,\nrequest logs, billing metadata| M
    A -->|idempotency, rate limits,\nprovider health, queue state| R
    A -->|approved prompt stream| P
    A -->|enqueue jobs| Q
    Q --> W
    W --> R
    W --> M

Deployment request path

Browser
  -> HTTPS Application Load Balancer
      -> /api/* and /health/* -> API target group -> ECS API task :8080
      -> all other paths      -> Frontend target group -> ECS frontend task :3000

Local request path

Browser
  -> localhost:3001
      -> Nginx :80
          -> /api/* and /health/* -> api:8080
          -> all other paths      -> frontend:3000

The /api prefix is intentionally preserved. A proxy or load balancer must not strip /api from requests.

Request Lifecycle

A normal chat request follows this execution path:

flowchart TD
    A[Authenticated chat request] --> B[Resolve user and organisation]
    B --> C[Check permission and conversation ownership]
    C --> D[Reserve idempotency key]
    D --> E[Consume user and organisation rate limits]
    E --> F[Read authoritative monthly budget]
    F --> G[Detect and classify sensitive spans]
    G --> H[Calculate risk score]
    H --> I{Policy decision}
    I -->|BLOCK| J[Do not call provider\nrecord safe blocked outcome]
    I -->|ALLOW_WITH_MASK| K[Route masked prompt]
    I -->|ALLOW| L[Route original approved prompt]
    K --> M[Provider health, retry, circuit breaker, fallback]
    L --> M
    M --> N[Stream SSE events to browser]
    N --> O[Record request outcome and usage metadata]
    O --> P[Enqueue billing and analytics jobs]
    P --> Q[Worker updates rollups, anomaly state, and recovery records]

SSE event contract

The browser can receive these event types:

Event

Purpose

Current status

request_started

Confirms the server accepted the request and exposes the request ID

Emitted

policy

Reports allow/mask/block action, risk score, categories, and masking state

Emitted

routing

Reports the selected provider, model, and routing reason

Emitted

fallback

Represents a provider fallback decision

Defined in the contract/UI, but not currently emitted by the backend controller

token

Streams incremental assistant text

Emitted

done

Reports terminal model, usage, latency, cache, and masking metadata

Emitted on the normal completion path

error

Reports a safe terminal error code, message, request ID, and retryability

Emitted on handled stream failures

Technology Stack

Layer

Technology

Role in ProxiAI

Frontend

Next.js 16.3.1

App Router, server/client rendering, standalone production build

UI runtime

React 19.2.8

Auth state, chat state, streaming updates, responsive workspace

Styling

Tailwind CSS 4.3.3

Design tokens and utility-based responsive styling

Language

TypeScript 6.0.3

Shared type safety across frontend and backend

Frontend validation

Zod 4.4.3

API response and SSE event validation

Markdown

React Markdown + GFM

Safe rendering of assistant responses

API runtime

Node.js 22.x

Production API and worker runtime

Backend framework

Express 5.2.1

HTTP API, middleware, routing, and SSE transport

Request validation

Zod 4.4.3

Environment, body, route, query, and job-payload validation

Authentication

jose + argon2

JWT access tokens, opaque refresh tokens, Argon2id passwords

Database

MongoDB + Mongoose 9.8.0

Tenant data, conversations, request records, billing, analytics, alerts

Cache/control plane

Redis + ioredis 5.11.1

Idempotency, rate limits, provider health, and BullMQ state

Background jobs

BullMQ 6.1.2

Billing, analytics, anomaly, health, and recovery processing

AI provider

Groq SDK 1.5.0

Current production streaming provider adapter

Logging

Pino 10.3.1

Structured application and request logs

Frontend tests

Vitest + Testing Library

UI, schema, API error, and SSE parser tests

Backend tests

Node test runner

Unit, integration, worker, auth, provider, policy, and data-model tests

Local infrastructure

Docker Compose + Nginx

Same-origin local gateway, API, frontend, worker, and Redis

Production infrastructure

AWS ECS/Fargate, ALB, ECR, CloudFormation

Container deployment and path-based traffic routing

CI/CD security

Gitleaks, npm audit, Trivy

Secret, dependency, and container-image checks

Repository Structure

.
├── frontend/
│   ├── src/
│   │   ├── app/                         # Next.js App Router pages and layouts
│   │   │   ├── (auth)/login/            # Login route
│   │   │   ├── (workspace)/chat/        # Protected chat routes
│   │   │   ├── healthz/                 # Frontend health endpoint
│   │   │   ├── layout.tsx               # Root layout and AuthProvider
│   │   │   └── page.tsx                 # Marketing landing page
│   │   ├── components/
│   │   │   ├── layout/                   # Shared layout and branding
│   │   │   └── ui/                       # Reusable UI primitives
│   │   ├── features/
│   │   │   ├── auth/                     # Auth provider, API, guards, login UI
│   │   │   ├── chat/                     # Chat workspace, SSE integration, Markdown
│   │   │   ├── conversations/            # Sidebar, title editor, conversation API
│   │   │   ├── marketing/                # Public landing-page sections
│   │   │   └── policy/                   # Live policy inspector
│   │   └── lib/
│   │       ├── api/                      # Same-origin API client and envelopes
│   │       ├── errors/                   # Normalised frontend API errors
│   │       └── streaming/                # SSE parser
│   ├── public/                           # Brand assets
│   ├── Dockerfile
│   ├── next.config.ts
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── app.ts                        # Express middleware and route mounting
│   │   ├── server.ts                     # API startup and graceful shutdown
│   │   ├── worker.ts                     # Worker startup and graceful shutdown
│   │   ├── config/                       # Environment, CORS, and service metadata
│   │   ├── features/
│   │   │   ├── auth/                     # Login, JWT, refresh rotation, RBAC
│   │   │   ├── chat/                     # Policy-to-provider streaming pipeline
│   │   │   ├── conversations/            # Conversation commands and queries
│   │   │   ├── messages/                 # Message model and history queries
│   │   │   ├── pii/                      # Detection, classification, masking, scoring
│   │   │   ├── policy/                   # Allow/mask/block evaluation and events
│   │   │   ├── providers/                # Adapters, health, retry, circuit breaker
│   │   │   ├── billing/                  # Request logs and token rollups
│   │   │   ├── analytics/                # Daily aggregates and worker
│   │   │   ├── anomaly/                  # Usage anomaly processing
│   │   │   ├── alerts/                   # Alert data model
│   │   │   ├── recovery/                 # Durable failed-enqueue recovery
│   │   │   ├── organisations/            # Tenant model and policy configuration
│   │   │   ├── users/                    # User roles and permissions
│   │   │   ├── teams/                    # Team model
│   │   │   └── health/                   # Liveness and readiness
│   │   ├── shared/
│   │   │   ├── async/                    # BullMQ runtime and job contracts
│   │   │   ├── errors/                   # Application error type
│   │   │   ├── idempotency/              # Redis-backed request coordination
│   │   │   ├── lib/                      # MongoDB, Redis, and logging clients
│   │   │   ├── middleware/               # Request ID, 404, and error middleware
│   │   │   ├── responses/                # Standard API envelopes
│   │   │   ├── runtime/                  # Infrastructure shutdown coordination
│   │   │   └── security/                 # Password validation and hashing
│   │   └── scripts/
│   │       ├── deploy-indexes.ts          # Explicit production index deployment
│   │       └── seed-dev-admin.ts          # Development-only admin provisioning
│   ├── tests/                             # Backend unit and integration tests
│   ├── Dockerfile
│   └── package.json
│
├── deploy/
│   ├── local/nginx.conf                   # Local path-based reverse proxy
│   ├── aws/                               # CloudFormation and AWS runbooks
│   └── scripts/                           # Deploy, smoke, index, and rollback scripts
│
├── docs/                                  # Product, architecture, API, security, QA docs
├── .github/workflows/                     # CI, deploy, and rollback workflows
├── docker-compose.yml                     # Local multi-container topology
├── AGENTS.md                              # Repository coding-agent instructions
└── PROJECT_MEMORY.md                      # Detailed project decision history

Core Backend Modules

Module

Responsibility

auth

Login, account lock state, access tokens, refresh-token rotation, logout, current-user profile, RBAC

chat

End-to-end request orchestration from ownership checks to provider stream and async jobs

pii

Sensitive-span detection, classification, masking, immutable prompt processing, and risk scoring

policy

Deterministic budget/risk decisions: allow, mask, or block

providers

Adapter contract, Groq integration, capabilities, retry policy, fallback, circuit breaker, and health state

conversations

Tenant- and owner-scoped create/list/get/title-update operations

messages

Message schema and cursor-based history queries

billing

Append-oriented request usage records, budget reads, monthly rollups, and worker ledger

analytics

Daily organisation/user/provider aggregates and idempotent worker processing

anomaly

Usage-change analysis and alert-oriented anomaly processing

recovery

Durable records and scheduled recovery for failed BullMQ enqueue operations

shared

Infrastructure clients, response contracts, middleware, logging, idempotency, and job contracts

Data Model

The application uses tenant-scoped MongoDB documents. Business data is associated with an orgId, and user-owned resources also include a userId or ownership relationship.

Model

Purpose

Organisation

Tenant status, plan, token budget, retention mode, policy thresholds, and feature flags

User

Identity, role, permissions, team, login state, password hash, and account status

Team

Organisation-scoped user grouping

RefreshToken

Hashed opaque refresh token, family, expiry, replacement, reuse, and revocation metadata

Conversation

User-owned conversation metadata, title, message count, and activity timestamps

Message

User/assistant message metadata and retention-oriented content fields

RequestLog

Safe request outcome, policy action, provider/model, token usage, and status

BillingRollup

Monthly organisation token totals and accounting state

BillingJobLedger

Idempotency ledger for billing worker jobs

AnalyticsDaily

Daily aggregates by organisation, user, provider, and outcome

AnalyticsJobLedger

Idempotency ledger for analytics processing

Alert

Organisation-scoped operational or anomaly alert records

EnqueueRecovery

Durable retry state when an asynchronous job cannot be queued

Production index creation is performed explicitly through:

cd backend
npm run build
npm run deploy:indexes

API Surface

Standard response envelopes

Successful non-streaming responses:

{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "request-correlation-id",
    "nextCursor": null
  }
}

Errors:

{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe client-facing message",
    "requestId": "request-correlation-id"
  }
}

Implemented routes

Method

Route

Authentication

Purpose

POST

/api/v1/auth/login

Public

Authenticate with organisation slug, email, and password

POST

/api/v1/auth/refresh

Refresh cookie

Rotate refresh token and return a new access token

POST

/api/v1/auth/logout

Refresh cookie when present

Revoke the session and clear the refresh cookie

GET

/api/v1/auth/me

Bearer access token

Return the current user and organisation context

POST

/api/v1/conversations

chat:send

Create a user-owned conversation

GET

/api/v1/conversations

chat:view_own

List conversations with cursor pagination

GET

/api/v1/conversations/:conversationId

chat:view_own

Read one owned conversation

PATCH

/api/v1/conversations/:conversationId

chat:send

Update a conversation title

GET

/api/v1/conversations/:conversationId/messages

chat:view_own

Read message history with cursor pagination

POST

/api/v1/chat/stream

chat:send

Submit a prompt and receive an SSE response stream

GET

/health/live

Public

API process liveness

GET

/health/ready

Public

MongoDB and Redis readiness

GET

/healthz

Public

Frontend process health

Example chat request

POST /api/v1/chat/stream
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "conversationId": "8be250b0-2732-4a9a-8dcb-4c6bcd868821",
  "clientRequestId": "2562fd7d-c327-4de4-b42f-62e093e368cd",
  "prompt": "Summarise this policy document.",
  "routingMode": "auto"
}

For manual routing, the current API accepts:

{
  "routingMode": "manual",
  "providerId": "groq"
}

Authentication Model

Login
  -> verify organisation and active user
  -> verify Argon2id password hash
  -> issue short-lived JWT access token
  -> issue opaque refresh token in HttpOnly cookie

Authenticated request
  -> frontend sends Authorization: Bearer <access-token>
  -> API verifies JWT signature and expiry
  -> API reloads current user and organisation
  -> permission middleware checks the required action

Refresh
  -> browser sends HttpOnly refresh cookie
  -> API validates hashed token record
  -> token is rotated and replaced
  -> new access token is returned

Logout
  -> refresh token is revoked when resolvable
  -> refresh cookie is cleared

Roles represented in the current model

EMPLOYEE

TEAM_LEAD

ORG_ADMIN

Permission examples

chat:send

chat:view_own

team:view_logs

admin:view_logs

admin:view_billing

admin:manage_users

admin:configure_policy

admin:export_audit

The data model includes administrator permissions, while the full admin management interface remains a later milestone.

Security Design

Security controls represented in the codebase include:

organisation-scoped data access and owner-scoped conversation queries;

permission middleware on protected routes;

Argon2id password hashing;

short-lived signed JWT access tokens;

opaque refresh tokens stored as hashes;

HttpOnly refresh cookies;

refresh-token family and reuse metadata;

deterministic PII and secret detection;

prompt masking before provider execution;

blocked prompts stopped before provider selection;

validated environment configuration with startup failure on invalid values;

Zod validation for request, query, cursor, environment, SSE, and job contracts;

Helmet security headers;

explicit CORS origin and credential configuration;

1mb JSON body limit;

standard error envelopes without production stack traces;

request correlation IDs;

structured logging designed to avoid raw secrets and prompt content;

non-root distroless runtime containers;

Gitleaks secret scanning;

production dependency audits;

Trivy image scanning before deployment.

[!CAUTION]
Security architecture does not automatically equal production safety. The current pre-production issues listed in Current Limitations must be resolved and regression-tested before a real production launch.

Local Development

Prerequisites

Node.js 22.x

npm

Git

Docker with Docker Compose

A MongoDB database reachable from the API and development scripts

A Groq API key

MongoDB is intentionally not included as a service in the repository's Compose file. Use MongoDB Atlas, an existing development instance, or a host MongoDB address reachable from containers.

1. Clone the repository

git clone <your-repository-url>
cd ProxyAi-main

2. Create the backend environment file

cp backend/.env.example backend/.env

Generate two different Base64URL secrets:

node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"

Place one value in JWT_ACCESS_SECRET and the other in AUTH_RATE_LIMIT_SECRET.

3. Start the Docker Compose stack

For a MongoDB instance running on the Docker Desktop host:

COMPOSE_MONGO_URI="mongodb://host.docker.internal:27017/proxiai_compose" docker compose up --build

For MongoDB Atlas:

COMPOSE_MONGO_URI="<your-container-reachable-mongodb-uri>" docker compose up --build

PowerShell equivalent:

$env:COMPOSE_MONGO_URI="<your-container-reachable-mongodb-uri>"
docker compose up --build

The application is then available at:

http://localhost:3001

To use another host port:

PROXIAI_HTTP_PORT=4000 COMPOSE_MONGO_URI="<mongodb-uri>" docker compose up --build

4. Provision the development administrator

The project does not expose public self-service signup. Provision a development-only administrator with the repository script:

cd backend
npm ci
npm run dev:seed-admin

The seed command runs on the host and reads backend/.env. Ensure that MONGO_URI in that file points to the same development database used by the application and is reachable from your host machine.

The script:

refuses to run unless NODE_ENV=development;

reads DEV_ADMIN_PASSWORD from backend/.env;

creates or reconciles a demo organisation and organisation administrator;

prints the local organisation slug, email, and configured development password to the terminal.

5. Verify health

curl http://localhost:3001/healthz
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready

Manual development without the full Compose stack

Start Redis:

docker compose up redis

Start the backend API:

cd backend
npm ci
npm run dev

Build and start the worker in another terminal:

cd backend
npm run build
npm run start:worker

Start the frontend in another terminal:

cd frontend
npm ci
npm run dev

During next dev, requests to /api/* are proxied to BACKEND_INTERNAL_ORIGIN, which defaults to http://localhost:8080.

Environment Variables

Backend runtime

Variable

Required

Purpose

NODE_ENV

Yes

development, test, or production

PORT

Yes/default

API port; defaults to 8080

FRONTEND_ORIGIN

Yes

Exact allowed browser origin; must contain no path

MONGO_URI

Yes

MongoDB connection URI

REDIS_URL

Yes

Redis connection URL

JWT_ACCESS_SECRET

Yes

Base64URL secret decoding to at least 32 bytes

AUTH_RATE_LIMIT_SECRET

Yes

A different Base64URL secret for keyed rate-limit hashing

ACCESS_TOKEN_TTL_MINUTES

Yes

Access-token lifetime from 1 to 60 minutes

REFRESH_TOKEN_TTL_DAYS

Yes

Refresh-token lifetime from 1 to 30 days

DEV_ADMIN_PASSWORD

Development seed

Password used only by dev:seed-admin

GROQ_API_KEY

Yes

Groq provider credential

GROQ_MODEL

Yes

Enabled Groq model identifier

PROVIDER_REQUEST_TIMEOUT_MS

Yes

Provider timeout from 1,000 to 120,000 ms

LOG_LEVEL

Optional

fatal, error, warn, info, debug, or trace

COMMIT_SHA

Optional

Release metadata included in service identity and logs

Rate limits

Variable

Scope

CHAT_RATE_LIMIT_FREE_USER_RPM

Per free-plan user

CHAT_RATE_LIMIT_FREE_ORG_RPM

Per free-plan organisation

CHAT_RATE_LIMIT_PRO_USER_RPM

Per pro-plan user

CHAT_RATE_LIMIT_PRO_ORG_RPM

Per pro-plan organisation

CHAT_RATE_LIMIT_ENTERPRISE_USER_RPM

Per enterprise user

CHAT_RATE_LIMIT_ENTERPRISE_ORG_RPM

Per enterprise organisation

Idempotency

Variable

Required value in the current implementation

IDEMPOTENCY_PROCESSING_TTL_SECONDS

300

IDEMPOTENCY_COMPLETED_TTL_SECONDS

3600

Frontend development

Variable

Required

Purpose

BACKEND_INTERNAL_ORIGIN

Optional

Server-side Next.js development proxy target; defaults to http://localhost:8080

Docker Compose

Variable

Required

Purpose

COMPOSE_MONGO_URI

Yes

MongoDB URI reachable from the API and worker containers

PROXIAI_HTTP_PORT

Optional

Host gateway port; defaults to 3001

Never commit populated .env files or real provider/database credentials.

Available Scripts

Frontend

Run from frontend/:

Script

Command

Purpose

Development

npm run dev

Start Next.js development server

Production build

npm run build

Create standalone Next.js build

Production start

npm run start

Start built frontend

Lint

npm run lint

Run ESLint

Type check

npm run typecheck

Run TypeScript without emitting files

Tests

npm test

Run Vitest suite

Backend

Run from backend/:

Script

Command

Purpose

API development

npm run dev

Start API through Nodemon

Seed development admin

npm run dev:seed-admin

Provision local demo organisation/admin

Production build

npm run build

Compile TypeScript into dist/

API start

npm start

Run dist/server.js

Worker start

npm run start:worker

Run dist/worker.js

Deploy indexes

npm run deploy:indexes

Initialise production MongoDB indexes

Lint

npm run lint

Lint backend source

Type check

npm run typecheck

Run TypeScript without emitting files

Tests

npm test

Build and run Node test suite

Testing and CI/CD

The repository contains frontend unit/component tests and a broad backend suite covering areas such as:

authentication configuration and primitives;

login and refresh-token integration;

user, organisation, team, conversation, message, and refresh-token models;

MongoDB and Redis clients;

API foundation and health routes;

PII detection, classification, masking, and risk scoring;

policy allow, mask, and block decisions;

provider capability, retry, fallback, circuit breaker, health, and Groq adapter behaviour;

SSE chat streaming and chat-to-billing job production;

idempotency;

billing, analytics, anomaly, and recovery workers;

structured logging and worker heartbeats.

Run the frontend quality gate

cd frontend
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build

Run the backend quality gate

MongoDB and Redis must be available for integration tests.

cd backend
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build

GitHub Actions pipeline

The configured CI workflow performs:

Gitleaks secret scan;

frontend dependency audit, lint, type check, tests, and build;

backend dependency audit, lint, type check, tests, and build against MongoDB and Redis service containers;

frontend and backend Docker image builds.

After a successful main CI run, the deployment workflow is designed to:

build immutable commit-SHA images;

scan both images with Trivy;

push image digests to ECR;

deploy the same tested digests to staging;

run authenticated smoke checks and worker-accounting verification;

promote the same digests to production after environment approval.

The workflow is production-oriented, but its remaining release-safety issues are listed below.

Ports, Routing, and Health Checks

Service

Development/host access

Container port

Public route

Local gateway

localhost:3001 by default

80

All local traffic

Frontend

Direct localhost:3000 in manual dev

3000

/, /login, /chat, /chat/:id, assets

API

Direct localhost:8080 in manual dev

8080

/api/v1/*, /health/*

Worker

No HTTP interface

None

Internal process only

Redis

localhost:6379 only when separately published/manual

6379

Internal only in Compose

MongoDB

External to Compose

Provider-specific

Internal/private connection

Correct health checks

Component

Method and path

Healthy response

Frontend

GET /healthz

HTTP 200 with status: "ok"

API liveness

GET /health/live

HTTP 200 while the process is alive

API readiness

GET /health/ready

HTTP 200 only when MongoDB and Redis are ready; otherwise 503

For an AWS API target group, use:

Path: /health/ready
Port: traffic port 8080
Expected code: 200

For the frontend target group, use:

Path: /healthz
Port: traffic port 3000
Expected code: 200

AWS Deployment Architecture

The repository includes an AWS deployment path based on:

ECR repositories for frontend and backend images;

ECS/Fargate services for frontend, API, and worker;

an Application Load Balancer;

path-based listener rules;

private task subnets;

Secrets Manager runtime injection;

CloudWatch log groups;

CloudFormation templates;

immutable image digests;

staging-before-production promotion;

smoke-test and rollback scripts.

Intended production topology

Internet
  -> Route 53 / approved domain
  -> HTTPS ALB
      -> Frontend ECS service :3000
      -> API ECS service :8080
  -> Worker ECS service in private subnets

API and Worker
  -> MongoDB Atlas or approved managed MongoDB
  -> Approved managed Redis with persistence and no-eviction policy
  -> Groq API

Infrastructure files

File

Purpose

deploy/aws/registry.yml

ECR repository bootstrap

deploy/aws/foundation.yml

ALB/listener/routing foundation and existing-resource adoption

deploy/aws/services.yml

ECS task definitions and services

deploy/aws/proxiai-deployment-policy.json

Deployment-role policy baseline

deploy/aws/MANUAL_ACTIONS.md

Required operator actions and checks

deploy/scripts/deploy-services.sh

Register and deploy task definitions

deploy/scripts/smoke.sh

Authenticated frontend/API/chat smoke checks

deploy/scripts/verify-worker-events.sh

Verify asynchronous processing after smoke traffic

deploy/scripts/rollback-services.sh

Restore previous task-definition revisions

[!WARNING]
The infrastructure is a deployment blueprint, not proof of a safe current release. IAM/ECR alignment, application-level rollback after smoke failure, listener inputs, worker health, proxy trust, and live target-group/security-group settings must be corrected or verified before production deployment.

Current Limitations

The repository intentionally documents its maturity instead of presenting an unfinished system as production-ready.

Release blockers in the current snapshot

Unknown token usage can block future organisation chat requests. Interrupted or failed provider streams can produce usage records that the authoritative budget check cannot reconcile.

Provider early-stop metadata is not fully handled. A partial Groq stream can be interpreted as a normal completion under specific provider behaviour.

Chat messages are not persisted by the main chat pipeline. The browser currently keeps active messages in React state, while the message model/history API is not connected to production writes.

Idempotency completion can outlive failed usage persistence. A request reservation may be marked completed even when durable accounting fails.

Concurrent refresh requests are not safely coordinated. Legitimate requests from multiple tabs can trigger reuse handling and invalidate a valid session.

Temporary refresh failures can become logouts. Some operational refresh errors clear the cookie and collapse frontend state to anonymous.

Production login rate limiting is not proxy-aware. Express trusted-proxy configuration must be designed and tested for ALB/Nginx deployment.

Deployment IAM and ECR naming are not fully aligned. The provided deployment policy needs correction or verified compensating permissions.

A failed post-deployment smoke test does not automatically roll back the new application revision.

Important scope limitations

Groq is the only enabled production provider in this snapshot.

The provider abstraction and fallback framework exist, but there is no real second production provider to fail over to.

The full administrator dashboard and management APIs are not implemented.

Self-service signup is not implemented; development users are provisioned through a script.

Secure content caching is deferred.

Advanced enterprise identity and compliance features are deferred.

The repository does not currently include a root LICENSE file.

Roadmap

Production-hardening priority

Redesign unknown-usage accounting with explicit reconciliation states or conservative reservations.

Handle Groq terminal error metadata and partial-stream semantics correctly.

Make usage persistence and idempotency completion atomic or safely recoverable.

Persist user and assistant messages according to retention policy.

Update conversation message counts and activity timestamps.

Make refresh-token rotation safe under legitimate concurrent requests.

Preserve sessions during temporary refresh infrastructure failures.

Configure and test trusted proxy handling and client-IP rate limiting.

Align ECR names, IAM permissions, CloudFormation actions, and runtime secrets.

Add automatic application rollback when functional smoke tests fail.

Add meaningful worker health signals, alarms, and production capacity settings.

Complete independent build, test, dependency, and Docker verification in a fully connected CI/runtime environment.

Product expansion

Build organisation-admin dashboards for usage, billing, alerts, users, and policy configuration.

Enable additional real provider adapters behind the common contract.

Add safe response replay/content caching after storage controls are approved.

Add richer audit export and operational observability.

Add SSO/SAML and MFA after the core auth lifecycle is hardened.

Add configurable retention, key management, and compliance-oriented controls.

Documentation

The repository includes a docs-first engineering package:

Document

Purpose

docs/01_PRD.md

Product requirements, users, journeys, scope, and acceptance criteria

docs/02_SDD.md

System design and service responsibilities

docs/03_TDD.md

Technical design and implementation details

docs/04_DATABASE_DESIGN.md

Collections, indexes, ownership, retention, and query design

docs/05_OPENAPI_SPEC.md

API contract reference

docs/06_SECURITY_THREAT_MODEL.md

Assets, trust boundaries, threats, and mitigations

docs/07_DEPLOYMENT_ARCHITECTURE.md

Local and AWS deployment topology

docs/08_TESTING_STRATEGY.md

Test pyramid, release gates, and security scenarios

docs/09_README.md

Detailed original engineering README and operating notes

docs/10_ADR.md

Architecture decision records

docs/12_SEQUENCE_DIAGRAMS.md

Request, auth, provider, and worker sequence diagrams

docs/13_CICD_DOCUMENTATION.md

CI/CD workflow and release process

docs/14_OBSERVABILITY_DOCUMENTATION.md

Logging, metrics, alerts, and operational signals

docs/15_PHASE.md

Delivery phases and implementation history

When documentation and executable source disagree, the executable source is the primary source of truth.

Engineering Decisions Worth Reviewing

Why a modular monolith?

The product has several domains—auth, chat, PII, policy, providers, billing, and analytics—but does not yet require independent microservices. A feature-based modular monolith keeps the code understandable, testable, and deployable by a small team while preserving clear boundaries.

Why a separate worker?

User-facing streaming should not wait for billing aggregation, analytics, anomaly detection, or recovery work. The API writes the authoritative outcome and enqueues asynchronous jobs; a separate worker processes them independently.

Why same-origin routing?

The browser calls relative /api/v1/* paths. Nginx locally and the ALB in AWS split traffic by path, reducing browser configuration, simplifying cookie behaviour, and avoiding unnecessary cross-origin complexity.

Why deterministic PII detection first?

Regex and validation-based detectors are explainable, fast, testable, and realistic for an MVP. More advanced NER or ML detection can be added later without weakening the initial policy boundary.

Why fail closed?

Budget and policy controls protect organisational data and spend. When an authoritative decision cannot be made safely, the system prefers rejecting provider execution over silently bypassing controls. The current hardening work focuses on preventing this safety choice from becoming an avoidable availability deadlock.

Contributing

Create a focused feature or fix branch.

Keep changes inside the relevant feature boundary.

Add or update tests for changed behaviour.

Run lint, type checks, tests, and builds for the affected workspace.

Never commit credentials, populated .env files, raw prompts, tokens, or PII.

Document API, environment, data-model, or deployment changes.

Keep pull requests small enough to review safely.

Suggested commit style:

feat(chat): persist streamed assistant messages
fix(auth): coordinate concurrent refresh rotation
fix(deploy): rollback when authenticated smoke fails
refactor(policy): isolate budget decision inputs
test(provider): cover early stream termination

Project Status Summary

Area

Status

Product definition

Mature and extensively documented

Frontend experience

Implemented for landing, login, conversations, chat, and policy inspection

Core API

Implemented with production-oriented structure

PII and policy engine

Implemented and tested at module level

Provider streaming

Implemented for Groq; terminal-edge hardening required

Authentication

Implemented; concurrency and outage behaviour require fixes

Persistence

Domain models and query APIs implemented; chat write path incomplete

Async processing

Implemented for billing, analytics, anomaly, provider health, and recovery

Local containers

Implemented

CI/CD

Implemented as workflow configuration

AWS deployment

Designed and scripted; production blockers remain

Production readiness

No-go until critical fixes and runtime verification are complete

<div align="center">
  <strong>ProxiAI demonstrates how enterprise AI access can be secured, governed, and observed through one carefully designed gateway.</strong>
</div>