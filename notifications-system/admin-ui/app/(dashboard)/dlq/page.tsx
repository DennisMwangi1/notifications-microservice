'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

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

  useEffect(() => {
    void fetchTenants();
  }, []);

  useEffect(() => {
    void fetchEntries();
  }, [page, filter, tenantId, channel, from, to]);

  const fetchTenants = async () => {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  };

  const fetchEntries = async () => {
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
  };

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

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-10">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900">
            Dead Letter Queue
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Filter failed notifications by tenant and time window, then retry or purge with audit reasons.
          </p>
        </div>
        <button
          onClick={() => void handleRetryAll()}
          disabled={actionLoading === 'retry-all' || entries.length === 0}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {actionLoading === 'retry-all' ? 'Retrying…' : 'Retry All Filtered'}
        </button>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={tenantId}
            onChange={(event) => {
              setTenantId(event.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
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
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
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
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
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
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, index) => (
            <div key={index} className="h-20 rounded-[2rem] bg-slate-100" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          No DLQ entries match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() =>
                setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)
              }
              className={`cursor-pointer rounded-[2rem] border bg-white p-5 shadow-sm ${
                selectedEntry?.id === entry.id
                  ? 'border-slate-400 ring-2 ring-slate-200'
                  : 'border-slate-100'
              }`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700">
                      {entry.channel}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                        entry.permanently_failed
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {entry.permanently_failed ? 'Permanent' : 'Retryable'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {entry.notification_id}
                  </p>
                  <p className="mt-1 text-xs font-mono text-slate-500">
                    {entry.tenant_id}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">{entry.error_details}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Retries {entry.retry_count}/{entry.max_retries}</p>
                  <p className="mt-1">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedEntry?.id === entry.id && (
                <div
                  className="mt-4 space-y-4 border-t border-slate-100 pt-4"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                        Tenant ID
                      </p>
                      <p className="mt-2 break-all text-xs font-mono text-slate-700">
                        {entry.tenant_id}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                        Updated
                      </p>
                      <p className="mt-2 text-xs text-slate-700">
                        {new Date(entry.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                        Status
                      </p>
                      <p className="mt-2 text-xs text-slate-700">
                        {entry.permanently_failed ? 'Permanently failed' : 'Retryable'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      Payload
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      onClick={() => void handleRetry(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => void handlePurge(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Purge
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
            disabled={page >= pagination.pages}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
