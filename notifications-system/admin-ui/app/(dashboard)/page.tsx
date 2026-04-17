'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface DashboardStats {
  tenants: { total: number; active: number };
  templates: { total: number };
  notifications: {
    totalDispatched: number;
    totalInApp: number;
    unreadInApp: number;
  };
  rateLimits: {
    activeTenantsTracked: number;
    currentMinuteRequests: number;
    currentDailyRequests: number;
    tenantsNearingLimits: TenantUsage[];
  };
  onboarding: {
    totalAdmins: number;
    mustResetPassword: number;
    welcomeFailed: number;
    welcomePending: number;
  };
  dlq: {
    total: number;
    backlogByTenant: { tenantId: string; tenantName: string; count: number }[];
  };
  operationalMailer: {
    configured: boolean;
    provider: string | null;
    isActive: boolean;
    apiKeyLast4: string | null;
    keyVersion: number | null;
    rotatedAt: string | null;
  };
  providerFailureTrends: {
    providerRef: string;
    count: number;
    latestSentAt: string | null;
  }[];
  recentActivity: {
    notification_id: string;
    tenant_id: string;
    channel: string;
    status: string;
    sent_at: string | null;
    provider_ref: string | null;
  }[];
}

interface TenantUsage {
  tenantId: string;
  tenantName: string;
  minuteCount: number;
  minuteLimit: number;
  minuteUsagePct: number;
  dailyCount: number;
  dailyLimit: number;
  dailyUsagePct: number;
  burstRemaining: number;
  burstCapacity: number;
  burstUsagePct: number;
  templateCount: number;
  templateLimit: number;
  templateUsagePct: number;
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-4xl font-black tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => {
      void fetchStats();
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    const response = await apiFetch<DashboardStats>('/api/v1/admin/stats');
    if (response.success && response.data) {
      setStats(response.data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="max-w-[1500px] mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-72 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-40 rounded-[2rem] bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-4xl mx-auto rounded-[2rem] border border-slate-100 bg-white p-10 text-center shadow-sm">
        <h2 className="text-2xl font-black text-slate-900">Operator overview unavailable</h2>
        <p className="mt-2 text-sm text-slate-500">
          The platform stats endpoint did not return data. Check the worker service and refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto space-y-8 pb-10">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900">
            Platform Overview
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Watch tenant health, quota pressure, onboarding friction, and delivery recovery from one operator surface.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/tenants" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700">
            Open tenant governance
          </Link>
          <Link href="/limits" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700">
            Review quotas
          </Link>
          <Link href="/audit" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700">
            Audit operator actions
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Tenants"
          value={stats.tenants.active}
          helper={`${stats.tenants.total} total tenants registered on the platform`}
        />
        <MetricCard
          label="Tenants Near Limits"
          value={stats.rateLimits.tenantsNearingLimits.length}
          helper="Tenants approaching RPM, daily-cap, burst, or template quota thresholds"
        />
        <MetricCard
          label="Onboarding Attention"
          value={stats.onboarding.welcomeFailed + stats.onboarding.welcomePending}
          helper={`${stats.onboarding.welcomeFailed} failed and ${stats.onboarding.welcomePending} pending welcome flows`}
        />
        <MetricCard
          label="DLQ Backlog"
          value={stats.dlq.total}
          helper="Failed notifications currently waiting for review or retry"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Quota Watchlist</h3>
              <p className="mt-1 text-sm text-slate-500">
                Highest-pressure tenants across throughput and template quotas.
              </p>
            </div>
            <Link href="/limits" className="text-sm font-semibold text-indigo-700">
              Open Quotas & Limits
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {stats.rateLimits.tenantsNearingLimits.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-400">
                No tenants are near quota thresholds right now.
              </div>
            )}
            {stats.rateLimits.tenantsNearingLimits.map((tenant) => {
              const maxUsage = Math.max(
                tenant.minuteUsagePct,
                tenant.dailyUsagePct,
                tenant.templateUsagePct,
                tenant.burstUsagePct,
              );

              return (
                <div
                  key={tenant.tenantId}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{tenant.tenantName}</p>
                      <p className="text-xs font-mono text-slate-500">{tenant.tenantId}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/tenants?tenantId=${tenant.tenantId}`}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                      >
                        Open Tenant
                      </Link>
                      <Link
                        href={`/limits?tenantId=${tenant.tenantId}`}
                        className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        Adjust Limits
                      </Link>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <p className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                      RPM <span className="font-bold text-slate-900">{tenant.minuteCount}/{tenant.minuteLimit}</span>
                    </p>
                    <p className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                      Daily <span className="font-bold text-slate-900">{tenant.dailyCount}/{tenant.dailyLimit}</span>
                    </p>
                    <p className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                      Templates <span className="font-bold text-slate-900">{tenant.templateCount}/{tenant.templateLimit}</span>
                    </p>
                    <p className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                      Peak Usage <span className="font-bold text-slate-900">{maxUsage}%</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Operational Mailer</h3>
            <p className="mt-1 text-sm text-slate-500">
              Platform-owned onboarding delivery status.
            </p>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-5">
            <p className="text-sm text-slate-500">Configuration</p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {stats.operationalMailer.configured ? stats.operationalMailer.provider : 'Not configured'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {stats.operationalMailer.configured
                ? stats.operationalMailer.isActive
                  ? `Active • key ending ${stats.operationalMailer.apiKeyLast4 || 'n/a'}`
                  : 'Configured but inactive'
                : 'Set up the operational mailer before sending welcome emails.'}
            </p>
            <Link href="/mail" className="mt-4 inline-flex rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Manage Mailer
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Pending Resets
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {stats.onboarding.mustResetPassword}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Tenant admins still required to complete first-login password reset.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Welcome Failures
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {stats.onboarding.welcomeFailed}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Welcome deliveries that failed and may need operator intervention.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">DLQ by Tenant</h3>
              <p className="mt-1 text-sm text-slate-500">
                Backlog hotspots that need retry or cleanup.
              </p>
            </div>
            <Link href="/dlq" className="text-sm font-semibold text-indigo-700">
              Open DLQ
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {stats.dlq.backlogByTenant.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">
                No tenant DLQ backlog right now.
              </div>
            )}
            {stats.dlq.backlogByTenant.map((entry) => (
              <Link
                key={entry.tenantId}
                href={`/dlq?tenantId=${entry.tenantId}`}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-900">{entry.tenantName}</p>
                  <p className="text-xs font-mono text-slate-500">{entry.tenantId}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  {entry.count} items
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Provider Failure Trends</h3>
              <p className="mt-1 text-sm text-slate-500">
                Recent provider references with repeated failed deliveries.
              </p>
            </div>
            <Link href="/logs?status=FAILED" className="text-sm font-semibold text-indigo-700">
              Inspect failed logs
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {stats.providerFailureTrends.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-400">
                No provider-linked failures detected in recent log history.
              </div>
            )}
            {stats.providerFailureTrends.map((trend) => (
              <div
                key={trend.providerRef}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <p className="truncate text-sm font-semibold text-slate-900">
                  {trend.providerRef}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {trend.count} recent failures
                  {trend.latestSentAt
                    ? ` • latest ${new Date(trend.latestSentAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Recent Activity</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest cross-tenant delivery events flowing through the platform.
              </p>
            </div>
            <Link href="/logs" className="text-sm font-semibold text-indigo-700">
              Open logs
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {stats.recentActivity.slice(0, 6).map((item) => (
              <Link
                key={item.notification_id}
                href={`/logs?tenantId=${item.tenant_id}`}
                className="block rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {item.channel} • {item.status}
                </p>
                <p className="mt-1 truncate text-xs font-mono text-slate-500">
                  {item.notification_id}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.sent_at ? new Date(item.sent_at).toLocaleString() : 'Pending timestamp'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
