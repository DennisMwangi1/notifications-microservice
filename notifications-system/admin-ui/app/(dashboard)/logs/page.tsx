'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

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

  useEffect(() => {
    void fetchTenants();
  }, []);

  useEffect(() => {
    void fetchLogs(1);
  }, [filterTenant, filterChannel, filterStatus, filterProviderRef, from, to]);

  const fetchTenants = async () => {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  };

  const fetchLogs = async (page: number) => {
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
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Cross-Tenant Logs
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Investigate delivery activity by tenant, channel, provider reference, and time window.
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={filterTenant}
            onChange={(event) => setFilterTenant(event.target.value)}
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
            value={filterChannel}
            onChange={(event) => setFilterChannel(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            <option value="">All channels</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">PUSH</option>
          </select>
          <select
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
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
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            placeholder="Provider reference"
          />
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4 text-sm text-slate-500">
          <p>{pagination.total} records</p>
          <p>
            Page {pagination.page} of {pagination.totalPages || 1}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 p-6 animate-pulse">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No notification logs match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.notification_id;
              return (
                <div key={log.notification_id}>
                  <button
                    onClick={() =>
                      setExpandedLog(isExpanded ? null : log.notification_id)
                    }
                    className="grid w-full grid-cols-12 gap-4 px-6 py-4 text-left hover:bg-slate-50"
                  >
                    <div className="col-span-2 text-sm font-semibold text-slate-900">
                      {log.channel}
                    </div>
                    <div className="col-span-2 text-sm text-slate-600">{log.status}</div>
                    <div className="col-span-3 text-xs font-mono text-slate-500">
                      {log.tenant_id}
                    </div>
                    <div className="col-span-3 truncate text-xs font-mono text-slate-500">
                      {log.provider_ref || 'No provider ref'}
                    </div>
                    <div className="col-span-2 text-right text-xs text-slate-500">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'Pending'}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="grid gap-4 border-t border-slate-100 bg-slate-50 px-6 py-5 lg:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                          Notification ID
                        </p>
                        <p className="mt-2 break-all text-xs font-mono text-slate-700">
                          {log.notification_id}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                          Template ID
                        </p>
                        <p className="mt-2 break-all text-xs font-mono text-slate-700">
                          {log.template_id}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                          User ID
                        </p>
                        <p className="mt-2 break-all text-xs font-mono text-slate-700">
                          {log.user_id || 'System'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                          Provider Ref
                        </p>
                        <p className="mt-2 break-all text-xs font-mono text-slate-700">
                          {log.provider_ref || 'None'}
                        </p>
                      </div>
                      {log.error_details && (
                        <div className="lg:col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-500">
                            Error Details
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-rose-50 p-4 text-xs text-rose-700">
                            {log.error_details}
                          </pre>
                        </div>
                      )}
                      {log.metadata && (
                        <div className="lg:col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                            Metadata
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-white p-4 text-xs text-slate-700">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
            <button
              onClick={() => void fetchLogs(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                void fetchLogs(Math.min(pagination.totalPages, pagination.page + 1))
              }
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
