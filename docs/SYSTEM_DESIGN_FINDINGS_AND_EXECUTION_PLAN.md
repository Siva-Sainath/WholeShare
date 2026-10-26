# Wholeshare System Design Findings & Execution Plan

This document explains the production system design findings for Wholeshare. It clarifies the dispute boundary, database requirements, reverse proxy networking, rate limiting posture, and core agentic architecture principles.

---

## 1. Scope Boundary: Stages 1 and 2 vs Stage 3 Dispute Resolution

Dispute resolution is part of Stage 3 in Wholeshare. Our current implementation scope focuses strictly on Stage 1 and Stage 2. A teammate will build Stage 3 dispute resolution on top of our foundation.

Wholeshare is partitioned into three distinct operational stages:

1. Stage 1: Demand Aggregation and Negotiation. Autonomous buyer agents discover wholesale catalogs, pool purchasing mandates, negotiate volume discount tiers, and issue ACP Shared Payment Tokens.
2. Stage 2: Escrow and Capital Coordination. Wholeshare executes PayPal Orders v2 soft authorization holds with intent AUTHORIZE. The engine validates human-in-the-loop step-up QR invoices for orders above $1,000, tracks carrier shipments, and executes atomic batch captures once delivery conditions are satisfied.
3. Stage 3: Dispute Mediation and Settlement. A teammate will build this stage on top of Stages 1 and 2. It will integrate PayPal Resolution Center webhooks, evidence packaging, and post-capture settlement arbitration.

Our role in Stages 1 and 2 is to lay the architectural groundwork for Stage 3:

1. Database Schema: Maintain `dispute_records` in PostgreSQL to store PayPal dispute IDs, order references, dispute reasons, and resolution states.
2. Escrow Hooks: Support the `FROZEN_DISPUTED` state in the coalition finite state machine. When a dispute occurs, batch capture pauses immediately to protect buyer capital.
3. Webhook Ingress: Provide clean webhook receiver routes in `src/web/server.js` (`POST /api/v1/paypal/webhook`) that forward dispute payloads to the database.

Our active implementation focuses on Stage 1 and Stage 2.

---

## 2. Database Architecture: Pure PostgreSQL vs Prisma and SQLite

### Elimination of Prisma
Prisma is removed from Wholeshare completely:

1. Commercial licensing: Prisma includes commercial tiers, proprietary enterprise components, and monetized cloud features such as Prisma Optimize and Prisma Pulse.
2. Binary engine overhead: Prisma bundles a separate Rust binary engine. The engine increases process memory, adds latency to simple queries, and complicates container deployment.
3. Abstraction leakage: Prisma obscures lower level PostgreSQL features. In multiparty escrow, the application requires explicit `SELECT ... FOR UPDATE` row locks, advisory locks, and transactional savepoints. Native database drivers handle these primitives directly.

### Elimination of SQLite
SQLite is not suitable for concurrent agent coordination:

1. File-level write locks: SQLite locks the entire database file during writes. Multiple autonomous buyer agents attempting to pledge units simultaneously trigger `SQLITE_BUSY` errors.
2. Production parity: SQLite lacks PostgreSQL JSONB indexing, granular connection pooling, and connection health checks.

### Target Architecture: Pure PostgreSQL
Wholeshare uses pure PostgreSQL via the native `pg` package:

1. Connection pooling: The application initializes a singleton `pg.Pool` with connection limits, keepalive probes, and idle timeouts.
2. Raw SQL migrations: Migrations live in `schema/migrations/` as numbered SQL files. The files run in lexical order without third party migration utilities.
3. Explicit transactions: Escrow changes execute inside `withTransaction(async (client) => { ... })`. If an error occurs, the helper executes `ROLLBACK` and releases the client back to the pool.
4. Pessimistic concurrency: Coalition allocations execute `SELECT * FROM coalitions WHERE id = $1 FOR UPDATE`. This serializes concurrent buyer pledges and guarantees mathematical integrity.

---

## 3. Network Architecture: NGINX Status and Role

### Current Status
NGINX is not currently in the local runtime stack.

The Node.js server in `src/web/server.js` listens directly on port 3000. In `docker-compose.yml`, the application container exposes port 3000 directly to the host. On Render, Render's edge load balancer terminates TLS and forwards incoming traffic directly to the Node.js application process.

### Role of NGINX in Self-Hosted and Container Deployments
For self-hosted production and Docker deployments, NGINX acts as the reverse proxy in front of Node.js. NGINX provides three critical functions:

1. Server-Sent Events Buffer Bypass:
   Node.js streams live agent thoughts, tool logs, and escrow state over `GET /api/v1/events`. Standard reverse proxies buffer chunked HTTP responses until a internal buffer fills. This delays real-time UI streaming. NGINX disables buffering for the event stream using `proxy_buffering off;` and `proxy_cache off;`.

2. Perimeter Request Body Limiting:
   Node.js loads request payloads into process memory. NGINX enforces `client_max_body_size 1M` at the network perimeter. It rejects oversized payloads before they touch the Node.js event loop.

3. Network-Level Rate Throttling:
   NGINX uses `limit_req_zone` to track client IP addresses in shared memory. It drops rapid floods before they consume application threads.

---

## 4. Rate Limiting Analysis: Current Gap and Resolution

### Are We Rate Limiting Today?
No route-level rate limiting is active on the HTTP web server today.

The current codebase contains two partial implementations:

1. Ingress HMAC Replay Window: `src/lib/gateway.js` verifies HMAC SHA-256 signatures and checks request timestamps against a 300-second window. This blocks replay attacks on buyer mandates, but it does not limit request frequency.
2. Benchmark Prototypes: `scripts/rate-limit-arena.mjs` benchmarks Token Bucket, Leaky Bucket, and Redis Sliding Window. In that benchmark, Token Bucket won with 400,000 operations per second and 0.05 microsecond latency.

The winning Token Bucket algorithm was never attached to `src/web/server.js`.

### The Denial-of-Wallet Vulnerability
The absence of route rate limiting exposes `POST /api/v1/agent/chat` to Denial-of-Wallet attacks.

Each call to `/api/v1/agent/chat` runs the local Qwen 3.5 9B model through Ollama. A single inference run requires 15 to 45 seconds of heavy GPU compute and memory bandwidth.

Without rate limiting, an external caller can submit 20 concurrent requests. This causes GPU memory exhaustion, starves the host operating system, and crashes the Node.js event loop.

### The Resolution
Wholeshare implements an in-memory Token Bucket rate limiter in `src/lib/rate-limiter.js`.

The middleware tracks client IP addresses:

1. Configuration: Capacity of 5 tokens with a refill rate of 1 token every 2 seconds.
2. Enforcement: `POST /api/v1/agent/chat` consumes 1 token per request.
3. Rejection: When tokens are exhausted, the server returns `HTTP 429 Too Many Requests` with a `Retry-After` header.

---

## 5. System Design Pillars for Agentic Applications

Building financial software powered by autonomous LLM agents requires design patterns that differ from standard CRUD applications.

### Pillar 1: Denial-of-Wallet and Compute Throttling
Agent workflows generate unbounded compute costs if left unrestricted. Wholeshare enforces three defensive barriers:

1. Step Budget: Sessions cap agent execution at a maximum of 5 tool turns (`MAX_TURNS = 5`).
2. Execution Timeout: Each agent step enforces a hard 45-second deadline. If the model hangs or spins, the runner aborts the turn and invokes fallback logic.
3. Tool Loop Breaker: If the agent calls the same tool with identical arguments two times consecutively, the interceptor halts execution and logs a policy violation.

### Pillar 2: Asynchronous Job Decoupling
LLM inference takes 15 to 45 seconds. Synchronous HTTP request-response cycles fail at this timescale:

1. Connection Drops: Client browsers, mobile networks, and intermediate proxies drop HTTP connections that stay idle for more than 30 seconds.
2. Event Loop Blocking: Keeping thousands of open HTTP connections waiting on long background tasks consumes socket descriptors.
3. Pattern: `POST /api/v1/agent/chat` validates the prompt, writes an initial session record to PostgreSQL, and returns `HTTP 202 Accepted` with a `sessionId` in under 5 milliseconds. The client tracks progress via the existing Server-Sent Events stream (`GET /api/v1/events`).

### Pillar 3: Pessimistic Concurrency Control
In group purchasing, multiple buyer agents join a coalition simultaneously to meet a supplier Minimum Order Quantity (MOQ):

1. Race Condition: Suppose 50 units remain to reach the 1,000-unit tier. If two buyer agents pledge 50 units at the exact same millisecond, optimistic reads allow both pledges. The coalition exceeds the tier target and calculates incorrect pricing.
2. Resolution: All coalition mutations run inside a PostgreSQL transaction. The query executes `SELECT * FROM coalitions WHERE id = $1 FOR UPDATE`. PostgreSQL serializes the evaluation. The second transaction waits until the first transaction commits, reading the updated unit count.

### Pillar 4: Deterministic Idempotency on Retries
LLM agents re-prompt and retry upon experiencing network hiccups or tool errors:

1. Double Authorization Risk: If an agent retries an order creation tool, it must never authorize duplicate charges on the buyer PayPal account.
2. Resolution: Every financial tool invocation computes a deterministic hash: `SHA256(coalitionId + buyerId + amountCents)`. Wholeshare transmits this hash as the `PayPal-Request-Id` header to PayPal Orders v2. If a retried request hits PayPal, PayPal returns the existing authorization order instead of creating a second charge.

### Pillar 5: Immutable Audit Journaling
Financial applications must provide complete forensic reconstructibility:

1. Every agent action journals to two destinations: the PostgreSQL `agent_steps` table and the append-only JSONL file `data/durable_journal.json`.
2. Stored attributes include the model thought, tool name, exact input arguments, tool output, interceptor verification status, and step duration.
3. Operators can inspect the full decision tree of any transaction at any time.

### Pillar 6: Human-in-the-Loop Step-Up Verification
High-value financial operations require human confirmation:

1. Soft Authorizations: Pledges under $1,000 auto-authorize via PayPal soft holds.
2. High-Value Orders: Any pledge of $1,000 or greater pauses the agent harness. The harness sets session status to `AWAITING_STEP_UP` and generates a PayPal invoice QR code. The agent cannot proceed until an authorized human approves the action via `POST /api/v1/agent/step-up`.

---

## 6. Execution Action Plan

### Phase 1: Database and Schema Cleanup
1. Delete `schema/schema.prisma` to eliminate legacy Prisma references.
2. Create `schema/migrations/003_coalitions_and_tokens.sql` containing SQL DDL for coalitions, coalition members, and ACP Shared Payment Tokens.
3. Update `src/lib/db.js` to ensure all queries use parameterized SQL with connection pooling and `SELECT ... FOR UPDATE` locking.

### Phase 2: In-Memory Token Bucket Rate Limiting
1. Create `src/lib/rate-limiter.js` with `TokenBucketRateLimiter`.
2. Export `agentRateLimiter` configured with capacity 5 and refill rate of 1 token per 2 seconds.
3. Mount the rate limiter in `src/web/server.js` on `POST /api/v1/agent/chat` and `POST /api/v1/sme/spawn`.
4. Return `HTTP 429` with `Retry-After` header when tokens are exhausted.
5. Create unit test `test/rate-limiter.test.js` validating burst behavior and token replenishment.

### Phase 3: PayPal Dispute Webhook Ingestion
1. Add `POST /api/v1/paypal/webhook` to `src/web/server.js`.
2. Ingest `CUSTOMER.DISPUTE.CREATED` events. Mark member authorization as `DISPUTED` and coalition as `FROZEN_DISPUTED`.
3. Ingest `CUSTOMER.DISPUTE.RESOLVED` events. Mark member authorization as `RESOLVED_BUYER` or `RESOLVED_SELLER`.
4. Create unit test `test/dispute-webhook.test.js` verifying webhook event parsing and state transitions.

### Phase 4: Production NGINX Reverse Proxy
1. Create `nginx/nginx.conf` with `proxy_buffering off;` for `/api/v1/events` and `limit_req_zone` rate limiting.
2. Update `docker-compose.yml` to include the `nginx` service routing traffic to `app:3000`.

### Phase 5: Verification Gate
1. Run `npm test` across all unit test suites.
2. Run `npm run lint` and `npm run lint:features`.
3. Run `npm run doctor` to confirm environmental integrity.
