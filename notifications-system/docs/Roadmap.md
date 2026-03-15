# Nucleus Notification Engine — Roadmap & Technical Debt

> **Last Updated:** 15 March 2026
> **Status:** MVP Complete — Production Hardening Required
> **Architecture:** NestJS Worker → Kafka → Go Gateway → Centrifugo / SendGrid / Twilio
> **Review Reference:** [SystemReview.md](./SystemReview.md) — Consolidated improvement suggestions incorporated below

---

## Current State Summary

The Nucleus Engine has a validated MVP covering:
- ✅ Multi-tenant API key authentication (webhook + realtime-token)
- ✅ Event-driven template resolution (global + tenant-scoped)
- ✅ MJML → HTML email rendering via Handlebars
- ✅ SMS text template rendering
- ✅ Real-time In-App push via Centrifugo WebSockets
- ✅ Persistent notification history (in_app_notifications)
- ✅ Notification logs audit trail
- ✅ Admin UI (Dashboard, Tenants, Templates, Routing, Logs)
- ✅ Template versioning with rollback
- ✅ Webhook HMAC-SHA256 signature verification
- ✅ Bring Your Own Provider (BYOP) — tenant-level provider configurations

---

## 🔴 Critical — Must Have Before Production

### 1. Dead Letter Queue (DLQ) & Retry Topics
**Priority:** P0 — Critical
**Components:** Go Gateway, Kafka, PostgreSQL
**Source:** Roadmap original + SystemReview §2, §8

Currently, if the Go Gateway fails to deliver an email (SendGrid down) or SMS (Twilio error), the message is silently logged and dropped. There is no retry mechanism.

**What to build:**
- [ ] Create Kafka topic structure: `notifications.events` → `notifications.retry` → `notifications.dead_letter`
- [ ] In the Go Gateway, on provider failure → publish to `notifications.retry` with retry metadata
- [ ] Implement graduated retry with exponential backoff (1min → 5min → 15min → 1hr)
- [ ] After max retries (e.g. 5), move to `notifications.dead_letter` topic and persist to a `failed_notifications` table with full error context
- [ ] Build a DLQ consumer for manual inspection and replay
- [ ] Add a DLQ viewer page in the Admin UI with manual retry/purge buttons
- [ ] Update `notification_logs` status to `FAILED` with `error_details` populated

### 2. Actual Provider Integration (SendGrid + Twilio)
**Priority:** P0 — Critical
**Components:** Go Gateway
**Source:** Roadmap original

The Go Gateway currently **simulates** email and SMS delivery with `time.Sleep()`. No actual provider SDKs are integrated.

**What to build:**
- [ ] Integrate SendGrid v3 REST API for EMAIL dispatch (with API key from env)
- [ ] Integrate Twilio REST API for SMS dispatch (with Account SID + Auth Token from env)
- [ ] Add provider-specific error parsing (rate limits, invalid recipients, etc.)
- [ ] Store the provider's external reference ID in `notification_logs.provider_ref`
- [ ] Add webhook receivers for SendGrid/Twilio delivery status callbacks to update `notification_logs` to `DELIVERED` or `FAILED`

### 3. Rate Limiting, Throttling & Tenant Quotas
**Priority:** P0 — Critical
**Components:** NestJS Worker, Go Gateway
**Source:** Roadmap original + SystemReview §1, §7

No rate limiting exists. A misconfigured integration could flood the system with thousands of webhook calls per second.

**What to build:**
- [ ] Add per-tenant rate limits on `/api/v1/events/trigger` (e.g., 100 req/min default)
- [ ] Store rate limit config per tenant in the `tenants` table
- [ ] Add Redis-based sliding window counter in the webhook controller
- [ ] Implement burst protection (e.g., token bucket algorithm)
- [ ] Return `429 Too Many Requests` with `Retry-After` header when exceeded
- [ ] Add tenant-level resource quotas: max notifications per day, max template count
- [ ] Add rate limit stats to the Admin Dashboard

### 4. Admin API Authentication
**Priority:** P0 — Critical
**Components:** NestJS Worker (Admin Module)

The entire Admin API (`/api/v1/admin/*`) is currently **wide open** with zero authentication. Anyone with the URL can create tenants, modify templates, and view API keys.

**What to build:**
- [ ] Add JWT-based authentication guard for all `/api/v1/admin/*` routes
- [ ] Create an `admin_users` table with hashed passwords
- [ ] Build login endpoint (`POST /api/v1/admin/auth/login`)
- [ ] Add auth middleware to the Admin UI (login page, token storage)
- [ ] Add RBAC: `super_admin` (full access) vs `tenant_admin` (scoped to own project)

### 5. Idempotency Support
**Priority:** P0 — Critical
**Components:** Events Controller, PostgreSQL
**Source:** SystemReview §1 (New)

Webhook producers may retry requests, which can cause duplicate notifications. There is no deduplication mechanism.

**What to build:**
- [ ] Add idempotency key support to the webhook API (via `X-Idempotency-Key` header or `event_id` in payload)
- [ ] Create a `processed_events` table or Redis cache with fields: `event_id`, `tenant_id`, `payload_hash`, `created_at`
- [ ] Workers verify if an event with the same key was already processed before continuing
- [ ] Return the original response for duplicate requests
- [ ] Auto-expire idempotency records after a configurable TTL (e.g., 24 hours)

### 6. Channel Adapter Pattern
**Priority:** P0 — Critical
**Components:** Go Gateway, NestJS Worker
**Source:** SystemReview §5 (New)

All provider integrations are currently tightly coupled. Swapping or adding providers requires modifying core dispatch logic.

**What to build:**
- [ ] Define a unified `ChannelAdapter` interface: `send(message) → DeliveryResult`
- [ ] Implement concrete adapters: `SendGridAdapter`, `TwilioAdapter`, `FCMAdapter`, `CentrifugoAdapter`
- [ ] Add adapter registry that resolves the correct adapter per tenant + channel based on `provider_configs`
- [ ] Ensure all adapters return standardized delivery results (status, provider_ref, error)
- [ ] Enable hot-swapping providers per tenant without code changes (BYOP architecture)

---

## 🟡 High Priority — Should Have Before GA

### 7. Input Validation & Error Handling
**Priority:** P1 — High
**Components:** All controllers
**Source:** Roadmap original + SystemReview §4

Currently using `any` types throughout. No DTO validation, no payload sanitization.

**What to build:**
- [ ] Create DTOs with `class-validator` decorators for all endpoints
- [ ] Add `ValidationPipe` globally in `main.ts`
- [ ] Sanitize Handlebars templates to prevent XSS injection via `{{payload}}`
- [ ] Add proper NestJS exception filters for structured error responses
- [ ] Validate MJML syntax before saving templates (parse dry-run)
- [ ] Define per-event-type payload schemas for template variable validation
- [ ] Validate incoming webhook payloads against expected schema before processing

### 8. Template Duplicate Version Prevention
**Priority:** P1 — High
**Components:** Templates Controller

When clicking "Edit → Publish", the backend always creates a new version even if the content hasn't changed. This creates noise in version history.

**What to build:**
- [ ] Compare `content_body`, `subject_line`, and `target_ws_channel` with the latest version
- [ ] If identical, return the existing version instead of creating a duplicate
- [ ] Show a "No changes detected" toast in the Admin UI

### 9. Delivery Status Tracking (Unified Lifecycle)
**Priority:** P1 — High
**Components:** NestJS Worker, Go Gateway, PostgreSQL
**Source:** SystemReview §3 (Enhanced)

No unified lifecycle tracking for notifications across all channels. Status tracking is fragmented.

**What to build:**
- [ ] Implement unified notification status model: `PENDING → PROCESSING → SENT → DELIVERED → READ → FAILED → RETRYING`
- [ ] Track status transitions with timestamps in `notification_logs`
- [ ] Update status from provider callbacks (SendGrid/Twilio webhooks → `DELIVERED`)
- [ ] Update status from frontend read receipts (In-App → `READ`)
- [ ] Expose status timeline via Admin UI notification detail view
- [ ] Surface delivery status in the webhook receipt response (see #12)

### 10. Notification Preferences / Opt-Out Registry
**Priority:** P1 — High
**Components:** New module

Currently, the Integration Guide tells developers to check opt-out status **before** calling the webhook. But there's no centralized preference store.

**What to build:**
- [ ] Create `user_preferences` table: `(user_id, tenant_id, channel, enabled, updated_at)`
- [ ] `PUT /api/v1/preferences/:tenantId/:userId` — Set preferences
- [ ] `GET /api/v1/preferences/:tenantId/:userId` — Get preferences
- [ ] Check preferences in the notification worker **before** dispatching each channel
- [ ] Add "Mute" endpoint so users can suppress notifications temporarily

### 11. Batch / Bulk Event Triggers
**Priority:** P1 — High
**Components:** Events Controller

Currently only supports 1-to-1 webhook calls. Broadcasting to 1000 users requires 1000 HTTP calls.

**What to build:**
- [ ] `POST /api/v1/events/trigger-batch` accepting an array of payloads
- [ ] Fan-out to Kafka in a single producer session
- [ ] Add progress tracking for large batches
- [ ] Return a `batchId` that can be queried for completion status

### 12. Template Preview / Playground
**Priority:** P1 — High
**Components:** Admin UI, Templates Controller

No way to preview how a template will render without actually firing an event.

**What to build:**
- [ ] `POST /api/v1/admin/templates/:template_id/preview` — accepts mock data, returns rendered HTML
- [ ] Add a "Preview" button in the Admin UI template editor
- [ ] Show rendered MJML in an iframe for EMAIL templates
- [ ] Show rendered text for SMS/PUSH templates

---

## 🟢 Medium Priority — Nice to Have

### 13. Webhook Delivery Receipts
**Priority:** P2 — Medium
**Components:** Events Controller

Currently the webhook returns immediately after publishing to Kafka. The caller has no way to know if delivery actually succeeded.

**What to build:**
- [ ] Return a `trackingId` from the webhook response
- [ ] `GET /api/v1/events/status/:trackingId` — Poll delivery status
- [ ] Optional: Webhook callback URL in the tenant config for push-based status updates

### 14. Scheduled / Delayed Notifications
**Priority:** P2 — Medium
**Components:** New module, Redis/BullMQ

No support for "send this email at 9am tomorrow" or "send reminder in 2 hours."

**What to build:**
- [ ] Add `scheduledAt` field to webhook payload
- [ ] If `scheduledAt` is present, store in a Redis sorted set keyed by timestamp
- [ ] Build a scheduler worker that polls and publishes to Kafka when due
- [ ] Add scheduled notifications view in Admin UI

### 15. Standardized WebSocket Channel Naming
**Priority:** P2 — Medium
**Components:** Go Gateway, NestJS Auth Module, Centrifugo
**Source:** SystemReview §6 (New)

Current channel naming uses `tenant#userId` which is prone to naming collisions and makes permission enforcement harder.

**What to build:**
- [ ] Migrate channel naming to structured format: `tenant:{tenantId}:user:{userId}`
- [ ] Update JWT channel authorization to use explicit `channels` array claim
- [ ] Update Go Gateway publish logic to use new naming convention
- [ ] Update Auth Controller token generation
- [ ] Write migration guide for existing tenant integrations
- [ ] Ensure backwards-compatible transition period

### 16. Template Rendering Optimization
**Priority:** P2 — Medium
**Components:** NestJS Worker (RenderService)
**Source:** SystemReview §4 (New)

MJML compilation and Handlebars rendering can become CPU-intensive under high load.

**What to build:**
- [ ] Implement template precompilation (compile MJML on save, store compiled HTML structure)
- [ ] Add Redis-based cache for compiled templates keyed by `template_id:version`
- [ ] Precompile Handlebars templates and cache the compiled function
- [ ] Add cache invalidation on template update
- [ ] Benchmark and monitor rendering latency per template

### 17. Kafka Partition Strategy
**Priority:** P2 — Medium
**Components:** Kafka, NestJS Worker, Go Gateway
**Source:** SystemReview §2 (New)

Events are not partitioned by tenant, which limits scalability and isolation.

**What to build:**
- [ ] Configure `notifications.events` topic with tenant-aware partitioning (`partition_key: tenant_id`)
- [ ] Update Kafka producers to include partition key in message publishing
- [ ] Ensure consumer group assignments support tenant-level isolation
- [ ] Benchmark partition distribution under multi-tenant load

### 18. Analytics & Metrics
**Priority:** P2 — Medium
**Components:** Admin UI, Stats Controller

The dashboard shows basic counts but no trends, time-series, or performance metrics.

**What to build:**
- [ ] Track delivery latency (time between webhook receipt and provider confirmation)
- [ ] Time-series charts: notifications/hour, notifications/day
- [ ] Per-tenant breakdown: which projects send the most notifications?
- [ ] Channel success rates over time (EMAIL: 98.5%, SMS: 94.2%)
- [ ] Template popularity ranking

### 19. Audit Trail & Activity Log
**Priority:** P2 — Medium
**Components:** All Admin controllers

No record of who created/edited/deactivated templates or tenants in the Admin UI.

**What to build:**
- [ ] Create `admin_audit_log` table: `(action, resource, resource_id, actor, timestamp, diff)`
- [ ] Log all admin mutations (create tenant, edit template, rotate key, etc.)
- [ ] Add an "Audit Trail" page in the Admin UI

### 20. Multi-Language / Locale Support
**Priority:** P2 — Medium
**Components:** Templates, Notification Controller

The schema has a `locale` field on templates but it's never used. All templates are English-only.

**What to build:**
- [ ] Allow creating locale variants of the same template (e.g., `global.success` in `en`, `fr`, `sw`)
- [ ] Accept `locale` in the webhook payload
- [ ] Resolve the correct locale template, falling back to `en` if not found
- [ ] Add locale selector in the Admin UI template editor

### 21. Observability & Monitoring Stack
**Priority:** P2 — Medium
**Components:** All services
**Source:** SystemReview §9 (New — expanded from previous #18)

The system lacks comprehensive operational monitoring across all components.

**What to build:**

**Kafka Metrics:**
- [ ] Monitor consumer lag per consumer group
- [ ] Track message throughput (messages/sec)
- [ ] Monitor partition utilization and rebalancing events

**Worker Metrics:**
- [ ] Track processing latency (event received → dispatch complete)
- [ ] Monitor template rendering error rates
- [ ] Track event failure rates by tenant, event type, and channel

**Channel Delivery Metrics:**
- [ ] Email success/bounce/complaint rates
- [ ] SMS delivery rate and provider error breakdown
- [ ] WebSocket publish latency and connection counts

**Infrastructure:**
- [ ] Deploy Prometheus metrics exporters for NestJS and Go Gateway
- [ ] Build Grafana dashboards for real-time operational visibility
- [ ] Integrate OpenTelemetry for distributed tracing across the pipeline
- [ ] Configure alert rules: DLQ depth > threshold, failure rate > 5%, Kafka lag > threshold

---

## 🔵 Low Priority — Future Enhancements

### 22. Additional Channel Support
**Priority:** P3 — Low
**Components:** Go Gateway, Templates, Channel Adapters
**Source:** Roadmap original (WhatsApp) + SystemReview §5 (expanded)

Expand beyond EMAIL/SMS/PUSH to additional delivery channels.

**Channels to add:**
- [ ] WhatsApp (WhatsApp Business API)
- [ ] Push Notifications — Firebase Cloud Messaging (FCM) / Apple Push Notification Service (APNS)
- [ ] Slack (Incoming Webhooks / Slack API)
- [ ] Custom Webhooks (tenant-defined HTTP callback endpoints)

### 23. Template Marketplace / Import-Export
**Priority:** P3 — Low
**Components:** Admin UI

Allow exporting template sets as JSON and importing them into other environments or sharing across tenants.

### ✅ 24. Webhook Signature Verification
**Priority:** P1 (Completed)
**Components:** Events Controller, Security Service

Successfully implemented HMAC-SHA256 signature verification via headers to secure incoming webhook calls.

**What was built:**
- [x] Sign webhook payloads with `X-Nucleus-Signature` header using HMAC-SHA256
- [x] Verify signature server-side before processing (SecurityService + NestJS rawBody)
- [x] Provide SDK helpers for integration teams (`SDK-Helpers.md`)

### 25. Health Check & Readiness Endpoints
**Priority:** P3 — Low
**Components:** All services

No health check endpoints for container orchestration (K8s liveness/readiness probes).

**What to build:**
- [ ] `GET /health` on NestJS worker (DB, Kafka, Redis connectivity)
- [ ] `GET /health` on Go Gateway (DB, Kafka, Centrifugo connectivity)
- [ ] K8s-compatible liveness and readiness probe endpoints

### 26. Containerization & CI/CD
**Priority:** P3 — Low
**Components:** DevOps

The NestJS Worker and Go Gateway currently run as bare processes. Not containerized or orchestrated.

**What to build:**
- [ ] Dockerfile for NestJS Worker
- [ ] Dockerfile for Go Gateway
- [ ] Dockerfile for Admin UI (Next.js)
- [ ] Add all services to `docker-compose.yml`
- [ ] GitHub Actions CI pipeline: lint → test → build → push images
- [ ] Kubernetes manifests or Helm charts for production deployment

### 27. Worker Decomposition (Microservice Split)
**Priority:** P3 — Low (Future Architecture)
**Components:** NestJS Worker
**Source:** SystemReview §3 (New)

The worker currently handles event processing, template rendering, routing, and dispatch coordination. As the system scales, this "God Service" pattern becomes difficult to maintain.

**Future decomposition plan:**
- [ ] Extract **Event Processor** — validates and enriches incoming events
- [ ] Extract **Template Renderer** — handles MJML compilation, Handlebars rendering, caching
- [ ] Extract **Notification Router** — resolves templates, applies preferences, determines channels
- [ ] Extract **Channel Dispatchers** — independent services per channel type for isolated scaling
- [ ] Define inter-service communication contracts (Kafka topics or gRPC)

### 28. Notification Orchestration Engine
**Priority:** P3 — Low (Strategic Future)
**Components:** New orchestration module
**Source:** SystemReview §11 (New)

Move from static, single-shot notifications to workflow-based notification chains supporting conditional logic, delays, and multi-step sequences.

**Example workflow:**
```
Event: order.created
  → Step 1: Send Email (Order Confirmation)
  → Step 2: Wait 2 hours
  → Step 3: If order_not_paid → Send SMS reminder
  → Step 4: Wait 24 hours
  → Step 5: If still_not_paid → Send final warning email
```

**Enables:**
- Marketing automation sequences
- Customer lifecycle messaging
- Engagement and drip campaign flows
- Event-driven conditional branching

---

## 🛠 Technical Debt / Refactors

### ✅ R1. Remove `any` Types
All Kafka message handlers and controller bodies use `any`. Replace with typed DTOs and interfaces.

### ✅ R2. Extract Shared Config
`API_URL` is duplicated across every Admin UI page. Extract to a shared `lib/api.ts` config module.

### ✅ R3. Go Gateway — Hardcoded Addresses
Centrifugo address (`http://localhost:8000/api`) and Kafka broker (`localhost:9092`) are hardcoded. Move to environment variables.

### ✅ R4. Prisma Raw Queries
`notification.controller.ts` uses `$executeRaw` for inserts. Migrate to Prisma's typed `create()` method for type safety and error handling.

### ✅ R5. Template Version Fetching
The notification worker fetches ALL active versions of a template, but only the latest should be used per channel. Add `DISTINCT ON` or `take: 1` per channel_type group.

### ✅ R6. Error Boundaries in Admin UI
No error boundaries or error states in the React components. Add `try/catch` with user-friendly error toasts.

### ✅ R7. Tenant Object in Kafka Payload
The full `tenant` object is currently serialized into Kafka messages (includes `api_key`). Only `tenant.id` and `tenant.name` should be forwarded to avoid leaking secrets through message brokers.

### ✅ R8. Go Gateway — Category Field
The Go Gateway's `NotificationPayload` struct doesn't include `category` or `eventType` fields added in the worker. Update the struct and forward them to Centrifugo.

---

## Implementation Priority Matrix

| Phase | Items | Target |
|-------|-------|--------|
| **Phase 1 — Hardening** | DLQ & Retry (#1), Provider Integration (#2), Admin Auth (#4), Rate Limiting & Quotas (#3), Idempotency (#5), Channel Adapters (#6) | Before any production deployment |
| **Phase 2 — Reliability** | Input Validation (#7), Template Dedup (#8), Delivery Status Tracking (#9), Preferences (#10) | Before GA |
| **Phase 3 — Features** | Batch (#11), Preview (#12), Webhook Receipts (#13), WS Channel Naming (#15), Template Caching (#16) | Post-GA sprint 1 |
| **Phase 4 — Scale** | Kafka Partitioning (#17), Analytics (#18), Audit (#19), Locale (#20), Observability (#21) | Post-GA sprint 2 |
| **Phase 5 — Expansion** | Additional Channels (#22), Export (#23), Health Checks (#25), CI/CD (#26), Scheduling (#14) | Ongoing |
| **Phase 6 — Strategic** | Worker Decomposition (#27), Orchestration Engine (#28) | Long-term evolution |

---

## Changelog

| Date | Change |
|------|--------|
| 12 Mar 2026 | Initial roadmap created with MVP assessment |
| 15 Mar 2026 | Incorporated SystemReview.md analysis: added Idempotency (#5), Channel Adapter Pattern (#6), Delivery Status Tracking (#9), WS Channel Naming (#15), Template Caching (#16), Kafka Partitioning (#17), Observability Stack (#21), Additional Channels (#22), Worker Decomposition (#27), Orchestration Engine (#28). Enhanced Rate Limiting (#3) with quotas & burst protection. Enhanced Input Validation (#7) with schema validation. Added Phase 6 for strategic items. Renumbered all items. Marked BYOP and Webhook Signatures as completed. |
