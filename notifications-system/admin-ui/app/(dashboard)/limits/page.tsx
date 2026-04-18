'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import {
  MetricTile,
  PageHeader,
  StatusBadge,
  Surface,
  controlInputClassName,
  controlTextareaClassName,
} from '../../../lib/operator-console';

interface Tenant {
  id: string;
  name: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  daily_notification_cap: number;
  max_template_count: number;
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

interface StatsResponse {
  rateLimits: {
    activeTenantsTracked: number;
    currentMinuteRequests: number;
    currentDailyRequests: number;
    tenantUsage: TenantUsage[];
  };
}

function severityTone(
  value: number,
): 'default' | 'success' | 'warning' | 'danger' | 'indigo' {
  if (value >= 90) return 'danger';
  if (value >= 70) return 'warning';
  return 'success';
}

export default function LimitsPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [usage, setUsage] = useState<TenantUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rate_limit_per_minute: 100,
    daily_notification_cap: 10000,
    max_template_count: 50,
    audit_reason: '',
  });

  const fetchData = async () => {
    setLoading(true);
    const [tenantResponse, statsResponse] = await Promise.all([
      apiFetch<Tenant[]>('/api/v1/admin/tenants'),
      apiFetch<StatsResponse>('/api/v1/admin/stats'),
    ]);

    if (tenantResponse.success && tenantResponse.data) {
      setTenants(tenantResponse.data);
    }
    if (statsResponse.success && statsResponse.data) {
      setUsage(statsResponse.data.rateLimits.tenantUsage);
    }

    setLoading(false);
  };

  function openEditor(tenant: Tenant) {
    setEditingTenant(tenant);
    setForm({
      rate_limit_per_minute: tenant.rate_limit_per_minute,
      daily_notification_cap: tenant.daily_notification_cap,
      max_template_count: tenant.max_template_count,
      audit_reason: '',
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const usageByTenant = useMemo(
    () => new Map(usage.map((entry) => [entry.tenantId, entry])),
    [usage],
  );

  useEffect(() => {
    if (!tenants.length) return;
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) return;

    const tenant = tenants.find((item) => item.id === tenantId);
    if (tenant) {
      const timer = window.setTimeout(() => {
        openEditor(tenant);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [searchParams, tenants]);

  const saveLimits = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTenant) return;

    setSaving(true);
    const response = await apiFetch(`/api/v1/admin/tenants/${editingTenant.id}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (response.success) {
      setEditingTenant(null);
      await fetchData();
    }
  };

  const rows = [...tenants].sort((a, b) => {
    const usageA = usageByTenant.get(a.id);
    const usageB = usageByTenant.get(b.id);
    const maxA = usageA
      ? Math.max(
          usageA.minuteUsagePct,
          usageA.dailyUsagePct,
          usageA.templateUsagePct,
          usageA.burstUsagePct,
        )
      : 0;
    const maxB = usageB
      ? Math.max(
          usageB.minuteUsagePct,
          usageB.dailyUsagePct,
          usageB.templateUsagePct,
          usageB.burstUsagePct,
        )
      : 0;

    return maxB - maxA || a.name.localeCompare(b.name);
  });

  const totalMinuteVolume = usage.reduce((sum, item) => sum + item.minuteCount, 0);
  const totalDailyVolume = usage.reduce((sum, item) => sum + item.dailyCount, 0);
  const highPressureTenants = usage.filter((item) => {
    const maxPressure = Math.max(
      item.minuteUsagePct,
      item.dailyUsagePct,
      item.templateUsagePct,
      item.burstUsagePct,
    );
    return maxPressure >= 70;
  }).length;

  return (
    <div className="mx-auto max-w-[1650px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Control Limits"
        title="Quotas & Limits"
        description="Review tenant pressure across throughput and template quotas, then make audited adjustments from a ranked control table."
        chips={
          <>
            <StatusBadge tone="indigo">{usage.length} tracked tenants</StatusBadge>
            <StatusBadge tone={highPressureTenants > 0 ? 'warning' : 'success'}>
              High pressure {highPressureTenants}
            </StatusBadge>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Tracked Tenants"
          value={usage.length}
          detail="Tenants currently represented in runtime quota usage stats."
          tone="indigo"
        />
        <MetricTile
          label="Current RPM Volume"
          value={totalMinuteVolume}
          detail="Requests counted against minute quotas in the current sample."
          tone="indigo"
        />
        <MetricTile
          label="Current Daily Volume"
          value={totalDailyVolume}
          detail="Requests counted against daily caps in the current sample."
          tone="indigo"
        />
        <MetricTile
          label="High Pressure Tenants"
          value={highPressureTenants}
          detail="Tenants above 70% usage on at least one monitored quota."
          tone={highPressureTenants > 0 ? 'warning' : 'success'}
        />
      </section>

      <Surface
        title="Quota Control Table"
        description="Tenants are ranked by the highest observed usage percentage so operators can respond to pressure quickly."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[1260px] grid-cols-[1.6fr_1fr_1fr_1fr_1fr_120px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            <div>Tenant</div>
            <div>RPM</div>
            <div>Daily</div>
            <div>Templates</div>
            <div>Burst</div>
            <div className="text-right">Action</div>
          </div>

          {loading ? (
            <div className="space-y-3 p-5 animate-pulse">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-16 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            rows.map((tenant) => {
              const tenantUsage = usageByTenant.get(tenant.id);
              const severity = tenantUsage
                ? Math.max(
                    tenantUsage.minuteUsagePct,
                    tenantUsage.dailyUsagePct,
                    tenantUsage.templateUsagePct,
                    tenantUsage.burstUsagePct,
                  )
                : 0;

              return (
                <div
                  key={tenant.id}
                  className="grid min-w-[1260px] grid-cols-[1.6fr_1fr_1fr_1fr_1fr_120px] gap-3 border-b border-slate-100 px-5 py-4 text-sm last:border-b-0"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{tenant.name}</p>
                      <StatusBadge tone={tenant.is_active ? 'success' : 'danger'}>
                        {tenant.is_active ? 'Active' : 'Suspended'}
                      </StatusBadge>
                      <StatusBadge tone={severityTone(severity)}>
                        Peak {severity}%
                      </StatusBadge>
                    </div>
                    <p className="mt-2 font-mono text-xs text-slate-500">
                      {tenant.id}
                    </p>
                  </div>

                  <div className="text-slate-600">
                    <p>
                      {tenantUsage
                        ? `${tenantUsage.minuteCount}/${tenantUsage.minuteLimit}`
                        : tenant.rate_limit_per_minute}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${
                          severityTone(tenantUsage?.minuteUsagePct || 0) === 'danger'
                            ? 'bg-rose-500'
                            : severityTone(tenantUsage?.minuteUsagePct || 0) === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(tenantUsage?.minuteUsagePct || 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-slate-600">
                    <p>
                      {tenantUsage
                        ? `${tenantUsage.dailyCount}/${tenantUsage.dailyLimit}`
                        : tenant.daily_notification_cap}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${
                          severityTone(tenantUsage?.dailyUsagePct || 0) === 'danger'
                            ? 'bg-rose-500'
                            : severityTone(tenantUsage?.dailyUsagePct || 0) === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(tenantUsage?.dailyUsagePct || 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-slate-600">
                    <p>
                      {tenantUsage
                        ? `${tenantUsage.templateCount}/${tenantUsage.templateLimit}`
                        : tenant.max_template_count}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${
                          severityTone(tenantUsage?.templateUsagePct || 0) === 'danger'
                            ? 'bg-rose-500'
                            : severityTone(tenantUsage?.templateUsagePct || 0) === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${Math.min(tenantUsage?.templateUsagePct || 0, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-slate-600">
                    <p>
                      {tenantUsage
                        ? `${tenantUsage.burstCapacity - tenantUsage.burstRemaining}/${tenantUsage.burstCapacity}`
                        : '0/0'}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${
                          severityTone(tenantUsage?.burstUsagePct || 0) === 'danger'
                            ? 'bg-rose-500'
                            : severityTone(tenantUsage?.burstUsagePct || 0) === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(tenantUsage?.burstUsagePct || 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-start justify-end">
                    <button
                      onClick={() => openEditor(tenant)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Surface>

      {editingTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onClick={() => setEditingTenant(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-black tracking-tight text-slate-950">
                  Adjust Tenant Limits
                </h2>
                <StatusBadge tone={editingTenant.is_active ? 'success' : 'danger'}>
                  {editingTenant.is_active ? 'Tenant active' : 'Tenant suspended'}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {editingTenant.name} • every change requires an audit reason and is written to the operator trail.
              </p>
            </div>

            <form onSubmit={saveLimits} className="space-y-6 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Requests per minute
                  </label>
                  <input
                    className={controlInputClassName}
                    type="number"
                    value={form.rate_limit_per_minute}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        rate_limit_per_minute: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Daily cap
                  </label>
                  <input
                    className={controlInputClassName}
                    type="number"
                    value={form.daily_notification_cap}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        daily_notification_cap: Number(event.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Template quota
                  </label>
                  <input
                    className={controlInputClassName}
                    type="number"
                    value={form.max_template_count}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        max_template_count: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Audit reason
                </label>
                <textarea
                  className={`${controlTextareaClassName} min-h-32 resize-none`}
                  value={form.audit_reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audit_reason: event.target.value,
                    }))
                  }
                  placeholder="Explain why these limits are being changed, what risk is being managed, and whether the change is temporary."
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving changes...' : 'Save limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
