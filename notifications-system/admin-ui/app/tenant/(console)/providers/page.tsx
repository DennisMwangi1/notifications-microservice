'use client';

import { useEffect, useMemo, useState } from 'react';
import { tenantApiFetch } from '../../../../lib/api';

interface ProviderConfig {
  id: string;
  name: string;
  provider: 'SENDGRID' | 'RESEND' | 'TWILIO' | 'AFRICASTALKING' | 'CUSTOM';
  api_key_last4?: string | null;
  key_version?: number;
  sender_email?: string | null;
  sender_name?: string | null;
  created_at: string;
}

const providerBadge: Record<ProviderConfig['provider'], string> = {
  RESEND: 'bg-sky-50 text-sky-600 border-sky-200',
  SENDGRID: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  TWILIO: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  AFRICASTALKING: 'bg-amber-50 text-amber-600 border-amber-200',
  CUSTOM: 'bg-slate-100 text-slate-600 border-slate-200',
};

const inputClasses =
  'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white transition-all shadow-sm';

export default function TenantProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    provider: 'RESEND' as ProviderConfig['provider'],
    api_key: '',
    sender_email: '',
    sender_name: '',
  });

  useEffect(() => {
    void fetchProviders();
  }, []);

  const stats = useMemo(
    () => ({
      total: providers.length,
      senderReady: providers.filter((provider) => provider.sender_email).length,
      highestKeyVersion: providers.reduce(
        (highest, provider) => Math.max(highest, provider.key_version || 1),
        0,
      ),
    }),
    [providers],
  );

  const fetchProviders = async () => {
    const response = await tenantApiFetch<ProviderConfig[]>(
      '/api/v1/tenant/providers',
    );
    if (response.success) {
      setProviders(response.data || []);
    }
  };

  const saveProvider = async (event: React.FormEvent) => {
    event.preventDefault();
    const path = editing
      ? `/api/v1/tenant/providers/${editing.id}`
      : '/api/v1/tenant/providers';
    const method = editing ? 'PUT' : 'POST';

    const response = await tenantApiFetch(path, {
      method,
      body: JSON.stringify({
        name: form.name,
        provider: form.provider,
        api_key: form.api_key || undefined,
        sender_email: form.sender_email || undefined,
        sender_name: form.sender_name || undefined,
      }),
    });

    if (response.success) {
      setShowCreate(false);
      setEditing(null);
      setForm({
        name: '',
        provider: 'RESEND',
        api_key: '',
        sender_email: '',
        sender_name: '',
      });
      await fetchProviders();
    }
  };

  const openEdit = (provider: ProviderConfig) => {
    setEditing(provider);
    setShowCreate(true);
    setForm({
      name: provider.name,
      provider: provider.provider,
      api_key: '',
      sender_email: provider.sender_email || '',
      sender_name: provider.sender_name || '',
    });
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
            Providers
          </h2>
          <p className="text-sm text-slate-500">
            Register, update, and rotate tenant-owned delivery provider
            credentials.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowCreate(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 hover:-translate-y-0.5 px-5 py-2.5 rounded-2xl font-medium transition-all shadow-sm"
        >
          + Add Provider
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">
            Registered Providers
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {stats.total}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Tenant-owned provider integrations currently available for delivery.
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">
            Sender Ready
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {stats.senderReady}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Providers already configured with sender identity metadata.
          </p>
        </div>
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">
            Key Versions
          </p>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {stats.highestKeyVersion}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Highest tracked key rotation version across this tenant&apos;s
            provider set.
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900">
            Provider Inventory
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Review configured credentials, sender defaults, and rotation posture
            for this tenant.
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
            <div className="col-span-2">Provider</div>
            <div className="col-span-3">Name</div>
            <div className="col-span-2">Credential</div>
            <div className="col-span-3">Sender Identity</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {providers.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No tenant providers configured yet. Add your first provider to
              enable delivery.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50/50 transition-colors"
                >
                  <div className="col-span-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${providerBadge[provider.provider]}`}
                    >
                      {provider.provider}
                    </span>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {provider.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Added {new Date(provider.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-mono text-slate-600">
                      •••• {provider.api_key_last4 || 'n/a'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      v{provider.key_version || 1}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-xs text-slate-600">
                      {provider.sender_name || 'Sender unset'}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      {provider.sender_email || 'No sender email'}
                    </p>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => openEdit(provider)}
                      className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Edit / Rotate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {showCreate && (
        <div
          className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
              {editing ? (
                <>
                  <h3 className="text-lg font-bold text-slate-900">
                    Edit Provider
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Update sender settings or rotate the underlying credential.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-slate-900">
                    Create Provider
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Register a new tenant-owned provider configuration for
                    delivery.
                  </p>
                </>
              )}
            </div>
            <div className="overflow-y-auto p-6">
              <form id="providerForm" onSubmit={saveProvider} className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                    Provider Name
                  </label>
                  <input
                    className={inputClasses}
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Provider name"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                    Provider Type
                  </label>
                  <select
                    className={inputClasses}
                    value={form.provider}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        provider: event.target.value as ProviderConfig['provider'],
                      }))
                    }
                  >
                    <option value="RESEND">RESEND</option>
                    <option value="SENDGRID">SENDGRID</option>
                    <option value="TWILIO">TWILIO</option>
                    <option value="AFRICASTALKING">AFRICASTALKING</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                    API Key
                  </label>
                  <input
                    className={`${inputClasses} font-mono`}
                    type="password"
                    value={form.api_key}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, api_key: event.target.value }))
                    }
                    placeholder={
                      editing
                        ? 'Leave blank to keep the current key'
                        : 'Provider API key'
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                      Sender Email
                    </label>
                    <input
                      className={inputClasses}
                      value={form.sender_email}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          sender_email: event.target.value,
                        }))
                      }
                      placeholder="Sender email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                      Sender Name
                    </label>
                    <input
                      className={inputClasses}
                      value={form.sender_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          sender_name: event.target.value,
                        }))
                      }
                      placeholder="Sender name"
                    />
                  </div>
                </div>
              </form>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="providerForm"
                className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-sm"
              >
                {editing ? 'Save Provider' : 'Create Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
