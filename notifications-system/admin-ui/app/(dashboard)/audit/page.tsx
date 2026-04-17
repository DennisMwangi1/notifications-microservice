'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';

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

  useEffect(() => {
    void fetchTenants();
  }, []);

  useEffect(() => {
    void fetchLogs(1);
  }, [tenantId, actorType, resourceType, action, from, to]);

  const fetchTenants = async () => {
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
  };

  const fetchLogs = async (page: number) => {
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
    <div className="max-w-[1500px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Audit & Support
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Review operator interventions, tenant-scoped changes, retries, and support trails.
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
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
            value={actorType}
            onChange={(event) => setActorType(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            <option value="">All actors</option>
            <option value="PLATFORM_OPERATOR">Platform operator</option>
            <option value="TENANT_ADMIN">Tenant admin</option>
            <option value="SYSTEM">System</option>
          </select>
          <input
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            placeholder="Resource type"
          />
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            placeholder="Action contains…"
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
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-sm text-slate-500">
            {pagination.total} audit entries
          </p>
          <p className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.totalPages || 1}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 p-6 animate-pulse">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-24 rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No audit entries match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-base font-bold text-slate-900">{log.action}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {log.actor_type} • {log.actor_id}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {log.resource_type}
                      {log.resource_id ? ` • ${log.resource_id}` : ''}
                      {log.tenant_id ? ` • tenant ${log.tenant_id}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      Before
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-slate-600">
                      {log.before_state
                        ? JSON.stringify(log.before_state, null, 2)
                        : 'No before-state recorded'}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      After
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-slate-600">
                      {log.after_state
                        ? JSON.stringify(log.after_state, null, 2)
                        : 'No after-state recorded'}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
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
