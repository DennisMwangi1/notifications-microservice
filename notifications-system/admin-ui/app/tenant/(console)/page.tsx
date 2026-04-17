'use client';

import { useEffect, useState } from 'react';
import { tenantApiFetch } from '../../../lib/api';
import { getTenantUser } from '../../../lib/auth';

interface LogEntry {
  notification_id: string;
  channel: string;
  status: string;
  sent_at: string | null;
}

export default function TenantDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [templateCount, setTemplateCount] = useState(0);
  const [providerCount, setProviderCount] = useState(0);
  const [dlqCount, setDlqCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);

  const user = getTenantUser();

  useEffect(() => {
    void (async () => {
      try {
        const [templates, providers, logs, dlq] = await Promise.all([
          tenantApiFetch<unknown[]>('/api/v1/tenant/templates'),
          tenantApiFetch<unknown[]>('/api/v1/tenant/providers'),
          tenantApiFetch<LogEntry[]>('/api/v1/tenant/logs?limit=5'),
          tenantApiFetch<unknown[]>('/api/v1/tenant/dlq?limit=5'),
        ]);

        setTemplateCount(templates.data?.length || 0);
        setProviderCount(providers.data?.length || 0);
        setRecentLogs(logs.data || []);
        setDlqCount((dlq.data || []).length);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="h-60 rounded-[2rem] bg-white border border-slate-100 animate-pulse" />;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <p className="text-xs uppercase tracking-[0.28em] font-bold text-indigo-600">
          Tenant Operations
        </p>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-slate-900">
          {user?.displayName || user?.username}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Tenant ID: {user?.tenantId}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Providers" value={providerCount} tone="indigo" />
        <MetricCard label="Templates" value={templateCount} tone="emerald" />
        <MetricCard label="DLQ Items" value={dlqCount} tone="amber" />
        <MetricCard
          label="Password Reset"
          value={user?.mustResetPassword ? 'Required' : 'Complete'}
          tone={user?.mustResetPassword ? 'rose' : 'indigo'}
        />
      </div>

      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Recent Delivery Activity</h3>
        <div className="mt-4 space-y-3">
          {recentLogs.map((log) => (
            <div
              key={log.notification_id}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{log.channel}</p>
                <p className="text-xs font-mono text-slate-500">{log.notification_id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-700">{log.status}</p>
                <p className="text-xs text-slate-400">
                  {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'Pending'}
                </p>
              </div>
            </div>
          ))}
          {recentLogs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
              No recent activity yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses = {
    indigo: 'from-indigo-50 to-violet-50 text-indigo-700',
    emerald: 'from-emerald-50 to-teal-50 text-emerald-700',
    amber: 'from-amber-50 to-orange-50 text-amber-700',
    rose: 'from-rose-50 to-pink-50 text-rose-700',
  } as const;

  return (
    <div className={`rounded-[2rem] border border-slate-100 bg-gradient-to-br ${toneClasses[tone]} p-6 shadow-sm`}>
      <p className="text-[10px] uppercase tracking-[0.24em] font-bold opacity-70">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black tracking-tight">{value}</p>
    </div>
  );
}
