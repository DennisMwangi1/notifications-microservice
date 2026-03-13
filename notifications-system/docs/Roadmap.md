# Nucleus Notification Engine — Roadmap & Technical Debt

> **Last Updated:** 12 March 2026
> **Status:** MVP Complete — Production Hardening Required
> **Architecture:** NestJS Worker → Kafka → Go Gateway → Centrifugo / SendGrid / Twilio

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

---

## 🔴 Critical — Must Have Before Production

### 1. Dead Letter Queue (DLQ)
**Priority:** P0 — Critical
**Components:** Go Gateway, Kafka, PostgreSQL

Currently, if the Go Gateway fails to deliver an email (SendGrid down) or SMS (Twilio error), the message is silently logged and dropped. There is no retry mechanism.

**What to build:**
- [ ] Create a `notification.dlq` Kafka topic for failed dispatches
- [ ] In the Go Gateway, on provider failure → publish to `notification.dlq` instead of dropping
- [ ] Build a DLQ consumer that retries with exponential backoff (1s → 5s → 30s → 5min → 1hr)
- [ ] After max retries (e.g. 5), persist to a `failed_notifications` table with full error context
- [ ] Add a DLQ viewer page in the Admin UI with manual retry/purge buttons
- [ ] Update `notification_logs` status to `FAILED` with `error_details` populated

### 2. Actual Provider Integration (SendGrid + Twilio)
**Priority:** P0 — Critical
**Components:** Go Gateway

The Go Gateway currently **simulates** email and SMS delivery with `time.Sleep()`. No actual provider SDKs are integrated.

**What to build:**
- [ ] Integrate SendGrid v3 REST API for EMAIL dispatch (with API key from env)
- [ ] Integrate Twilio REST API for SMS dispatch (with Account SID + Auth Token from env)
- [ ] Add provider-specific error parsing (rate limits, invalid recipients, etc.)
- [ ] Store the provider's external reference ID in `notification_logs.provider_ref`
- [ ] Add webhook receivers for SendGrid/Twilio delivery status callbacks to update `notification_logs` to `DELIVERED` or `FAILED`

### 3. Rate Limiting & Throttling
**Priority:** P0 — Critical
**Components:** NestJS Worker, Go Gateway

No rate limiting exists. A misconfigured integration could flood the system with thousands of webhook calls per second.

**What to build:**
- [ ] Add per-tenant rate limits on `/api/v1/events/trigger` (e.g., 100 req/min default)
- [ ] Store rate limit config per tenant in the `tenants` table
- [ ] Add Redis-based sliding window counter in the webhook controller
- [ ] Return `429 Too Many Requests` with `Retry-After` header when exceeded
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

---

## 🟡 High Priority — Should Have Before GA

### 5. Input Validation & Error Handling
**Priority:** P1 — High
**Components:** All controllers

Currently using `any` types throughout. No DTO validation, no payload sanitization.

**What to build:**
- [ ] Create DTOs with `class-validator` decorators for all endpoints
- [ ] Add `ValidationPipe` globally in `main.ts`
- [ ] Sanitize Handlebars templates to prevent XSS injection via `{{payload}}`
- [ ] Add proper NestJS exception filters for structured error responses
- [ ] Validate MJML syntax before saving templates (parse dry-run)

### 6. Template Duplicate Version Prevention
**Priority:** P1 — High
**Components:** Templates Controller

When clicking "Edit → Publish", the backend always creates a new version even if the content hasn't changed. This creates noise in version history.

**What to build:**
- [ ] Compare `content_body`, `subject_line`, and `target_ws_channel` with the latest version
- [ ] If identical, return the existing version instead of creating a duplicate
- [ ] Show a "No changes detected" toast in the Admin UI

### 7. Notification Preferences / Opt-Out Registry
**Priority:** P1 — High
**Components:** New module

Currently, the Integration Guide tells developers to check opt-out status **before** calling the webhook. But there's no centralized preference store.

**What to build:**
- [ ] Create `user_preferences` table: `(user_id, tenant_id, channel, enabled, updated_at)`
- [ ] `PUT /api/v1/preferences/:tenantId/:userId` — Set preferences
- [ ] `GET /api/v1/preferences/:tenantId/:userId` — Get preferences
- [ ] Check preferences in the notification worker **before** dispatching each channel
- [ ] Add "Mute" endpoint so users can suppress notifications temporarily

### 8. Batch / Bulk Event Triggers
**Priority:** P1 — High
**Components:** Events Controller

Currently only supports 1-to-1 webhook calls. Broadcasting to 1000 users requires 1000 HTTP calls.

**What to build:**
- [ ] `POST /api/v1/events/trigger-batch` accepting an array of payloads
- [ ] Fan-out to Kafka in a single producer session
- [ ] Add progress tracking for large batches
- [ ] Return a `batchId` that can be queried for completion status

### 9. Template Preview / Playground
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

### 10. Webhook Delivery Receipts
**Priority:** P2 — Medium
**Components:** Events Controller

Currently the webhook returns immediately after publishing to Kafka. The caller has no way to know if delivery actually succeeded.

**What to build:**
- [ ] Return a `trackingId` from the webhook response
- [ ] `GET /api/v1/events/status/:trackingId` — Poll delivery status
- [ ] Optional: Webhook callback URL in the tenant config for push-based status updates

### 11. Scheduled / Delayed Notifications
**Priority:** P2 — Medium
**Components:** New module, Redis/BullMQ

No support for "send this email at 9am tomorrow" or "send reminder in 2 hours."

**What to build:**
- [ ] Add `scheduledAt` field to webhook payload
- [ ] If `scheduledAt` is present, store in a Redis sorted set keyed by timestamp
- [ ] Build a scheduler worker that polls and publishes to Kafka when due
- [ ] Add scheduled notifications view in Admin UI

### 12. Analytics & Metrics
**Priority:** P2 — Medium
**Components:** Admin UI, Stats Controller

The dashboard shows basic counts but no trends, time-series, or performance metrics.

**What to build:**
- [ ] Track delivery latency (time between webhook receipt and provider confirmation)
- [ ] Time-series charts: notifications/hour, notifications/day
- [ ] Per-tenant breakdown: which projects send the most notifications?
- [ ] Channel success rates over time (EMAIL: 98.5%, SMS: 94.2%)
- [ ] Template popularity ranking

### 13. Audit Trail & Activity Log
**Priority:** P2 — Medium
**Components:** All Admin controllers

No record of who created/edited/deactivated templates or tenants in the Admin UI.

**What to build:**
- [ ] Create `admin_audit_log` table: `(action, resource, resource_id, actor, timestamp, diff)`
- [ ] Log all admin mutations (create tenant, edit template, rotate key, etc.)
- [ ] Add an "Audit Trail" page in the Admin UI

### 14. Multi-Language / Locale Support
**Priority:** P2 — Medium
**Components:** Templates, Notification Controller

The schema has a `locale` field on templates but it's never used. All templates are English-only.

**What to build:**
- [ ] Allow creating locale variants of the same template (e.g., `global.success` in `en`, `fr`, `sw`)
- [ ] Accept `locale` in the webhook payload
- [ ] Resolve the correct locale template, falling back to `en` if not found
- [ ] Add locale selector in the Admin UI template editor

---

## 🔵 Low Priority — Future Enhancements

### 15. WhatsApp Channel Support
**Priority:** P3 — Low
**Components:** Go Gateway, Templates

Add WhatsApp as a 4th channel type alongside EMAIL/SMS/PUSH using the WhatsApp Business API.

### 16. Template Marketplace / Import-Export
**Priority:** P3 — Low
**Components:** Admin UI

Allow exporting template sets as JSON and importing them into other environments or sharing across tenants.

### 17. Webhook Signature Verification
**Priority:** P3 — Low (but becomes P1 in production)
**Components:** Events Controller

Currently authentication is API-key-in-body. A more secure approach would be HMAC signature verification via headers.

**What to build:**
- [ ] Sign webhook payloads with `X-Nucleus-Signature` header using HMAC-SHA256
- [ ] Verify signature server-side before processing
- [ ] Provide SDK helpers for integration teams

### 18. Health Check & Monitoring Endpoints
**Priority:** P3 — Low
**Components:** All services

No health check endpoints for container orchestration (K8s liveness/readiness probes).

**What to build:**
- [ ] `GET /health` on NestJS worker (DB, Kafka, Redis connectivity)
- [ ] `GET /health` on Go Gateway (DB, Kafka, Centrifugo connectivity)
- [ ] Prometheus metrics exporter for Grafana dashboards
- [ ] Alert rules for: DLQ depth > threshold, delivery failure rate > 5%, Kafka lag

### 19. Containerization & CI/CD
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
| **Phase 1 — Hardening** | DLQ (#1), Provider Integration (#2), Admin Auth (#4), Rate Limiting (#3) | Before any production deployment |
| **Phase 2 — Reliability** | Input Validation (#5), Template Dedup (#6), R7 (Tenant leak), R5 (Version fetch) | Before GA |
| **Phase 3 — Features** | Preferences (#7), Batch (#8), Preview (#9), Webhook Receipts (#10) | Post-GA sprint 1 |
| **Phase 4 — Scale** | Scheduling (#11), Analytics (#12), Audit (#13), Locale (#14) | Post-GA sprint 2 |
| **Phase 5 — Polish** | WhatsApp (#15), Export (#16), Signatures (#17), Monitoring (#18), CI/CD (#19) | Ongoing |
