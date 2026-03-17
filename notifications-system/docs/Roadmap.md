# Nucleus Notification Engine — Roadmap & Delivery Status

> **Last Updated:** 17 March 2026
> **Status:** Functional MVP with core hardening features already implemented; production readiness still requires admin auth, provider completion, and validation hardening
> **Architecture:** NestJS Worker → Kafka → Go Gateway → Centrifugo / Resend / Twilio / SendGrid
> **Review Reference:** [SystemReview.md](./SystemReview.md)

---

## Current State Summary

The platform is more mature than the previous roadmap reflected. The current implementation already includes:

- ✅ Multi-tenant webhook authentication via tenant API keys
- ✅ HMAC-SHA256 webhook signature verification
- ✅ Realtime token issuance for Centrifugo
- ✅ Global and tenant-scoped template resolution
- ✅ MJML + Handlebars email rendering
- ✅ SMS and in-app text rendering
- ✅ Template versioning with deactivate/reactivate rollback flows
- ✅ In-app persistence via `in_app_notifications`
- ✅ Notification audit logging via `notification_logs`
- ✅ Redis-backed tenant lookup, idempotency, and rate-limiting fast paths
- ✅ Kafka dispatch, retry, and dead-letter topic flow
- ✅ Go gateway channel adapter pattern and provider registry
- ✅ BYOP-style provider configuration through `provider_configs`
- ✅ Admin APIs for tenants, templates, providers, logs, stats, and DLQ management
- ✅ Admin UI pages for Dashboard, Tenants, Templates, Routing, Logs, and Providers

The largest gaps that still block production are:

- ❌ No authentication on `/api/v1/admin/*`
- ❌ Provider delivery is incomplete: Resend is live, Twilio is simulated, SendGrid is still a stub
- ❌ DTO validation and structured exception handling are still missing
- ❌ No health endpoints or observability stack

---

## ✅ Implemented

### 1. Secure Event Ingestion
- [x] Tenant API key authentication on `POST /api/v1/events/trigger`
- [x] Optional HMAC verification using `X-Nucleus-Signature`
- [x] Realtime token generation on `POST /api/v1/auth/realtime-token`

### 2. Template Resolution, Rendering & Versioning
- [x] Global templates (`tenant_id = null`)
- [x] Tenant-specific routing overrides
- [x] Latest active version resolution per channel
- [x] MJML email rendering through Handlebars
- [x] SMS/PUSH text rendering through Handlebars
- [x] Template version history and rollback endpoints
- [x] Admin UI flows for publishing, editing, deactivating, and restoring templates

### 3. Dispatch Pipeline & Adapter Pattern
- [x] Kafka topics for intake and dispatch
- [x] Go `ChannelAdapter` interface
- [x] Adapter registry for provider/channel resolution
- [x] Centrifugo realtime adapter
- [x] Resend email adapter with live API integration
- [x] Tenant-level provider configuration model (`provider_configs`)

### 4. Reliability Features Already Added
- [x] Redis-first idempotency with PostgreSQL audit fallback
- [x] 24-hour idempotency TTL with duplicate response reuse
- [x] Redis-cached tenant API-key resolution for webhook ingress
- [x] Redis-backed per-minute rate limiting
- [x] Redis-backed daily notification caps
- [x] Retry topic publishing with exponential backoff
- [x] Dead-letter topic publishing after max retries
- [x] DLQ persistence to `failed_notifications`
- [x] `notification_logs` update to `FAILED` with DLQ error context

### 5. Admin API & UI Surface
- [x] Tenant CRUD and API key rotation
- [x] Provider config CRUD
- [x] Dashboard stats endpoint and UI
- [x] Logs endpoint and UI
- [x] Error boundary support in the Admin UI
- [x] Shared Admin UI API config refactor

### 6. DLQ Management Setup
DLQ management has already been set up in the admin backend.

- [x] `worker/src/admin/dlq.controller.ts` exposes list, detail, retry, retry-all, purge, and summary endpoints
- [x] Manual replay is supported by re-publishing DLQ payloads back to `notification.dispatch`
- [x] Failed notifications are queryable from PostgreSQL through the admin API

---

## 🟡 Partially Implemented

### 7. Provider Integration
**Status:** Partial

- [x] Resend is implemented for email dispatch
- [x] Provider reference IDs can be stored in `notification_logs.provider_ref`
- [~] Twilio adapter exists but still simulates delivery
- [~] SendGrid adapter exists but currently returns a not-implemented failure
- [ ] Provider callback webhooks for `DELIVERED` / `FAILED` updates are missing
- [ ] Provider-specific error normalization is incomplete

### 8. Retry, DLQ & Replay Workflow
**Status:** Partial

- [x] Retry and DLQ topics are in place
- [x] Retry consumer exists in the Go gateway
- [x] DLQ persistence consumer exists in the NestJS worker
- [x] Admin API supports listing, retrying, bulk retrying, purging, and summary stats
- [~] Replay is available through the admin API only
- [ ] DLQ viewer page is still missing in the Admin UI

### 9. Rate Limiting, Throttling & Quotas
**Status:** Implemented

- [x] Rate limit fields exist on `tenants`
- [x] Redis sliding-window style enforcement exists for per-minute traffic
- [x] Daily notification caps are enforced
- [x] Retry timing is returned in the 429 response body
- [x] `Retry-After` header is set explicitly
- [x] Burst protection / token bucket logic is implemented
- [x] `max_template_count` is enforced for tenant template creation
- [x] Rate limit stats are surfaced in the dashboard

### 10. Delivery Status Tracking
**Status:** Partial

- [x] `notification_logs` track `PENDING`, `SENT`, `FAILED`, and `RETRYING`
- [x] In-app notifications track `UNREAD` and `READ`
- [~] `DELIVERED` exists in the enum but is not wired end-to-end
- [ ] No unified status lifecycle across all channels yet
- [ ] No Admin UI detail view for delivery timelines
- [ ] Read receipts do not update `notification_logs`

### 11. Input Validation & Error Handling
**Status:** Partial

- [x] Typed interfaces exist for event, auth, admin, and dispatch payloads
- [x] Some controllers perform manual guard checks
- [~] Realtime payload content is sanitized before Centrifugo publish
- [ ] No `class-validator` DTO classes
- [ ] No global `ValidationPipe`
- [ ] No MJML validation on template save
- [ ] No standardized exception filter
- [ ] No per-event payload schema validation

---

## 🔴 Critical — Must Have Before Production

### 12. Admin API Authentication
**Priority:** P0 — Critical
**Components:** NestJS Worker, Admin UI

The full admin surface is still unauthenticated.

- [ ] Add auth guard for all `/api/v1/admin/*` routes
- [ ] Create `admin_users` table with hashed passwords
- [ ] Add login endpoint
- [ ] Add Admin UI login/session flow
- [ ] Add RBAC for super admin vs tenant admin

### 13. Complete Real Provider Delivery
**Priority:** P0 — Critical
**Components:** Go Gateway

- [ ] Replace Twilio simulation with real API integration
- [ ] Implement actual SendGrid email delivery
- [ ] Add provider delivery callback receivers
- [ ] Normalize retryable vs permanent provider failures

### 14. Validation Hardening
**Priority:** P0 — Critical
**Components:** NestJS Worker

- [ ] Replace interface-only DTOs with validated DTO classes
- [ ] Add global `ValidationPipe`
- [ ] Add structured exception filters
- [ ] Validate MJML and payload shape before publish

### 15. Admin DLQ UI
**Priority:** P0 — Critical
**Components:** Admin UI

Backend support is present, but the user-facing management page does not exist yet.

- [ ] Add DLQ list page
- [ ] Add failed notification detail view
- [ ] Add retry and purge actions in UI
- [ ] Surface DLQ counts on the dashboard

---

## 🟡 High Priority — Should Have Before GA

### 16. Template Duplicate Version Prevention
- [ ] Avoid creating a new version when nothing changed
- [ ] Return current version instead of creating noise
- [ ] Show “No changes detected” feedback in Admin UI

### 17. Unified Delivery Lifecycle
- [ ] Add status model covering processing through read/delivered
- [ ] Persist timestamps for transitions
- [ ] Update from provider callbacks and in-app read receipts

### 18. Notification Preferences / Opt-Out Registry
- [ ] Create centralized preference store
- [ ] Add set/get preference endpoints
- [ ] Enforce preferences in the worker before dispatch

### 19. Batch / Bulk Event Triggers
- [ ] Add `POST /api/v1/events/trigger-batch`
- [ ] Fan out efficiently to Kafka
- [ ] Track batch completion status

### 20. Template Preview / Playground
- [ ] Add preview endpoint for mock payload rendering
- [ ] Add Admin UI preview for EMAIL, SMS, and PUSH

---

## 🟢 Medium Priority — Nice to Have

### 21. Webhook Delivery Receipts
- [ ] Return tracking IDs from trigger endpoint
- [ ] Add status polling endpoint

### 22. Scheduled / Delayed Notifications
- [ ] Add delayed-send support
- [ ] Build scheduler worker and persistence model

### 23. Standardized WebSocket Channel Naming
- [ ] Replace `channel#userId` / `global_system#userId` naming
- [ ] Update token claims and publish logic together

### 24. Template Rendering Optimization
- [ ] Cache compiled MJML/Handlebars artifacts
- [ ] Add invalidation strategy and latency benchmarks

### 25. Kafka Partition Strategy
- [ ] Add tenant-aware partitioning
- [ ] Include partition keys in producer messages

### 26. Analytics & Metrics
- [ ] Add time-series dashboard data
- [ ] Add per-tenant and per-channel trends
- [ ] Add delivery latency metrics

### 27. Audit Trail & Activity Log
- [ ] Add admin mutation audit table
- [ ] Record actor, action, target, and diff
- [ ] Add an audit trail page in the Admin UI

### 28. Multi-Language / Locale Support
- [ ] Use the existing `locale` field during template resolution
- [ ] Add locale-aware fallbacks and UI controls

### 29. Observability & Monitoring Stack
- [ ] Add service health endpoints
- [ ] Add Kafka, worker, and gateway operational metrics
- [ ] Add dashboards, tracing, and alerting

---

## 🔵 Low Priority — Future Enhancements

### 30. Additional Channel Support
- [ ] WhatsApp
- [ ] FCM / APNS mobile push
- [ ] Slack
- [ ] Custom webhook delivery

### 31. Template Marketplace / Import-Export
- [ ] Export/import template sets between environments or tenants

### 32. Containerization & CI/CD
**Current state:** infra services are already present in `docker-compose.yml`, but app services are not fully containerized.

- [x] Compose support for Kafka, Postgres, Redis, Centrifugo, Kafka UI, and pgAdmin
- [ ] Dockerfile for NestJS Worker
- [ ] Dockerfile for Go Gateway
- [ ] Dockerfile for Admin UI
- [ ] Add app services to compose
- [ ] CI pipeline and deployment manifests

### 33. Worker Decomposition
- [ ] Split event processing, rendering, routing, and dispatch concerns as scale grows

### 34. Notification Orchestration Engine
- [ ] Add multi-step workflow support with delays and branching

---

## 🛠 Technical Debt / Refactors Completed

### ✅ R1. Replace raw inserts with Prisma `create()`
Implemented in the notification flow.

### ✅ R2. Extract shared Admin UI API config
Implemented in `admin-ui/lib/api.ts`.

### ✅ R3. Move gateway addresses behind environment variables
Implemented with local defaults in the Go gateway.

### ✅ R4. Latest template version selection per channel
Implemented in the worker before dispatch.

### ✅ R5. Error boundary support in Admin UI
Implemented through `lib/error-boundary.tsx` and layout integration.

### ✅ R6. Avoid leaking full tenant secrets through Kafka payloads
Implemented by forwarding only minimal tenant identity.

### ✅ R7. Extend gateway payload contract with `category` and `eventType`
Implemented for realtime dispatch.

---

## Implementation Priority Matrix

| Phase | Items | Target |
|-------|-------|--------|
| **Phase 1 — Production Gate** | Admin Auth (#12), Real Provider Delivery (#13), Validation Hardening (#14), Admin DLQ UI (#15) | Before production rollout |
| **Phase 2 — Reliability** | Template Dedup (#16), Unified Lifecycle (#17), Preferences (#18) | Before GA |
| **Phase 3 — Product Features** | Batch (#19), Preview (#20), Receipts (#21), Scheduling (#22) | Post-GA sprint 1 |
| **Phase 4 — Scale & Operations** | WS Naming (#23), Rendering Optimization (#24), Partitioning (#25), Analytics (#26), Audit (#27), Locale (#28), Observability (#29) | Post-GA sprint 2 |
| **Phase 5 — Expansion** | Additional Channels (#30), Import/Export (#31), CI/CD (#32) | Ongoing |
| **Phase 6 — Strategic** | Worker Decomposition (#33), Orchestration Engine (#34) | Long-term evolution |

---

## Changelog

| Date | Change |
|------|--------|
| 12 Mar 2026 | Initial roadmap created with MVP assessment |
| 15 Mar 2026 | Expanded roadmap with hardening, observability, and future architecture items |
| 17 Mar 2026 | Reconciled roadmap against the implemented platform. Marked idempotency, rate limiting, adapter registry, retry/DLQ flow, provider configs, admin APIs, and DLQ management as implemented or partially implemented where appropriate. Reprioritized remaining work around admin auth, provider completion, validation, DLQ UI, and operational readiness. |
