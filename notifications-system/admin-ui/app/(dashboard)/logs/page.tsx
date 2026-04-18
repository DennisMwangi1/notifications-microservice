'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import {
  EmptyPanel,
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

interface NotificationLog {
  notification_id: string;
  tenant_id: string;
  user_id: string | null;
  template_id: string;
  channel: string;
  status: string;
  metadata: Record<string, unknown> | null;
  provider_ref: string | null;
  sent_at: string | null;
  error_details: string | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Pending';
}

function statusTone(
  status: string,
): 'default' | 'success' | 'warning' | 'danger' | 'indigo' {
  if (status === 'DELIVERED' || status === 'SENT') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RETRYING' || status === 'PENDING') return 'warning';
  return 'default';
}

export default function LogsPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterTenant, setFilterTenant] = useState(searchParams.get('tenantId') || '');
  const [filterChannel, setFilterChannel] = useState(searchParams.get('channel') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterProviderRef, setFilterProviderRef] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  async function fetchTenants() {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  }

  async function fetchLogs(page: number) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (filterTenant) params.set('tenantId', filterTenant);
    if (filterChannel) params.set('channel', filterChannel);
    if (filterStatus) params.set('status', filterStatus);
    if (filterProviderRef) params.set('providerRef', filterProviderRef);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await apiFetch<NotificationLog[]>(
      `/api/v1/admin/logs?${params.toString()}`,
    );
    if (response.success) {
      setLogs(response.data || []);
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
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchTenants();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLogs(1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [filterTenant, filterChannel, filterStatus, filterProviderRef, from, to]);

  const clearFilters = () => {
    setFilterTenant('');
    setFilterChannel('');
    setFilterStatus('');
    setFilterProviderRef('');
    setFrom('');
    setTo('');
  };

  const failedCount = logs.filter((log) => log.status === 'FAILED').length;
  const retryingCount = logs.filter((log) => log.status === 'RETRYING').length;
  const pendingCount = logs.filter((log) => log.status === 'PENDING').length;

  return (
    <div className="mx-auto max-w-[1650px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Runtime Diagnostics"
        title="Cross-Tenant Event Logs"
        description="Investigate notification delivery across tenants, channels, provider references, and time windows from a single diagnostic workspace."
        chips={
          <>
            <StatusBadge tone="indigo">{pagination.total} matching records</StatusBadge>
            <StatusBadge tone={failedCount > 0 ? 'danger' : 'success'}>
              Failed in view {failedCount}
            </StatusBadge>
            <StatusBadge tone={retryingCount > 0 ? 'warning' : 'default'}>
              Retrying {retryingCount}
            </StatusBadge>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Current Page"
          value={pagination.page}
          detail={`Page size ${pagination.limit} records`}
          tone="indigo"
        />
        <MetricTile
          label="Failed Events"
          value={failedCount}
          detail="Failed notifications visible in the current result set."
          tone={failedCount > 0 ? 'danger' : 'success'}
        />
        <MetricTile
          label="Retrying Events"
          value={retryingCount}
          detail="Entries currently marked for retry orchestration."
          tone={retryingCount > 0 ? 'warning' : 'success'}
        />
        <MetricTile
          label="Pending Events"
          value={pendingCount}
          detail="Events still waiting for a delivery outcome."
          tone={pendingCount > 0 ? 'warning' : 'default'}
        />
      </section>

      <Surface
        title="Filter Rail"
        description="Constrain the diagnostic window by tenant, channel, delivery state, provider reference, and timestamp range."
        action={
          <button
            onClick={clearFilters}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
          >
            Clear filters
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={filterTenant}
            onChange={(event) => setFilterTenant(event.target.value)}
            className={controlInputClassName}
          >
            <option value="">All tenants</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
          <select
            value={filterChannel}
            onChange={(event) => setFilterChannel(event.target.value)}
            className={controlInputClassName}
          >
            <option value="">All channels</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">PUSH</option>
          </select>
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className={controlInputClassName}
          >
            <option value="">All statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="SENT">SENT</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED">FAILED</option>
            <option value="RETRYING">RETRYING</option>
          </select>
          <input
            value={filterProviderRef}
            onChange={(event) => setFilterProviderRef(event.target.value)}
            className={controlInputClassName}
            placeholder="Provider reference"
          />
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={controlInputClassName}
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={controlInputClassName}
          />
        </div>
      </Surface>

      <Surface
        title="Delivery Event Table"
        description="Expandable event rows with tenant, template, provider, and payload details for incident investigation."
        bodyClassName="p-0"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          <p>
            Showing {logs.length} records from {pagination.total} total matches
          </p>
          <p>
            Page {pagination.page} of {pagination.totalPages || 1}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 p-5 animate-pulse">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="h-16 rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-5">
            <EmptyPanel
              title="No matching events"
              description="No notification log entries match the current filter rail."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[1100px] grid-cols-[110px_140px_1.4fr_1.1fr_1fr_180px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <div>Channel</div>
              <div>Status</div>
              <div>Notification</div>
              <div>Tenant</div>
              <div>Provider Ref</div>
              <div>Timestamp</div>
            </div>

            {logs.map((log) => {
              const isExpanded = expandedLog === log.notification_id;

              return (
                <div key={log.notification_id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    onClick={() =>
                      setExpandedLog(isExpanded ? null : log.notification_id)
                    }
                    className="grid min-w-[1100px] grid-cols-[110px_140px_1.4fr_1.1fr_1fr_180px] gap-3 px-5 py-4 text-left text-sm transition hover:bg-slate-50"
                  >
                    <div className="font-semibold text-slate-900">{log.channel}</div>
                    <div>
                      <StatusBadge tone={statusTone(log.status)}>
                        {log.status}
                      </StatusBadge>
                    </div>
                    <div>
                      <p className="truncate font-mono text-xs text-slate-700">
                        {log.notification_id}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        Template {log.template_id}
                      </p>
                    </div>
                    <div className="font-mono text-xs text-slate-600">
                      {log.tenant_id}
                    </div>
                    <div className="truncate font-mono text-xs text-slate-500">
                      {log.provider_ref || 'No provider ref'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(log.sent_at)}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="grid gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Routing Context
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          <p>
                            <span className="font-semibold text-slate-800">Tenant</span>{' '}
                            {log.tenant_id}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-800">
                              Template
                            </span>{' '}
                            {log.template_id}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-800">User</span>{' '}
                            {log.user_id || 'System'}
                          </p>
                          <p>
                            <span className="font-semibold text-slate-800">
                              Provider Ref
                            </span>{' '}
                            {log.provider_ref || 'None'}
                          </p>
                        </div>
                      </div>

                      <div
                        className={cx(
                          'rounded-xl border px-4 py-3',
                          log.error_details
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-white',
                        )}
                      >
                        <p
                          className={cx(
                            'text-[11px] font-semibold uppercase tracking-[0.18em]',
                            log.error_details ? 'text-rose-700' : 'text-slate-500',
                          )}
                        >
                          Error State
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {log.error_details || 'No error details recorded for this event.'}
                        </p>
                      </div>

                      <div className="lg:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Metadata Payload
                        </p>
                        <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-200">
                          {log.metadata
                            ? JSON.stringify(log.metadata, null, 2)
                            : 'No metadata attached to this event.'}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
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
