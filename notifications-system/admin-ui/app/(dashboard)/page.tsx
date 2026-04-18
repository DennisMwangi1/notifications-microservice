'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import {
  EmptyPanel,
  MetricTile,
  PageHeader,
  StatusBadge,
  Surface,
  cx,
} from '../../lib/operator-console';

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

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Pending';
}

function usageTone(percent: number) {
  if (percent >= 90) return 'danger' as const;
  if (percent >= 75) return 'warning' as const;
  return 'success' as const;
}

function statusTone(
  status: string,
): 'default' | 'success' | 'warning' | 'danger' | 'indigo' {
  if (status === 'DELIVERED' || status === 'SENT') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RETRYING' || status === 'PENDING') return 'warning';
  return 'default';
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    const response = await apiFetch<DashboardStats>('/api/v1/admin/stats');
    if (response.success && response.data) {
      setStats(response.data);
    }
    setLoading(false);
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchStats();
    }, 20000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-5 animate-pulse">
        <div className="h-24 rounded-2xl bg-white" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-36 rounded-2xl bg-white" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <div className="h-[420px] rounded-2xl bg-white" />
          <div className="h-[420px] rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyPanel
          title="Platform overview unavailable"
          description="The platform stats endpoint did not return data. Check the worker service, verify the admin token, and refresh the console."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <PageHeader
        eyebrow="System Control Center"
        title="Nucleus Operator Overview"
        description="Cross-tenant runtime supervision, quota pressure, onboarding exceptions, and recovery queues in one administrative surface."
        chips={
          <>
            <StatusBadge tone="success">Polling every 20s</StatusBadge>
            <StatusBadge tone="indigo">
              {stats.tenants.active}/{stats.tenants.total} tenants active
            </StatusBadge>
            <StatusBadge
              tone={stats.dlq.total > 0 ? 'warning' : 'success'}
            >
              DLQ backlog {stats.dlq.total}
            </StatusBadge>
          </>
        }
        actions={
          <>
            <Link
              href="/tenants"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open tenant governance
            </Link>
            <Link
              href="/logs"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Inspect event logs
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricTile
          label="Registered Tenants"
          value={stats.tenants.total}
          detail="Total tenants configured in the control plane."
          tone="indigo"
        />
        <MetricTile
          label="Active Tenants"
          value={stats.tenants.active}
          detail="Tenant records currently enabled for traffic."
          tone="success"
        />
        <MetricTile
          label="Quota Watchlist"
          value={stats.rateLimits.tenantsNearingLimits.length}
          detail="Tenants approaching throughput, burst, or template thresholds."
          tone={
            stats.rateLimits.tenantsNearingLimits.length > 0 ? 'warning' : 'success'
          }
        />
        <MetricTile
          label="Onboarding Attention"
          value={stats.onboarding.welcomeFailed + stats.onboarding.welcomePending}
          detail="Failed or pending tenant-admin welcome flows."
          tone={
            stats.onboarding.welcomeFailed > 0
              ? 'danger'
              : stats.onboarding.welcomePending > 0
                ? 'warning'
                : 'success'
          }
        />
        <MetricTile
          label="Dead-Letter Queue"
          value={stats.dlq.total}
          detail="Failed notifications waiting for review, retry, or purge."
          tone={stats.dlq.total > 0 ? 'warning' : 'success'}
        />
        <MetricTile
          label="Operational Mailer"
          value={stats.operationalMailer.configured ? 'Configured' : 'Missing'}
          detail={
            stats.operationalMailer.configured
              ? `${stats.operationalMailer.provider || 'Provider'} ${
                  stats.operationalMailer.isActive ? 'active' : 'inactive'
                }`
              : 'Platform-owned welcome delivery is not fully configured.'
          }
          tone={
            stats.operationalMailer.configured && stats.operationalMailer.isActive
              ? 'success'
              : 'warning'
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Surface
          title="Tenant Pressure Board"
          description="Highest-risk tenants ranked by the largest observed quota percentage across RPM, daily cap, burst, and template quota."
          action={
            <Link
              href="/limits"
              className="text-sm font-semibold text-indigo-700"
            >
              Open quota controls
            </Link>
          }
          bodyClassName="p-0"
        >
          {stats.rateLimits.tenantsNearingLimits.length === 0 ? (
            <div className="p-5">
              <EmptyPanel
                title="No quota pressure detected"
                description="All tracked tenants are currently operating below configured pressure thresholds."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[880px] grid-cols-[1.8fr_repeat(4,minmax(0,1fr))_132px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <div>Tenant</div>
                <div>RPM</div>
                <div>Daily</div>
                <div>Templates</div>
                <div>Burst</div>
                <div className="text-right">Actions</div>
              </div>
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
                    className="grid min-w-[880px] grid-cols-[1.8fr_repeat(4,minmax(0,1fr))_132px] gap-3 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {tenant.tenantName}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {tenant.tenantId}
                      </p>
                      <div className="mt-2">
                        <StatusBadge tone={usageTone(maxUsage)}>
                          Peak {maxUsage}%
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="text-slate-600">
                      <p>
                        {tenant.minuteCount}/{tenant.minuteLimit}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tenant.minuteUsagePct}% used
                      </p>
                    </div>
                    <div className="text-slate-600">
                      <p>
                        {tenant.dailyCount}/{tenant.dailyLimit}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tenant.dailyUsagePct}% used
                      </p>
                    </div>
                    <div className="text-slate-600">
                      <p>
                        {tenant.templateCount}/{tenant.templateLimit}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tenant.templateUsagePct}% used
                      </p>
                    </div>
                    <div className="text-slate-600">
                      <p>
                        {tenant.burstCapacity - tenant.burstRemaining}/
                        {tenant.burstCapacity}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tenant.burstUsagePct}% used
                      </p>
                    </div>
                    <div className="flex items-start justify-end">
                      <Link
                        href={`/tenants?tenantId=${tenant.tenantId}`}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>

        <div className="grid gap-4">
          <Surface
            title="Control Plane Status"
            description="Platform-owned services and intervention queues."
          >
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Operational mailer
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {stats.operationalMailer.provider || 'No provider configured'}
                      {stats.operationalMailer.apiKeyLast4
                        ? ` • key ending ${stats.operationalMailer.apiKeyLast4}`
                        : ''}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      stats.operationalMailer.configured &&
                      stats.operationalMailer.isActive
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {stats.operationalMailer.configured &&
                    stats.operationalMailer.isActive
                      ? 'Active'
                      : 'Needs attention'}
                  </StatusBadge>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Welcome delivery queue
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {stats.onboarding.welcomePending} pending,{' '}
                      {stats.onboarding.welcomeFailed} failed
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      stats.onboarding.welcomeFailed > 0
                        ? 'danger'
                        : stats.onboarding.welcomePending > 0
                          ? 'warning'
                          : 'success'
                    }
                  >
                    Review
                  </StatusBadge>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Unread in-app notifications
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {stats.notifications.unreadInApp} unread of{' '}
                      {stats.notifications.totalInApp} total in-app events
                    </p>
                  </div>
                  <StatusBadge tone="indigo">Visibility</StatusBadge>
                </div>
              </div>
            </div>
          </Surface>

          <Surface
            title="DLQ Backlog by Tenant"
            description="Queues most likely to require operator action."
            action={
              <Link
                href="/dlq"
                className="text-sm font-semibold text-indigo-700"
              >
                Open delivery recovery
              </Link>
            }
          >
            <div className="space-y-3">
              {stats.dlq.backlogByTenant.length === 0 ? (
                <EmptyPanel
                  title="No DLQ hotspots"
                  description="The dead-letter queue is currently clear across all tenants."
                />
              ) : (
                stats.dlq.backlogByTenant.map((entry) => (
                  <Link
                    key={entry.tenantId}
                    href={`/dlq?tenantId=${entry.tenantId}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.tenantName}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {entry.tenantId}
                      </p>
                    </div>
                    <StatusBadge tone={entry.count > 10 ? 'danger' : 'warning'}>
                      {entry.count} queued
                    </StatusBadge>
                  </Link>
                ))
              )}
            </div>
          </Surface>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Surface
          title="Recent Delivery Activity"
          description="Latest notification events traversing the platform, with direct drill-down into tenant log context."
          action={
            <Link href="/logs" className="text-sm font-semibold text-indigo-700">
              Open full event log
            </Link>
          }
          bodyClassName="p-0"
        >
          {stats.recentActivity.length === 0 ? (
            <div className="p-5">
              <EmptyPanel
                title="No recent activity"
                description="Recent delivery events will appear here once the runtime receives traffic."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[120px_120px_1.5fr_1.1fr_180px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                <div>Channel</div>
                <div>Status</div>
                <div>Notification</div>
                <div>Provider Ref</div>
                <div>Timestamp</div>
              </div>
              {stats.recentActivity.slice(0, 8).map((item) => (
                <Link
                  key={item.notification_id}
                  href={`/logs?tenantId=${item.tenant_id}`}
                  className="grid min-w-[760px] grid-cols-[120px_120px_1.5fr_1.1fr_180px] gap-3 border-b border-slate-100 px-5 py-4 text-sm transition hover:bg-slate-50 last:border-b-0"
                >
                  <div className="font-semibold text-slate-900">{item.channel}</div>
                  <div>
                    <StatusBadge tone={statusTone(item.status)}>
                      {item.status}
                    </StatusBadge>
                  </div>
                  <div className="truncate font-mono text-xs text-slate-600">
                    {item.notification_id}
                  </div>
                  <div className="truncate font-mono text-xs text-slate-500">
                    {item.provider_ref || 'No provider ref'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(item.sent_at)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Surface>

        <Surface
          title="Provider Failure Trends"
          description="Repeated provider references with recent failed deliveries."
          action={
            <Link
              href="/logs?status=FAILED"
              className="text-sm font-semibold text-indigo-700"
            >
              Filter failed logs
            </Link>
          }
        >
          <div className="space-y-3">
            {stats.providerFailureTrends.length === 0 ? (
              <EmptyPanel
                title="No recurring provider failures"
                description="Recent delivery history does not show repeated provider-linked failure clusters."
              />
            ) : (
              stats.providerFailureTrends.map((trend, index) => (
                <div
                  key={trend.providerRef}
                  className={cx(
                    'rounded-xl border px-4 py-3',
                    index === 0
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-xs text-slate-700">
                      {trend.providerRef}
                    </p>
                    <StatusBadge tone={trend.count >= 5 ? 'danger' : 'warning'}>
                      {trend.count} failures
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Latest observed event: {formatDateTime(trend.latestSentAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Surface>
      </section>
    </div>
  );
}
