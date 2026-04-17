'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';

interface Tenant {
  id: string;
  name: string;
  api_key: string;
  allowed_channels: string[];
  is_active: boolean;
  created_at: string;
  sender_email?: string | null;
  sender_name?: string | null;
  rate_limit_per_minute: number;
  daily_notification_cap: number;
  max_template_count: number;
}

interface TenantAdmin {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
  display_name?: string | null;
  must_reset_password: boolean;
  password_set_at?: string | null;
  is_active: boolean;
  welcome_sent_at?: string | null;
  welcome_delivery_status?: string | null;
  welcome_delivery_error?: string | null;
  can_reset_temporary_password: boolean;
  can_resend_onboarding: boolean;
  credential_intervention_locked: boolean;
  credential_intervention_reason?: string | null;
}

interface ProvisioningResult {
  tenant: Tenant;
  tenantAdmin: TenantAdmin | null;
  initialCredentials: {
    username: string;
    temporaryPassword: string;
  } | null;
  onboarding: {
    status: string;
    sentAt?: string | null;
    deliveryError?: string | null;
  };
}

interface TenantOps {
  tenant: {
    id: string;
    name: string;
    is_active: boolean;
    allowed_channels: string[];
    sender_email: string | null;
    sender_name: string | null;
    rate_limit_per_minute: number;
    daily_notification_cap: number;
    max_template_count: number;
    created_at: string;
  };
  quotas: {
    rate_limit_per_minute: number;
    daily_notification_cap: number;
    max_template_count: number;
  };
  usage: {
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
  };
  onboarding: {
    totalAdmins: number;
    activeAdmins: number;
    mustResetPassword: number;
    welcomeFailed: number;
    welcomePending: number;
    latestWelcomeSentAt: string | null;
  };
  providers: {
    count: number;
    latest: {
      id: string;
      name: string;
      provider: string;
      api_key_last4: string | null;
      key_version: number;
      rotated_at: string | null;
      created_at: string;
    } | null;
  };
  templates: {
    totalTenantOwned: number;
  };
  failures: {
    failedLogCount: number;
    dlqCount: number;
    recentFailures: {
      notification_id: string;
      channel: string;
      status: string;
      error_details: string | null;
      sent_at: string | null;
    }[];
  };
  recentActivity: {
    notification_id: string;
    channel: string;
    status: string;
    provider_ref: string | null;
    sent_at: string | null;
  }[];
}

const inputClasses =
  'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40';

export default function TenantsPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantOps, setTenantOps] = useState<TenantOps | null>(null);
  const [tenantAdmins, setTenantAdmins] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provisioningResult, setProvisioningResult] =
    useState<ProvisioningResult | null>(null);
  const [workingAdminId, setWorkingAdminId] = useState<string | null>(null);
  const [workingTenantAction, setWorkingTenantAction] = useState<
    'suspend' | 'reactivate' | null
  >(null);

  const [form, setForm] = useState({
    name: '',
    allowed_channels: 'EMAIL,SMS',
    sender_email: '',
    sender_name: '',
    rate_limit_per_minute: 100,
    daily_notification_cap: 10000,
    max_template_count: 50,
    tenantAdmin: {
      username: '',
      email: '',
      displayName: '',
    },
  });

  useEffect(() => {
    void fetchTenants();
  }, []);

  useEffect(() => {
    if (!tenants.length) return;
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) return;
    const tenant = tenants.find((item) => item.id === tenantId);
    if (tenant) {
      void openTenantDetail(tenant);
    }
  }, [searchParams, tenants]);

  const fetchTenants = async () => {
    setLoading(true);
    const response = await apiFetch<Tenant[]>('/api/v1/admin/tenants');
    if (response.success && response.data) {
      setTenants(response.data);
    }
    setLoading(false);
  };

  const fetchTenantAdmins = async (tenantId: string) => {
    const response = await apiFetch<TenantAdmin[]>(
      `/api/v1/admin/tenants/${tenantId}/admins`,
    );
    if (response.success) {
      setTenantAdmins(response.data || []);
    }
  };

  const fetchTenantOps = async (tenantId: string) => {
    setOpsLoading(true);
    const response = await apiFetch<TenantOps>(`/api/v1/admin/tenants/${tenantId}/ops`);
    if (response.success && response.data) {
      setTenantOps(response.data);
    }
    setOpsLoading(false);
  };

  const openTenantDetail = async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    await Promise.all([fetchTenantAdmins(tenant.id), fetchTenantOps(tenant.id)]);
  };

  const handleProvision = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await apiFetch<ProvisioningResult>('/api/v1/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        allowed_channels: form.allowed_channels
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        sender_email: form.sender_email || undefined,
        sender_name: form.sender_name || undefined,
        rate_limit_per_minute: Number(form.rate_limit_per_minute),
        daily_notification_cap: Number(form.daily_notification_cap),
        max_template_count: Number(form.max_template_count),
        tenantAdmin: {
          username: form.tenantAdmin.username,
          email: form.tenantAdmin.email,
          displayName: form.tenantAdmin.displayName || undefined,
        },
      }),
    });

    if (response.success && response.data) {
      setProvisioningResult(response.data);
      setTenants((current) => [response.data!.tenant, ...current]);
      setForm({
        name: '',
        allowed_channels: 'EMAIL,SMS',
        sender_email: '',
        sender_name: '',
        rate_limit_per_minute: 100,
        daily_notification_cap: 10000,
        max_template_count: 50,
        tenantAdmin: {
          username: '',
          email: '',
          displayName: '',
        },
      });
      setIsModalOpen(false);
    }
  };

  const askReason = (label: string) => {
    const reason = window.prompt(`Reason for ${label.toLowerCase()}:`);
    return reason?.trim() || null;
  };

  const handleAdminAction = async (
    tenantId: string,
    adminId: string,
    action: 'resend-onboarding' | 'reset-temporary-password',
  ) => {
    const reason = askReason(
      action === 'resend-onboarding'
        ? 'resending onboarding'
        : 'resetting temporary password',
    );
    if (!reason) return;

    setWorkingAdminId(adminId);
    const response = await apiFetch<{
      tenantAdmin: TenantAdmin;
      initialCredentials: { username: string; temporaryPassword: string };
      onboarding: {
        status: string;
        sentAt?: string | null;
        deliveryError?: string | null;
      };
    }>(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });

    if (response.success && response.data) {
      setProvisioningResult({
        tenant: selectedTenant!,
        tenantAdmin: response.data.tenantAdmin,
        initialCredentials: response.data.initialCredentials,
        onboarding: response.data.onboarding,
      });
      await Promise.all([fetchTenantAdmins(tenantId), fetchTenantOps(tenantId)]);
    } else {
      window.alert(response.message || 'Unable to complete tenant admin action.');
    }

    setWorkingAdminId(null);
  };

  const handleTenantLifecycleAction = async (
    tenant: Tenant,
    action: 'suspend' | 'reactivate',
  ) => {
    const reason = askReason(
      action === 'suspend' ? 'suspending this tenant' : 'reactivating this tenant',
    );

    if (!reason) return;

    setWorkingTenantAction(action);
    const response = await apiFetch<Tenant>(
      `/api/v1/admin/tenants/${tenant.id}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );

    if (response.success && response.data) {
      setTenants((currentTenants) =>
        currentTenants.map((item) =>
          item.id === tenant.id ? response.data! : item,
        ),
      );
      setSelectedTenant(response.data);
      await fetchTenantOps(tenant.id);
    } else {
      window.alert(response.message || 'Unable to update tenant status.');
    }

    setWorkingTenantAction(null);
  };

  return (
    <div className="max-w-[1500px] mx-auto space-y-8 pb-10">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900">
            Tenant Governance
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Provision tenants, monitor onboarding, inspect tenant posture, and intervene from explicit tenant context.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          + Provision Tenant
        </button>
      </div>

      {provisioningResult && (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-600">
                Latest Provisioning Result
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {provisioningResult.tenant.name}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Onboarding status: {provisioningResult.onboarding.status}
                {provisioningResult.onboarding.deliveryError
                  ? ` • ${provisioningResult.onboarding.deliveryError}`
                  : ''}
              </p>
            </div>
            {provisioningResult.initialCredentials && (
              <div className="min-w-[280px] rounded-3xl border border-emerald-200 bg-white px-5 py-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  One-Time Credentials
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Username: {provisioningResult.initialCredentials.username}
                </p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">
                  {provisioningResult.initialCredentials.temporaryPassword}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr]">
        <section className="rounded-[2rem] border border-slate-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-900">Tenants</h3>
            <p className="mt-1 text-sm text-slate-500">
              Choose a tenant to inspect quotas, onboarding, providers, and failure posture.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3 p-6 animate-pulse">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-16 rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => void openTenantDetail(tenant)}
                  className={`w-full px-6 py-4 text-left transition ${
                    selectedTenant?.id === tenant.id ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{tenant.name}</p>
                      <p className="mt-1 text-xs font-mono text-slate-500">{tenant.id}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                        tenant.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {tenant.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    RPM {tenant.rate_limit_per_minute} • Daily {tenant.daily_notification_cap} • Templates {tenant.max_template_count}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          {!selectedTenant ? (
            <div className="flex min-h-[480px] items-center justify-center text-center text-sm text-slate-400">
              Select a tenant to open the operator detail view.
            </div>
          ) : opsLoading || !tenantOps ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="h-20 rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-3xl font-black tracking-tight text-slate-900">
                      {tenantOps.tenant.name}
                    </h3>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                        tenantOps.tenant.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {tenantOps.tenant.is_active ? 'Tenant Active' : 'Tenant Suspended'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{tenantOps.tenant.id}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tenantOps.tenant.allowed_channels.map((channel) => (
                      <span
                        key={channel}
                        className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-700"
                      >
                        {channel}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() =>
                      void handleTenantLifecycleAction(
                        selectedTenant,
                        tenantOps.tenant.is_active ? 'suspend' : 'reactivate',
                      )
                    }
                    disabled={workingTenantAction !== null}
                    className={`rounded-2xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                      tenantOps.tenant.is_active
                        ? 'border border-rose-200 bg-rose-50 text-rose-700'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {workingTenantAction === 'suspend'
                      ? 'Suspending...'
                      : workingTenantAction === 'reactivate'
                        ? 'Reactivating...'
                        : tenantOps.tenant.is_active
                          ? 'Suspend Tenant'
                          : 'Reactivate Tenant'}
                  </button>
                  <Link
                    href={`/logs?tenantId=${tenantOps.tenant.id}`}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Tenant Logs
                  </Link>
                  <Link
                    href={`/dlq?tenantId=${tenantOps.tenant.id}`}
                    className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Tenant DLQ
                  </Link>
                  <Link
                    href={`/limits?tenantId=${tenantOps.tenant.id}`}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Adjust Limits
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Usage
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    RPM {tenantOps.usage.minuteCount}/{tenantOps.usage.minuteLimit}
                  </p>
                  <p className="text-sm text-slate-700">
                    Daily {tenantOps.usage.dailyCount}/{tenantOps.usage.dailyLimit}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Template Quota
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {tenantOps.usage.templateCount}/{tenantOps.usage.templateLimit}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tenantOps.templates.totalTenantOwned} tenant-owned live templates
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Onboarding
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Failed {tenantOps.onboarding.welcomeFailed}
                  </p>
                  <p className="text-sm text-slate-700">
                    Pending {tenantOps.onboarding.welcomePending}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Delivery Risk
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Failed logs {tenantOps.failures.failedLogCount}
                  </p>
                  <p className="text-sm text-slate-700">
                    DLQ {tenantOps.failures.dlqCount}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-100 bg-white p-5">
                  <h4 className="text-lg font-bold text-slate-900">Provider Posture</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Platform visibility into tenant-owned integrations.
                  </p>
                  <div className="mt-4 rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">
                      {tenantOps.providers.count} provider configs registered
                    </p>
                    {tenantOps.providers.latest ? (
                      <>
                        <p className="mt-3 text-base font-bold text-slate-900">
                          {tenantOps.providers.latest.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {tenantOps.providers.latest.provider} • key ending {tenantOps.providers.latest.api_key_last4 || 'n/a'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Rotated {tenantOps.providers.latest.rotated_at
                            ? new Date(tenantOps.providers.latest.rotated_at).toLocaleString()
                            : 'not yet recorded'}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">
                        No provider configs recorded for this tenant.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-100 bg-white p-5">
                  <h4 className="text-lg font-bold text-slate-900">Sender Defaults</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Tenant-level delivery identity.
                  </p>
                  <div className="mt-4 rounded-3xl bg-slate-50 p-4">
                    <p className="text-base font-bold text-slate-900">
                      {tenantOps.tenant.sender_name || 'No sender name'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {tenantOps.tenant.sender_email || 'No sender email'}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Created {new Date(tenantOps.tenant.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              <section className="space-y-4">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Tenant Admins</h4>
                  <p className="text-sm text-slate-500">
                    Intervention actions require an operator reason and are captured in audit logs.
                  </p>
                </div>
                <div className="space-y-3">
                  {tenantAdmins.map((admin) => (
                    <div
                      key={admin.id}
                      className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-base font-bold text-slate-900">
                            {admin.display_name || admin.username}
                          </p>
                          <p className="text-sm text-slate-500">
                            {admin.email} • {admin.username}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Password state:{' '}
                            {admin.password_set_at
                              ? `Reset completed ${new Date(admin.password_set_at).toLocaleString()}`
                              : admin.must_reset_password
                                ? 'Awaiting first reset'
                                : 'Active credential on file'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Welcome status: {admin.welcome_delivery_status || 'NOT_SENT'}
                            {admin.welcome_delivery_error
                              ? ` • ${admin.welcome_delivery_error}`
                              : ''}
                          </p>
                          {admin.credential_intervention_locked && (
                            <p className="mt-2 text-xs font-medium text-amber-700">
                              {admin.credential_intervention_reason}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              void handleAdminAction(
                                selectedTenant.id,
                                admin.id,
                                'resend-onboarding',
                              )
                            }
                            disabled={
                              workingAdminId === admin.id ||
                              !admin.can_resend_onboarding
                            }
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Resend Onboarding
                          </button>
                          <button
                            onClick={() =>
                              void handleAdminAction(
                                selectedTenant.id,
                                admin.id,
                                'reset-temporary-password',
                              )
                            }
                            disabled={
                              workingAdminId === admin.id ||
                              !admin.can_reset_temporary_password
                            }
                            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Reset Temp Password
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tenantAdmins.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                      No tenant admins provisioned yet.
                    </div>
                  )}
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-[2rem] border border-slate-100 bg-white p-5">
                  <h4 className="text-lg font-bold text-slate-900">Recent Failures</h4>
                  <div className="mt-4 space-y-3">
                    {tenantOps.failures.recentFailures.length === 0 && (
                      <p className="text-sm text-slate-400">
                        No recent failed notification logs for this tenant.
                      </p>
                    )}
                    {tenantOps.failures.recentFailures.map((failure) => (
                      <div
                        key={failure.notification_id}
                        className="rounded-2xl bg-slate-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {failure.channel} • {failure.status}
                        </p>
                        <p className="mt-1 text-xs font-mono text-slate-500">
                          {failure.notification_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {failure.error_details || 'No error details'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[2rem] border border-slate-100 bg-white p-5">
                  <h4 className="text-lg font-bold text-slate-900">Recent Activity</h4>
                  <div className="mt-4 space-y-3">
                    {tenantOps.recentActivity.length === 0 && (
                      <p className="text-sm text-slate-400">
                        No recent activity available yet.
                      </p>
                    )}
                    {tenantOps.recentActivity.map((activity) => (
                      <div
                        key={activity.notification_id}
                        className="rounded-2xl bg-slate-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {activity.channel} • {activity.status}
                        </p>
                        <p className="mt-1 text-xs font-mono text-slate-500">
                          {activity.notification_id}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {activity.sent_at
                            ? new Date(activity.sent_at).toLocaleString()
                            : 'Pending timestamp'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-[2rem] border border-slate-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-5">
              <h3 className="text-lg font-bold text-slate-900">Provision Tenant</h3>
              <p className="mt-1 text-sm text-slate-500">
                Create a tenant, set initial quotas, bootstrap the first tenant admin, and send onboarding.
              </p>
            </div>

            <form onSubmit={handleProvision} className="space-y-6 p-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-[0.24em] text-slate-500">
                    Tenant Profile
                  </h4>
                  <input
                    required
                    className={inputClasses}
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Tenant name"
                  />
                  <input
                    className={inputClasses}
                    value={form.allowed_channels}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allowed_channels: event.target.value,
                      }))
                    }
                    placeholder="EMAIL,SMS,PUSH"
                  />
                  <div className="grid gap-4 md:grid-cols-3">
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
                      placeholder="RPM"
                    />
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
                      placeholder="Daily cap"
                    />
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
                      placeholder="Template quota"
                    />
                  </div>
                  <input
                    className={inputClasses}
                    value={form.sender_name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sender_name: event.target.value,
                      }))
                    }
                    placeholder="Default sender name"
                  />
                  <input
                    className={inputClasses}
                    type="email"
                    value={form.sender_email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sender_email: event.target.value,
                      }))
                    }
                    placeholder="Default sender email"
                  />
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-[0.24em] text-slate-500">
                    First Tenant Admin
                  </h4>
                  <input
                    required
                    className={inputClasses}
                    value={form.tenantAdmin.username}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tenantAdmin: {
                          ...current.tenantAdmin,
                          username: event.target.value,
                        },
                      }))
                    }
                    placeholder="Username"
                  />
                  <input
                    required
                    className={inputClasses}
                    type="email"
                    value={form.tenantAdmin.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tenantAdmin: {
                          ...current.tenantAdmin,
                          email: event.target.value,
                        },
                      }))
                    }
                    placeholder="Email"
                  />
                  <input
                    className={inputClasses}
                    value={form.tenantAdmin.displayName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tenantAdmin: {
                          ...current.tenantAdmin,
                          displayName: event.target.value,
                        },
                      }))
                    }
                    placeholder="Display name"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Provision Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
