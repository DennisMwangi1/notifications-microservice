'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

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

const inputClasses =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

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

  useEffect(() => {
    void fetchData();
  }, []);

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
      openEditor(tenant);
    }
  }, [searchParams, tenants]);

  const openEditor = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setForm({
      rate_limit_per_minute: tenant.rate_limit_per_minute,
      daily_notification_cap: tenant.daily_notification_cap,
      max_template_count: tenant.max_template_count,
      audit_reason: '',
    });
  };

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

  return (
    <div className="max-w-[1500px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Quotas & Limits
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Review quota pressure across all tenants and adjust caps with an operator audit reason.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
            Tracked Tenants
          </p>
          <p className="mt-3 text-4xl font-black text-slate-900">
            {usage.length}
          </p>
        </div>
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
            Current RPM Volume
          </p>
          <p className="mt-3 text-4xl font-black text-slate-900">
            {usage.reduce((sum, item) => sum + item.minuteCount, 0)}
          </p>
        </div>
        <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
            Current Daily Volume
          </p>
          <p className="mt-3 text-4xl font-black text-slate-900">
            {usage.reduce((sum, item) => sum + item.dailyCount, 0)}
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
          <div className="col-span-3">Tenant</div>
          <div className="col-span-2">RPM</div>
          <div className="col-span-2">Daily</div>
          <div className="col-span-2">Templates</div>
          <div className="col-span-2">Burst</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {loading ? (
          <div className="space-y-3 p-6 animate-pulse">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-14 rounded-2xl bg-slate-100" />
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
                className="grid grid-cols-12 gap-4 border-b border-slate-50 px-6 py-4 items-center"
              >
                <div className="col-span-3">
                  <p className="text-sm font-semibold text-slate-900">{tenant.name}</p>
                  <p className="text-xs font-mono text-slate-500">{tenant.id}</p>
                </div>
                <div className="col-span-2 text-sm text-slate-600">
                  {tenantUsage ? `${tenantUsage.minuteCount}/${tenantUsage.minuteLimit}` : tenant.rate_limit_per_minute}
                </div>
                <div className="col-span-2 text-sm text-slate-600">
                  {tenantUsage ? `${tenantUsage.dailyCount}/${tenantUsage.dailyLimit}` : tenant.daily_notification_cap}
                </div>
                <div className="col-span-2 text-sm text-slate-600">
                  {tenantUsage ? `${tenantUsage.templateCount}/${tenantUsage.templateLimit}` : tenant.max_template_count}
                </div>
                <div className="col-span-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      severity >= 90
                        ? 'bg-rose-100 text-rose-700'
                        : severity >= 70
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {tenantUsage ? `${tenantUsage.burstUsagePct}%` : '0%'}
                  </span>
                </div>
                <div className="col-span-1 text-right">
                  <button
                    onClick={() => openEditor(tenant)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingTenant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setEditingTenant(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-2xl font-black text-slate-900">
                Adjust Limits
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {editingTenant.name} • changes are recorded in the operator audit trail.
              </p>
            </div>

            <form onSubmit={saveLimits} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    RPM
                  </label>
                  <input
                    className={inputClasses}
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
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    Daily Cap
                  </label>
                  <input
                    className={inputClasses}
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
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                    Template Quota
                  </label>
                  <input
                    className={inputClasses}
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
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                  Audit Reason
                </label>
                <textarea
                  className={`${inputClasses} min-h-28 resize-none`}
                  value={form.audit_reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audit_reason: event.target.value,
                    }))
                  }
                  placeholder="Explain why these limits are being changed."
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
