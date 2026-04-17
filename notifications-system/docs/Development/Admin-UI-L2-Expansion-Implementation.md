# Admin UI Level 2 Expansion Notes

## Overview

This document explains what was implemented for the Level 2 admin application expansion.

The goal of this change set was to move the frontend from:

- one shared platform-style admin surface

to:

- two distinct application experiences inside the same Next.js app:
  - a platform-operator console
  - a tenant-admin console

This work also added the backend contracts required for those UI flows to function end to end.

The most important product outcomes are:

1. Platform operators can now provision tenants together with the first tenant admin.
2. Tenant admins now have their own authenticated UI surface under `/tenant/*`.
3. Platform and tenant sessions are now stored and enforced separately in the frontend.
4. Tenant-admin onboarding now includes temporary credentials, welcome status tracking, and forced password reset support.
5. Platform-owned operational email delivery now exists for onboarding flows without weakening tenant ownership of regular provider configs.

## High-Level Outcome

The admin application is no longer modeled as one generic administrator dashboard.

Instead, it now supports two actor-specific experiences:

### Platform operator console

The root application remains the platform surface and is now focused more clearly on:

- tenant provisioning
- operational oversight
- logs
- DLQ management
- operational mailer configuration

### Tenant admin console

A new tenant-facing route group was added:

- `/tenant/login`
- `/tenant`
- `/tenant/templates`
- `/tenant/template-library`
- `/tenant/providers`
- `/tenant/logs`
- `/tenant/dlq`
- `/tenant/account`

This gives tenant admins a dedicated interface for day-to-day tenant content and delivery management.

## What Was Implemented

## 1. Platform Operator UI Realignment

The platform shell in [layout.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/(dashboard)/layout.tsx:1) was updated so the primary navigation and language reflect platform operations more clearly.

### Key changes

- Renamed the platform framing from a generic administrator experience to a `Platform Operator` experience.
- Added a new `Operational Mailer` route in the primary platform navigation.
- Kept template-library and playground pages in place, but they are no longer the main structural focus of the platform shell.
- Preserved the existing platform routes so this milestone did not require a disruptive route migration.

## 2. Platform Tenant Provisioning Flow

The tenant page in [tenants/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/(dashboard)/tenants/page.tsx:1) was rewritten around lifecycle provisioning rather than the earlier “projects” framing.

### The new tenant provisioning flow now collects

- tenant name
- allowed channels
- sender defaults
- tenant rate limit settings
- tenant daily cap
- first tenant-admin username
- first tenant-admin email
- optional display name

### The platform UI now supports

- creating a tenant and first tenant admin in one action
- showing the one-time temporary password after provisioning
- showing onboarding delivery status
- listing tenant admins for a tenant
- resending onboarding for a tenant admin
- regenerating a tenant admin temporary password

This makes the platform console responsible for tenant lifecycle bootstrap rather than only tenant record creation.

## 3. Operational Mailer UI

A new platform route was added:

- [mail/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/(dashboard)/mail/page.tsx:1)

This page manages a narrow platform-owned mail capability used for onboarding and operational communication.

### The page now supports

- operational mailer provider selection
- encrypted API key configuration
- sender identity configuration
- activation/deactivation of the mailer
- editing the tenant-admin welcome template
- storing sample data for preview
- previewing the MJML + Handlebars onboarding email

This keeps platform email responsibility intentionally narrow and avoids turning platform mail into a full shared tenant content system.

## 4. Shared Frontend Auth Split

The frontend auth layer was expanded in:

- [auth.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/lib/auth.ts:1)
- [auth-provider.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/lib/auth-provider.tsx:1)
- [api.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/lib/api.ts:1)

### What changed

- Platform and tenant sessions now use separate storage keys.
- Platform and tenant auth helpers are now distinct.
- A dedicated `tenantApiFetch` helper was added.
- A dedicated `TenantAuthProvider` was added for `/tenant/*`.
- Platform routes no longer treat a tenant token as valid.
- Tenant routes no longer treat a platform token as valid.
- Tenant routes enforce the first-login password reset state in the UI.

This was necessary to stop the shared frontend from behaving like a single-role application.

## 5. Tenant Login and Account Flow

The tenant login flow was added in:

- [tenant/login/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/login/page.tsx:1)

The tenant account and password-reset surface was added in:

- [tenant/account/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/account/page.tsx:1)

### The tenant login flow now supports

- tenant-admin login through `/api/v1/tenant/auth/login`
- storing tenant-admin identity separately from platform identity
- redirecting a tenant admin into the forced reset flow when `mustResetPassword` is true

### The tenant account page now supports

- showing current tenant-admin identity
- forced first-login password reset
- normal password change after onboarding
- persisting the updated `mustResetPassword` state back into frontend session storage

## 6. Tenant Console Shell

A new tenant console layout was added in:

- [tenant/(console)/layout.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/layout.tsx:1)

### Tenant navigation now includes

- overview
- templates
- template library
- providers
- logs
- DLQ
- account

This shell intentionally differs from the platform sidebar so the tenant user sees a single-tenant operations workspace, not a platform operator dashboard.

## 7. Tenant Dashboard

A tenant dashboard home page was added in:

- [tenant/(console)/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/page.tsx:1)

### It now surfaces

- current tenant identity
- provider count
- template count
- DLQ count
- recent tenant delivery activity
- current password-reset state

This gives the tenant admin an immediate operational overview without requiring cross-tenant context.

## 8. Tenant Templates UI

A tenant template management page was added in:

- [tenant/(console)/templates/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/templates/page.tsx:1)

### It now supports

- creating tenant templates
- selecting `TENANT_CUSTOM` or `TENANT_OVERRIDE`
- viewing latest template state
- opening version history
- deactivating active versions

The page calls only tenant-scoped APIs and does not expose tenant selectors.

## 9. Tenant Template Library UI

A tenant template-library page was added in:

- [tenant/(console)/template-library/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/template-library/page.tsx:1)

### It now supports

- listing tenant template-library entries
- creating new entries
- viewing saved content and sample data

This matches the Level 2 decision that the template library is tenant-scoped.

## 10. Tenant Providers UI

A tenant provider page was added in:

- [tenant/(console)/providers/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/providers/page.tsx:1)

### It now supports

- listing tenant-owned provider configs
- creating tenant-owned provider configs
- editing sender defaults
- rotating credentials by updating the stored API key

This aligns the frontend with the backend change that `provider_configs` are tenant-owned rather than globally shared.

## 11. Tenant Logs and DLQ UI

Two tenant operational pages were added:

- [tenant/(console)/logs/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/logs/page.tsx:1)
- [tenant/(console)/dlq/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/tenant/(console)/dlq/page.tsx:1)

### Tenant logs page

It now supports:

- filtering by channel
- filtering by status
- viewing tenant-scoped notification log entries
- surfacing provider references and error details

### Tenant DLQ page

It now supports:

- listing tenant-scoped DLQ entries
- inspecting failed payloads
- retrying a failed notification from the tenant console

## 12. Backend Support Added Specifically for the Admin App

Although the request focused on the admin application, several backend additions were required so the new UI flows could function.

### Schema changes

The Prisma schema in [schema.prisma](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/prisma/schema.prisma:1) was extended with:

- new tenant-admin fields:
  - `email`
  - `display_name`
  - `must_reset_password`
  - `password_set_at`
  - `welcome_sent_at`
  - `welcome_delivery_status`
  - `welcome_delivery_error`
- a new `operational_mailer_configs` table
- a new `operational_email_templates` table

### Migration and bootstrap alignment

This was reflected in:

- [20260416193000_l2_ui_admin_console/migration.sql](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/prisma/migrations/20260416193000_l2_ui_admin_console/migration.sql:1)
- [init.sql](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/init-db/init.sql:1)

### New supporting services

- [tenant-admin-credentials.service.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/common/tenant-admin-credentials.service.ts:1)
  - password hashing
  - password verification
  - temporary password generation

- [operational-mailer.service.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/common/operational-mailer.service.ts:1)
  - operational mailer config lookup
  - onboarding template lookup/bootstrap
  - onboarding email preview
  - onboarding email send attempts

### Updated platform tenant lifecycle controller

[tenants.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/tenants.controller.ts:1) now supports:

- tenant + first tenant-admin provisioning in one request
- tenant-admin listing for a tenant
- temporary password reset for a tenant admin
- onboarding resend for a tenant admin
- onboarding status persistence

### Updated tenant auth controller

[tenant-auth.controller.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/tenant/tenant-auth.controller.ts:1) now supports:

- enriched tenant-admin login payloads
- `mustResetPassword` in auth responses
- `email` and `displayName` in `me`
- password change endpoint for first-login and later account updates

### Updated admin module wiring

[admin.module.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/admin/admin.module.ts:1) and [app.module.ts](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/worker/src/app.module.ts:1) were updated so the new controllers and services are available to the application.

## 13. Login and Root App Adjustments

The platform login page in [login/page.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/login/page.tsx:1) was updated to:

- describe the platform console more accurately
- point tenant admins toward `/tenant/login`

The root application layout in [app/layout.tsx](/home/mwangii/Code/Micoroservices-personal/notifications-microservice/notifications-system/admin-ui/app/layout.tsx:1) was also simplified to avoid reliance on a Google-hosted font during builds in restricted environments.

## Verification

The following checks were run successfully after implementation:

- `notifications-system/worker`
  - `npx prisma generate`
  - `npm run build`
- `notifications-system/admin-ui`
  - `npx tsc --noEmit`
  - `npx next build --webpack`

These checks confirm that:

- the Prisma client matches the updated schema
- backend TypeScript compiles
- frontend TypeScript compiles
- the application routes can be built in production mode

## Current Limitations / Follow-Up Areas

This implementation establishes the admin application structure, but some follow-up refinement is still expected later.

### Deferred or intentionally limited items

- The existing platform template library and playground remain in place and were not comprehensively redesigned in this milestone.
- The onboarding email flow depends on a configured operational mailer; if the mailer is absent or inactive, provisioning still succeeds but onboarding delivery is skipped or marked failed.
- The tenant login model remains username-based for now even though email is now required for provisioning and onboarding.
- The tenant console is intentionally focused on the existing tenant APIs and does not introduce additional cross-tenant or billing features.

## Summary

The admin application is now materially closer to the Level 2 multitenancy model.

The key improvements are:

- a platform-operator console that can perform tenant lifecycle bootstrap properly
- a dedicated tenant-admin console with tenant-only navigation and auth
- split frontend sessions for platform vs tenant actors
- first-login password reset support
- operational onboarding email support without weakening tenant provider ownership

This closes the largest gap between the Level 2 backend isolation work and the frontend experience that operators and tenant admins use every day.
