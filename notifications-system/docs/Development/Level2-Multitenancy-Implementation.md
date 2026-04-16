# Level 2 Multitenancy Implementation Notes

## Overview

This document explains what was implemented in the Level 2 multitenancy hardening fix.

The goal of this change set was to move the notification platform from:

- tenant-aware behavior

to:

- tenant-enforced behavior

The implementation focused on the backend first:

- schema and data ownership
- actor-aware authentication
- tenant-scoped APIs
- runtime tenant propagation
- secret handling
- auditability
- database session context and row-level security bootstrap

This work does **not** complete the full product migration. It establishes the backend foundation required for multitenant enforcement and prepares the system for later UI alignment.

## High-Level Outcome

The fix introduces five major shifts in the system:

1. Tenant-owned resources are now modeled more explicitly in the schema.
2. Platform operators and tenant admins are now distinct actor types.
3. Tenant-facing operations now have their own API namespace.
4. Kafka and Redis contracts now carry and preserve tenant context more strictly.
5. Provider secrets are no longer sent through Kafka payloads and are instead resolved in a trusted boundary at dispatch time.

## What Was Implemented

## 1. Schema Hardening

The Prisma schema was expanded to reflect the new ownership and isolation model.

### New or changed schema concepts

- Added `template_scope_enum` with:
  - `PLATFORM_DEFAULT`
  - `TENANT_OVERRIDE`
  - `TENANT_CUSTOM`
- Added `actor_type_enum` with:
  - `PLATFORM_OPERATOR`
  - `TENANT_ADMIN`
  - `SYSTEM`
- Added `tenant_admins` table for tenant-scoped human admins.
- Added `audit_logs` table for sensitive mutations and privileged activity.
- Added tenant ownership to `template_library`.
- Added tenant ownership and encrypted-secret metadata to `provider_configs`.
- Added stronger tenant-oriented indexes for templates, logs, failed notifications, and template library rows.

### Important table changes

#### `templates`

- Added `scope`.
- Preserved tenant override capability.
- Added indexes to support deterministic resolution by:
  - tenant
  - event type
  - channel
  - scope
  - active status

#### `template_library`

- Added `tenant_id`.
- Converted the library from effectively global to tenant-owned.
- Added tenant/channel index support.

#### `provider_configs`

- Added `tenant_id`.
- Replaced plaintext `api_key` usage in the schema contract with:
  - `api_key_ciphertext`
  - `api_key_last4`
  - `key_version`
  - `rotated_at`

This makes provider configuration explicitly tenant-owned and supports secret rotation and masked display.

#### `audit_logs`

Added a new table to capture:

- actor type
- actor id
- tenant id
- action
- resource type
- resource id
- trace id
- before state
- after state
- created timestamp

#### `tenant_admins`

Added a new table to support tenant-specific human admins:

- each row belongs to one tenant
- username uniqueness is enforced per tenant
- activation state is tracked

## 2. Prisma and Generated Client Updates

After the schema changes, Prisma client generation was run successfully.

This updated:

- `@prisma/client`
- generated local Prisma typings and models under `worker/generated/prisma`

These generated changes are expected and are part of the implementation.

## 3. Resource Boundary Documentation

A new resource boundary matrix was added:

- [ResourceBoundaryMatrix.md](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/docs/Development/ResourceBoundaryMatrix.md:1)

This records the intended ownership model for:

- platform-owned resources
- tenant-owned resources
- hybrid template behavior

It is the source-of-truth summary for the current multitenancy structure.

## 4. Database Bootstrap Alignment

The old bootstrap SQL in `init-db/init.sql` was no longer aligned with the worker schema.

This fix:

- regenerated the bootstrap SQL from the Prisma schema shape
- aligned bootstrap tables with the new multitenant model
- appended row-level security enablement and baseline policies

This matters because previously the bootstrap SQL could recreate a weaker, older schema that did not match the actual application model.

## 5. Migration Added for the New Model

A new Prisma migration was added:

- [20260416183000_level2_multitenancy/migration.sql](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/prisma/migrations/20260416183000_level2_multitenancy/migration.sql:1)

This migration introduces:

- new enums
- new tables
- tenant ownership columns
- indexes
- row-level security enablement
- baseline tenant isolation policies

## 6. Actor-Aware Authentication Model

The old model treated admin access as a single global role.

This fix separates actor types into:

- `platform_operator`
- `tenant_admin`

### Platform operator auth

Platform admin auth still exists, but its token role now represents `platform_operator` instead of only a generic `admin`.

Files updated include:

- [admin-auth.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/admin-auth.controller.ts:1)
- [admin-auth.guard.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/common/guards/admin-auth.guard.ts:1)

### Tenant admin auth

A new tenant-admin authentication surface was added:

- [tenant-auth.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/tenant-auth.controller.ts:1)

This adds:

- tenant-admin login
- token refresh
- self-profile endpoint

Tenant-admin JWTs now carry:

- actor role = `tenant_admin`
- `tenantId`

This is important because tenant scope must come from authentication, not from a user-selectable tenant input.

## 7. New Common Multitenancy Infrastructure

Several foundational services and types were added under `worker/src/common`.

### `actor-context.ts`

Added typed actor context structures for:

- platform operators
- tenant admins
- system/runtime actors

This gives controllers and services a common way to represent the authenticated actor.

### `db-context.service.ts`

Added a DB context helper that sets PostgreSQL session variables before running tenant-sensitive operations.

The service sets:

- `app.current_actor_type`
- `app.current_actor_id`
- `app.current_tenant_id`

This is a key building block for RLS-backed isolation.

### `audit-log.service.ts`

Added a shared service for writing audit records consistently.

This is used across admin and tenant mutations for:

- tenant creation and updates
- provider changes
- template changes
- template library mutations
- DLQ retry and purge actions

### `provider-crypto.service.ts`

Added an encryption/decryption helper for provider secrets.

Behavior:

- encrypts provider secrets before persistence
- supports decrypting later in trusted code
- masks secrets for operator and tenant-facing responses

## 8. Redis Key Hardening

Redis key patterns were updated to better reflect tenant isolation.

### Idempotency keys

Changed from a flatter convention to a tenant namespace:

- old style: `idempotency:{tenantId}:{key}`
- new style: `tenant:{tenantId}:idem:{hashedKey}`

### Tenant API key cache

The tenant pre-auth lookup remains an exception, but the raw key is no longer used as the visible cache suffix.

It now uses a hashed cache component:

- `platform:tenant_api_key:{sha256}`

### Rate limiting keys

Rate limiting keys were namespaced by tenant:

- `tenant:{tenantId}:burst`
- `tenant:{tenantId}:rate_limit:minute:{bucket}`
- `tenant:{tenantId}:rate_limit:daily:{date}`

This makes runtime state cleaner, safer, and easier to reason about during multitenant troubleshooting.

## 9. Event Ingress Hardening

The event ingestion controller was updated to carry stronger tenant runtime metadata.

Files:

- [events.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/events/events.controller.ts:1)
- [events.dto.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/common/dto/events.dto.ts:1)

### Changes made

- Added support for `eventId`.
- Added support for `traceId`.
- Preserved tenant resolution from API key authentication.
- Kept idempotency checks but now aligned them with the enriched event identity.
- Persisted Postgres idempotency records through the DB actor context helper.

### Why this matters

Every downstream message now has stronger correlation and tenant identity:

- tenant
- event
- trace

This reduces ambiguity and closes gaps where background workers might process under-scoped messages.

## 10. Realtime Token Endpoint Hardening

The realtime token endpoint was changed so tenant scope is no longer accepted as arbitrary caller input.

File:

- [auth.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/auth/auth.controller.ts:1)

### Previous behavior

- caller submitted `tenantId`
- server trusted the provided tenant id

### New behavior

Tenant resolution is derived from:

- a tenant-admin authenticated request
- or a tenant `x-api-key`

This prevents a caller from minting channels for an arbitrary tenant just by posting a different tenant id.

## 11. Platform Admin Controllers Now Run Through Actor Context

Existing platform controllers were updated to use the new DB context wrapper and audit service.

Files updated include:

- [tenants.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/tenants.controller.ts:1)
- [templates.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/templates.controller.ts:1)
- [template-library.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/template-library.controller.ts:1)
- [providers.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/providers.controller.ts:1)
- [logs.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/logs.controller.ts:1)
- [dlq.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/dlq.controller.ts:1)
- [stats.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/stats.controller.ts:1)

### Platform-side improvements

- tenant lifecycle actions now generate audit logs
- API key rotation is audited
- tenant-admin creation was added under tenant lifecycle management
- platform template creation now uses explicit scope handling
- platform template library creation now requires `tenant_id`
- provider configs are created with encryption and masked responses
- DLQ retry and purge actions are audited
- stats/log queries now execute through actor context

## 12. Tenant-Scoped API Surface Added

A new `tenant` module was introduced:

- [tenant.module.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/tenant.module.ts:1)

New controllers:

- [tenant-auth.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/tenant-auth.controller.ts:1)
- [templates.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/templates.controller.ts:1)
- [template-library.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/template-library.controller.ts:1)
- [providers.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/providers.controller.ts:1)
- [logs.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/logs.controller.ts:1)
- [dlq.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/dlq.controller.ts:1)

### Tenant API behavior

The tenant namespace now allows a tenant admin to work only inside one tenant boundary.

Implemented operations include:

- tenant auth login/refresh/me
- create and list tenant templates
- fetch tenant template versions
- deactivate tenant template versions
- create and list tenant template-library entries
- create, list, and update tenant provider configs
- list tenant logs
- list and retry tenant DLQ entries

### Key security property

Tenant APIs do not accept free-form tenant switching.

The tenant comes from the authenticated actor context.

## 13. Template Isolation and Resolution

The worker notification controller was updated to enforce a more deterministic template resolution strategy.

File:

- [notification.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/notifications/notification.controller.ts:1)

### New resolution order

For a given event:

1. `TENANT_OVERRIDE`
2. `TENANT_CUSTOM`
3. `PLATFORM_DEFAULT`

### Additional worker changes

- notification log creation now runs through tenant DB context
- in-app notification creation runs through tenant DB context
- failed notification persistence runs through tenant DB context
- dispatch payloads now include:
  - `eventId`
  - `traceId`
  - `providerConfigId`

This gives the runtime deterministic behavior and stronger tenant scoping.

## 14. Kafka Contract Hardening

Kafka dispatch contracts were updated on both the worker and gateway sides.

### Added fields

- `eventId`
- `traceId`

### Removed unsafe behavior

- raw provider API keys are no longer placed in dispatch payloads

### New dispatch linkage

Instead of sending secrets on the message, the worker now sends:

- `providerConfigId`

The gateway then resolves the provider secret itself.

## 15. Gateway Secret Resolution and Validation

The Go gateway was updated substantially.

Files:

- [main.go](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/gateway/main.go:1)
- [payload.go](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/gateway/types/payload.go:1)
- [resend.go](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/gateway/adapters/resend.go:1)

### Changes made

- Added required dispatch payload fields:
  - `eventId`
  - `traceId`
  - `providerConfigId`
- Added payload validation before processing.
- Added provider configuration hydration from Postgres.
- Added decryption of provider secrets inside the gateway.
- Updated the Resend adapter to use the resolved runtime API key instead of reading from the message payload.
- Updated Kafka keying to prefer `tenantId:eventId`.
- Updated log status writes to include tenant context and DB session settings.
- Updated retry and DLQ payloads to preserve event/trace identity.

### Why this matters

This closes one of the biggest security gaps in the original system:

- provider secrets were previously traveling through Kafka

Now the message bus carries only references and business metadata, while secrets are resolved only at the trusted dispatch boundary.

## 16. Audit Logging Coverage

Audit logs were added for a broad set of privileged actions.

Examples include:

- tenant creation
- tenant updates
- tenant deactivation
- tenant API key rotation
- tenant-admin creation
- template creation
- template activation/deactivation flows
- template-library creation
- provider-config create/update/delete
- DLQ retry and purge actions
- system-created notification log events

This gives the platform a usable trail for sensitive changes and privileged operations.

## 17. Tests Updated and Passing

The worker unit tests were updated to match the new controller constructor and request shape.

Updated test file:

- [template-library.controller.spec.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/template-library.controller.spec.ts:1)

Existing preview tests remained valid:

- [template-preview.controller.spec.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/template-preview.controller.spec.ts:1)

## Verification Performed

The following commands were run successfully:

### Worker

```bash
npx prisma generate --schema prisma/schema.prisma
npm run build
npm test -- --runInBand
```

### Gateway

```bash
GOCACHE=/tmp/go-build go build ./...
```

## What This Fix Does Not Fully Finish

This fix establishes the backend enforcement layer, but some work remains outside this change set.

### Admin UI alignment

The current `admin-ui` was **not** fully rewritten to match all backend contract changes.

Potential follow-up areas:

- any provider forms that still assume plaintext `api_key` round-tripping
- any template-library forms that do not yet send explicit tenant ownership
- any auth screens that still assume a single admin role

### Data backfill and live migration concerns

The migration includes structural changes, but production data migration strategy may still need explicit handling for:

- existing provider configs that contain plaintext secrets
- existing template-library rows without tenant ownership
- template rows that need scope normalization
- existing logs or templates created from the old bootstrap schema

### RLS production rollout caution

RLS bootstrap and policies were added to the SQL artifacts, but production rollout should still be done carefully with validation in staging because RLS can break older code paths if any remaining query path does not set session context correctly.

## Summary of the Fix

In practical terms, this implementation delivered:

- a stronger tenant-aware schema
- explicit tenant ownership for template library and provider configs
- actor-aware auth separation between platform operators and tenant admins
- tenant-scoped API routes
- deterministic template resolution
- encrypted provider secret storage
- secret resolution inside the gateway instead of on Kafka
- stronger Kafka runtime metadata with event and trace identity
- tenant namespaced Redis keys
- audit logs for privileged and sensitive actions
- DB session context plumbing for RLS-backed isolation
- aligned bootstrap SQL and migration artifacts

This is the foundational backend step needed to support Level 2 multitenancy in a way that is enforceable rather than convention-based.
