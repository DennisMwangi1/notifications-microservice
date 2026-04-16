# Level 2 Resource Boundary Matrix

| Resource | Scope | Editable By | Visible To |
| --- | --- | --- | --- |
| Platform operators | Platform-owned | Platform operators | Platform operators |
| Tenant registry (`tenants`) | Platform-owned | Platform operators | Platform operators |
| Tenant admins (`tenant_admins`) | Tenant-owned | Platform operators, tenant lifecycle automation | Platform operators, owning tenant |
| Templates (`templates`) | Hybrid | Platform operators for `PLATFORM_DEFAULT`, tenant admins for tenant scopes | Runtime, platform operators, owning tenant |
| Template library (`template_library`) | Tenant-owned | Tenant admins | Platform operators, owning tenant |
| Provider configs (`provider_configs`) | Tenant-owned | Tenant admins, platform operators for ops intervention | Platform operators, owning tenant, runtime |
| Notification logs (`notification_logs`) | Tenant-owned | System runtime | Platform operators, owning tenant |
| In-app notifications (`in_app_notifications`) | Tenant-owned | System runtime | Platform operators, owning tenant |
| Processed events (`processed_events`) | Tenant-owned | System runtime | Platform operators, owning tenant |
| Failed notifications (`failed_notifications`) | Tenant-owned | System runtime, retry actions by tenant/admin actors | Platform operators, owning tenant |
| Audit logs (`audit_logs`) | Tenant-owned with platform visibility | System runtime, platform operators, tenant admins on own resources | Platform operators, owning tenant |
| Provider adapter catalog | Platform-owned | Platform operators, codebase maintainers | Runtime, platform operators |

## Rules

- Tenant admins never switch tenants. Every tenant-facing route derives scope from the authenticated `tenantId`.
- `PLATFORM_DEFAULT` templates are the only platform-managed content artifact in the notification path.
- Template library entries are tenant-scoped and must carry `tenant_id`.
- Provider secrets must be encrypted at rest and never placed on Kafka payloads.
- Tenant-owned tables must be protected by PostgreSQL row-level security keyed off `app.current_tenant_id`.
