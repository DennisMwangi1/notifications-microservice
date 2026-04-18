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
  dangerButtonClassName,
  secondaryButtonClassName,
} from '../../../lib/operator-console';

interface Tenant {
  id: string;
  name: string;
}

interface DLQEntry {
  id: string;
  notification_id: string;
  tenant_id: string;
  channel: string;
  payload: Record<string, unknown>;
  error_details: string;
  retry_count: number;
  max_retries: number;
  permanently_failed: boolean;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function DLQPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState(searchParams.get('tenantId') || '');
  const [channel, setChannel] = useState('');
  const [filter, setFilter] = useState<'all' | 'permanent' | 'retryable'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  async function fetchTenants() {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  }

  async function fetchEntries() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (tenantId) params.set('tenantId', tenantId);
    if (channel) params.set('channel', channel);
    if (filter === 'permanent') params.set('permanentlyFailed', 'true');
    if (filter === 'retryable') params.set('permanentlyFailed', 'false');
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const response = await apiFetch<DLQEntry[]>(
      `/api/v1/admin/dlq?${params.toString()}`,
    );
    if (response.success) {
      setEntries(response.data || []);
      setPagination((response.pagination as Pagination) || null);
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
      void fetchEntries();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [page, filter, tenantId, channel, from, to]);

  const askReason = (label: string) => {
    const reason = window.prompt(`Reason for ${label.toLowerCase()}:`);
    return reason?.trim() || null;
  };

  const handleRetry = async (id: string) => {
    const reason = askReason('retrying this DLQ entry');
    if (!reason) return;

    setActionLoading(id);
    await apiFetch(`/api/v1/admin/dlq/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setActionLoading(null);
    await fetchEntries();
  };

  const handleRetryAll = async () => {
    const reason = askReason('retrying all selected DLQ entries');
    if (!reason) return;

    setActionLoading('retry-all');
    await apiFetch('/api/v1/admin/dlq/retry-all', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setActionLoading(null);
    await fetchEntries();
  };

  const handlePurge = async (id: string) => {
    const reason = askReason('purging this DLQ entry');
    if (!reason) return;

    setActionLoading(id);
    await apiFetch(`/api/v1/admin/dlq/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
    setSelectedEntry(null);
    setActionLoading(null);
    await fetchEntries();
  };

  const clearFilters = () => {
    setTenantId('');
    setChannel('');
    setFilter('all');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const permanentCount = entries.filter((entry) => entry.permanently_failed).length;
  const retryableCount = entries.length - permanentCount;

  return (
    <div className="mx-auto max-w-[1650px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Recovery Queue"
        title="Dead-Letter Queue"
        description="Review failed notification deliveries, inspect payloads, and execute audited retry or purge actions across tenants."
        chips={
          <>
            <StatusBadge tone={entries.length > 0 ? 'warning' : 'success'}>
              Visible queue {entries.length}
            </StatusBadge>
            <StatusBadge tone={permanentCount > 0 ? 'danger' : 'default'}>
              Permanent {permanentCount}
            </StatusBadge>
            <StatusBadge tone={retryableCount > 0 ? 'warning' : 'success'}>
              Retryable {retryableCount}
            </StatusBadge>
          </>
        }
        actions={
          <button
            onClick={() => void handleRetryAll()}
            disabled={actionLoading === 'retry-all' || entries.length === 0}
            className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {actionLoading === 'retry-all' ? 'Retrying filtered queue...' : 'Retry filtered queue'}
          </button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Visible Entries"
          value={entries.length}
          detail="Entries currently loaded into the operator view."
          tone={entries.length > 0 ? 'warning' : 'success'}
        />
        <MetricTile
          label="Permanent Failures"
          value={permanentCount}
          detail="Entries that have exhausted retries and require manual handling."
          tone={permanentCount > 0 ? 'danger' : 'success'}
        />
        <MetricTile
          label="Retryable Entries"
          value={retryableCount}
          detail="Entries still eligible for replay through recovery actions."
          tone={retryableCount > 0 ? 'warning' : 'success'}
        />
        <MetricTile
          label="Result Pages"
          value={pagination?.pages || 1}
          detail={`Page ${pagination?.page || page} of the filtered DLQ result set.`}
          tone="indigo"
        />
      </section>

      <Surface
        title="Filter Rail"
        description="Constrain the dead-letter queue by tenant, channel, failure state, and event window."
        action={
          <button
            onClick={clearFilters}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
          >
            Clear filters
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={tenantId}
            onChange={(event) => {
              setTenantId(event.target.value);
              setPage(1);
            }}
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
            value={channel}
            onChange={(event) => {
              setChannel(event.target.value);
              setPage(1);
            }}
            className={controlInputClassName}
          >
            <option value="">All channels</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">PUSH</option>
          </select>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as 'all' | 'permanent' | 'retryable');
              setPage(1);
            }}
            className={controlInputClassName}
          >
            <option value="all">All states</option>
            <option value="permanent">Permanently failed</option>
            <option value="retryable">Retryable</option>
          </select>
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className={controlInputClassName}
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className={controlInputClassName}
          />
        </div>
      </Surface>

      <Surface
        title="Recovery Queue"
        description="Select a failed delivery to inspect payload and execute replay or purge actions."
        bodyClassName="p-0"
      >
        {loading ? (
          <div className="space-y-3 p-5 animate-pulse">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-20 rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-5">
            <EmptyPanel
              title="No DLQ entries"
              description="No dead-letter records match the current filter rail."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[1080px] grid-cols-[110px_140px_1.4fr_1fr_140px_180px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              <div>Channel</div>
              <div>State</div>
              <div>Notification</div>
              <div>Tenant</div>
              <div>Retries</div>
              <div>Created</div>
            </div>

            {entries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;

              return (
                <div key={entry.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    onClick={() => setSelectedEntry(isSelected ? null : entry)}
                    className="grid min-w-[1080px] grid-cols-[110px_140px_1.4fr_1fr_140px_180px] gap-3 px-5 py-4 text-left text-sm transition hover:bg-slate-50"
                  >
                    <div className="font-semibold text-slate-900">{entry.channel}</div>
                    <div>
                      <StatusBadge tone={entry.permanently_failed ? 'danger' : 'warning'}>
                        {entry.permanently_failed ? 'Permanent' : 'Retryable'}
                      </StatusBadge>
                    </div>
                    <div>
                      <p className="truncate font-mono text-xs text-slate-700">
                        {entry.notification_id}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {entry.error_details}
                      </p>
                    </div>
                    <div className="font-mono text-xs text-slate-600">
                      {entry.tenant_id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {entry.retry_count}/{entry.max_retries}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </button>

                  {isSelected ? (
                    <div className="grid gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Failure Context
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <p>
                              <span className="font-semibold text-slate-800">Tenant</span>{' '}
                              {entry.tenant_id}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-800">
                                Notification
                              </span>{' '}
                              {entry.notification_id}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-800">
                                Updated
                              </span>{' '}
                              {new Date(entry.updated_at).toLocaleString()}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-800">Error</span>{' '}
                              {entry.error_details}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={() => void handleRetry(entry.id)}
                            disabled={actionLoading === entry.id}
                            className={secondaryButtonClassName}
                          >
                            Retry entry
                          </button>
                          <button
                            onClick={() => void handlePurge(entry.id)}
                            disabled={actionLoading === entry.id}
                            className={dangerButtonClassName}
                          >
                            Purge entry
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Payload Snapshot
                        </p>
                        <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-200">
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {pagination && pagination.pages > 1 ? (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
              disabled={page >= pagination.pages}
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
