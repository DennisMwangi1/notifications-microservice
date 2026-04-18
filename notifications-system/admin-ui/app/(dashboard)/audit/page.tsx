'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import {
  EmptyPanel,
  JsonBlock,
  KeyValueGrid,
  MetricTile,
  PageHeader,
  StatusBadge,
  Surface,
  controlInputClassName,
  cx,
} from '../../../lib/operator-console';

interface Tenant {
  id: string;
  name: string;
}

interface AuditLog {
  id: string;
  actor_type: 'PLATFORM_OPERATOR' | 'TENANT_ADMIN' | 'SYSTEM';
  actor_id: string;
  tenant_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  trace_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function actorTone(
  actorType: AuditLog['actor_type'],
): 'default' | 'success' | 'warning' | 'danger' | 'indigo' {
  if (actorType === 'PLATFORM_OPERATOR') return 'indigo';
  if (actorType === 'TENANT_ADMIN') return 'warning';
  return 'default';
}

function actorLabel(actorType: AuditLog['actor_type']) {
  if (actorType === 'PLATFORM_OPERATOR') return 'Platform operator';
  if (actorType === 'TENANT_ADMIN') return 'Tenant admin';
  return 'System';
}

function formatToken(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function compactValue(value: string | null, fallback = 'Not recorded') {
  if (!value) return fallback;
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getChangedKeys(
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
) {
  if (!isRecord(beforeState) && !isRecord(afterState)) return [];

  const keys = new Set([
    ...Object.keys(beforeState || {}),
    ...Object.keys(afterState || {}),
  ]);

  return [...keys].filter((key) => {
    const beforeValue = beforeState?.[key] ?? null;
    const afterValue = afterState?.[key] ?? null;
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function GuideItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export default function AuditPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [actorType, setActorType] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  }, []);

  const fetchLogs = useCallback(async (page: number) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '25',
    });

    if (tenantId) params.set('tenantId', tenantId);
    if (actorType) params.set('actorType', actorType);
    if (resourceType) params.set('resourceType', resourceType);
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await apiFetch<AuditLog[]>(
      `/api/v1/admin/audit-logs?${params.toString()}`,
    );

    if (response.success) {
      const nextLogs = response.data || [];
      setLogs(nextLogs);
      setExpandedLogId((current) =>
        nextLogs.some((log) => log.id === current) ? current : null,
      );
      setPagination(
        (response.pagination as Pagination) || {
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
        },
      );
    }

    setLoading(false);
  }, [action, actorType, from, resourceType, tenantId, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTenants();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchTenants]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLogs(1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchLogs]);

  const clearFilters = () => {
    setTenantId('');
    setActorType('');
    setResourceType('');
    setAction('');
    setFrom('');
    setTo('');
    setExpandedLogId(null);
  };

  const findTenantName = (id: string | null) =>
    tenants.find((tenant) => tenant.id === id)?.name || id || 'Cross-tenant scope';

  const operatorActions = logs.filter(
    (log) => log.actor_type === 'PLATFORM_OPERATOR',
  ).length;
  const tenantAdminActions = logs.filter(
    (log) => log.actor_type === 'TENANT_ADMIN',
  ).length;
  const systemActions = logs.filter((log) => log.actor_type === 'SYSTEM').length;

  const activeFilters = [
    tenantId ? `Tenant: ${findTenantName(tenantId)}` : null,
    actorType ? `Actor: ${actorLabel(actorType as AuditLog['actor_type'])}` : null,
    resourceType ? `Resource: ${resourceType}` : null,
    action ? `Action: ${action}` : null,
    from ? `From: ${formatDateTime(from)}` : null,
    to ? `To: ${formatDateTime(to)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-[1650px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Governance Trail"
        title="Audit & Access Trace"
        description="Review operator interventions, tenant-admin changes, and system activity from a scan-first audit workspace built for investigations and governance reviews."
        chips={
          <>
            <StatusBadge tone="indigo">{pagination.total} matching entries</StatusBadge>
            <StatusBadge tone={activeFilters.length > 0 ? 'warning' : 'success'}>
              Active filters {activeFilters.length}
            </StatusBadge>
            <StatusBadge tone={operatorActions > 0 ? 'indigo' : 'default'}>
              Operator actions {operatorActions}
            </StatusBadge>
            <StatusBadge tone={tenantAdminActions > 0 ? 'warning' : 'default'}>
              Tenant-admin actions {tenantAdminActions}
            </StatusBadge>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Visible Entries"
          value={logs.length}
          detail="Rows currently loaded into the audit workspace."
          tone="indigo"
        />
        <MetricTile
          label="Operator Actions"
          value={operatorActions}
          detail="Platform-level interventions in the visible result set."
          tone={operatorActions > 0 ? 'indigo' : 'default'}
        />
        <MetricTile
          label="Tenant Admin Actions"
          value={tenantAdminActions}
          detail="Tenant-scoped administrative changes in the current page."
          tone={tenantAdminActions > 0 ? 'warning' : 'default'}
        />
        <MetricTile
          label="System Actions"
          value={systemActions}
          detail="Automated service activity recorded alongside human actions."
          tone={systemActions > 0 ? 'default' : 'success'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px]">
        <Surface
          title="Filter audit trail"
          description="Narrow the result set by tenant scope, actor type, resource type, action text, and time window."
          action={
            <button
              onClick={clearFilters}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
            >
              Clear filters
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FilterField label="Tenant scope">
              <select
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
                className={controlInputClassName}
              >
                <option value="">All tenants</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Actor type">
              <select
                value={actorType}
                onChange={(event) => setActorType(event.target.value)}
                className={controlInputClassName}
              >
                <option value="">All actors</option>
                <option value="PLATFORM_OPERATOR">Platform operator</option>
                <option value="TENANT_ADMIN">Tenant admin</option>
                <option value="SYSTEM">System</option>
              </select>
            </FilterField>

            <FilterField label="Resource type">
              <input
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
                className={controlInputClassName}
                placeholder="Template, provider, tenant..."
              />
            </FilterField>

            <FilterField label="Action contains">
              <input
                value={action}
                onChange={(event) => setAction(event.target.value)}
                className={controlInputClassName}
                placeholder="created, updated, rotated..."
              />
            </FilterField>

            <FilterField label="From time">
              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={controlInputClassName}
              />
            </FilterField>

            <FilterField label="To time">
              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className={controlInputClassName}
              />
            </FilterField>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Current query
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Showing page {pagination.page} of {pagination.totalPages || 1} with{' '}
                  {pagination.total} total matching audit entries.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeFilters.length > 0 ? (
                  activeFilters.map((filter) => (
                    <StatusBadge key={filter} tone="default">
                      {filter}
                    </StatusBadge>
                  ))
                ) : (
                  <StatusBadge tone="success">No filters applied</StatusBadge>
                )}
              </div>
            </div>
          </div>
        </Surface>

        <Surface
          title="How to read this view"
          description="The audit page now separates fast scanning from deep inspection."
        >
          <div className="space-y-3">
            <GuideItem
              title="Scan the summary row first"
              description="Each row surfaces actor, action, tenant scope, and changed-field count before you ever open the payload."
            />
            <GuideItem
              title="Expand only what matters"
              description="State snapshots stay collapsed until selected so long JSON blocks no longer compete with the main event list."
            />
            <GuideItem
              title="Use changed fields to prioritize"
              description="Rows with more changed keys are easier to spot, which helps during policy reviews and incident response."
            />
          </div>
        </Surface>
      </section>

      <Surface
        title="Audit activity"
        description="Each row summarizes who acted, what changed, and when it happened. Expand a row to inspect the before and after snapshots."
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-600">
              Showing {logs.length} entries from {pagination.total} total matches
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Page {pagination.page} of {pagination.totalPages || 1}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="indigo">Page size {pagination.limit}</StatusBadge>
            <StatusBadge tone={systemActions > 0 ? 'default' : 'success'}>
              System activity {systemActions}
            </StatusBadge>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5 animate-pulse">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-5">
            <EmptyPanel
              title="No matching audit records"
              description="No audit entries match the current filter settings."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const changedKeys = getChangedKeys(log.before_state, log.after_state);
              const isExpanded = expandedLogId === log.id;
              const tenantName = findTenantName(log.tenant_id);
              const resourceLabel = formatToken(log.resource_type);
              const actionLabel = formatToken(log.action);
              const changeSummary =
                changedKeys.length > 0
                  ? `${changedKeys.length} changed field${
                      changedKeys.length === 1 ? '' : 's'
                    }`
                  : log.before_state || log.after_state
                    ? 'Snapshot recorded'
                    : 'No state snapshot';

              return (
                <article
                  key={log.id}
                  className={cx(isExpanded && 'bg-slate-50/70')}
                >
                  <button
                    onClick={() =>
                      setExpandedLogId(isExpanded ? null : log.id)
                    }
                    className="w-full px-5 py-5 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={actorTone(log.actor_type)}>
                            {actorLabel(log.actor_type)}
                          </StatusBadge>
                          <StatusBadge tone="default">{actionLabel}</StatusBadge>
                          <StatusBadge
                            tone={changedKeys.length > 0 ? 'indigo' : 'default'}
                          >
                            {changeSummary}
                          </StatusBadge>
                        </div>

                        <div className="space-y-1">
                          <p className="text-base font-semibold text-slate-950">
                            {actorLabel(log.actor_type)} performed{' '}
                            {actionLabel.toLowerCase()} on{' '}
                            {resourceLabel.toLowerCase()}
                          </p>
                          <p className="text-sm leading-6 text-slate-500">
                            Tenant scope {tenantName}. Resource ID{' '}
                            {compactValue(log.resource_id)}. Actor ID{' '}
                            {compactValue(log.actor_id)}.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            Resource {resourceLabel}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            Tenant {tenantName}
                          </span>
                          {log.trace_id ? (
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-medium text-slate-600">
                              Trace {compactValue(log.trace_id)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 xl:flex-col xl:items-end">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Recorded
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-700">
                            {formatDateTime(log.created_at)}
                          </p>
                        </div>

                        <span
                          className={cx(
                            'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition',
                            isExpanded && 'rotate-180',
                          )}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m6 9 6 6 6-6"
                            />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="grid gap-4 border-t border-slate-200 bg-white px-5 py-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Event context
                          </p>
                          <div className="mt-3">
                            <KeyValueGrid
                              columns={2}
                              items={[
                                {
                                  label: 'Actor',
                                  value: actorLabel(log.actor_type),
                                },
                                {
                                  label: 'Action',
                                  value: actionLabel,
                                },
                                {
                                  label: 'Resource',
                                  value: resourceLabel,
                                },
                                {
                                  label: 'Tenant',
                                  value: tenantName,
                                },
                                {
                                  label: 'Resource ID',
                                  value: (
                                    <span className="font-mono text-xs">
                                      {log.resource_id || 'Not recorded'}
                                    </span>
                                  ),
                                },
                                {
                                  label: 'Trace ID',
                                  value: (
                                    <span className="font-mono text-xs">
                                      {log.trace_id || 'Not recorded'}
                                    </span>
                                  ),
                                },
                              ]}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Changed fields
                          </p>
                          {changedKeys.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {changedKeys.map((key) => (
                                <span
                                  key={key}
                                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                                >
                                  {key}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm leading-6 text-slate-500">
                              No top-level field delta was detected. This can happen
                              when the entry records a snapshot without a direct field
                              comparison.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Before state
                          </p>
                          <JsonBlock
                            value={log.before_state}
                            emptyLabel="No before-state recorded."
                            className="mt-3"
                          />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            After state
                          </p>
                          <JsonBlock
                            value={log.after_state}
                            emptyLabel="No after-state recorded."
                            className="mt-3"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
            <button
              onClick={() => void fetchLogs(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                void fetchLogs(Math.min(pagination.totalPages, pagination.page + 1))
              }
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
