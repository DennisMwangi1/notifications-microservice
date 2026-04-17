'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tenantApiFetch } from '../../../../lib/api';
import {
  getTenantToken,
  getTenantUser,
  setTenantAuth,
  type TenantUser,
} from '../../../../lib/auth';

const inputClasses =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20';

export default function TenantAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<TenantUser | null>(getTenantUser());
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await tenantApiFetch<TenantUser>('/api/v1/tenant/auth/me');

      if (response.success && response.data) {
        setUser(response.data);
        const token = getTenantToken();

        if (token) {
          setTenantAuth(token, response.data);
        }
      }
    })();
  }, []);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    const response = await tenantApiFetch<TenantUser>(
      '/api/v1/tenant/auth/change-password',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      },
    );

    if (response.success && response.data) {
      const token = getTenantToken();

      if (token) {
        setTenantAuth(token, response.data);
      }

      setUser(response.data);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password updated successfully.');

      if (searchParams.get('mode') === 'reset') {
        router.replace('/tenant');
      }
    } else {
      setError(response.message || 'Unable to update password');
    }

    setSaving(false);
  };

  const isForcedReset =
    user?.mustResetPassword || searchParams.get('mode') === 'reset';
  const displayName = user?.displayName || user?.username || 'Tenant Admin';
  const initials = displayName
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-[1480px] space-y-8 pb-14">
      <section className="overflow-hidden rounded-[2.4rem] border border-orange-100 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.22),_transparent_38%),linear-gradient(135deg,#fff7ed_0%,#ffffff_52%,#fffbeb_100%)] shadow-[0_30px_90px_-45px_rgba(194,65,12,0.45)]">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-700">
              Account Security
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-900">
              {isForcedReset
                ? 'Complete your first-login reset'
                : 'Manage your tenant admin account'}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {isForcedReset
                ? 'Your temporary password has served its purpose. Set a permanent credential before continuing into the tenant console.'
                : 'Review your tenant-admin identity, confirm your access posture, and rotate your password whenever you need to.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <StatusChip
                label={isForcedReset ? 'Password Reset Required' : 'Password Healthy'}
                tone={isForcedReset ? 'amber' : 'emerald'}
              />
              <StatusChip label="Tenant Console" tone="slate" />
              <StatusChip label="Tenant Scoped Session" tone="orange" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              Identity Snapshot
            </p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-lg font-black text-white shadow-lg shadow-slate-900/20">
                {initials || 'TA'}
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">{displayName}</h3>
                <p className="text-sm text-slate-500">{user?.email || 'No email available'}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[1.5rem] border border-slate-100 bg-slate-50/90 p-4">
              <InfoRow label="Username" value={user?.username || '—'} mono />
              <InfoRow label="Role" value="Tenant Admin" />
              <InfoRow label="Tenant ID" value={user?.tenantId || '—'} mono />
              <InfoRow
                label="Password state"
                value={isForcedReset ? 'Reset required' : 'Up to date'}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              Credential Update
            </p>
            <h3 className="mt-3 text-2xl font-black text-slate-900">
              {isForcedReset ? 'Replace Temporary Password' : 'Rotate Password'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {isForcedReset
                ? 'Use the temporary password from onboarding one last time, then choose a permanent password with at least 8 characters.'
                : 'Enter your current password to set a new one and keep tenant access locked down.'}
            </p>
          </div>

          {message && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="mt-6 space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <label
                  htmlFor="current-password"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500"
                >
                  {isForcedReset ? 'Temporary password' : 'Current password'}
                </label>
                <input
                  id="current-password"
                  className={inputClasses}
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={isForcedReset ? 'Temporary password' : 'Current password'}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  className={inputClasses}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-orange-100 bg-orange-50/70 p-4">
              <p className="text-sm font-semibold text-slate-900">
                What happens next
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {isForcedReset
                  ? 'Once this password is changed, first-login recovery actions from the platform owner are locked and you will be redirected back into the console.'
                  : 'Your existing tenant session stays active, and your new password becomes the credential required for the next login.'}
              </p>
            </div>

            <button
              disabled={saving}
              className={`inline-flex rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                saving
                  ? 'cursor-wait bg-slate-200 text-slate-500'
                  : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800'
              }`}
            >
              {saving
                ? 'Saving...'
                : isForcedReset
                  ? 'Complete Password Reset'
                  : 'Save New Password'}
            </button>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              Security Notes
            </p>
            <div className="mt-4 space-y-4">
              <TipCard
                title="Temporary passwords are one-time"
                detail="After your first successful password reset, onboarding resend and temporary password recovery are intentionally locked."
              />
              <TipCard
                title="Tenant access stays isolated"
                detail="This session only authorizes activity inside your tenant boundary and does not grant platform-owner privileges."
              />
              <TipCard
                title="Choose a strong password"
                detail="Use a unique passphrase that is not reused from any internal, staging, or personal account."
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-200">
              Session Posture
            </p>
            <p className="mt-4 text-2xl font-black">
              {isForcedReset ? 'Restricted Until Reset' : 'Ready For Operations'}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {isForcedReset
                ? 'Some tenant-console actions remain gated until this reset is finished.'
                : 'Your account is ready for template authoring, provider updates, and delivery review.'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'amber' | 'emerald' | 'orange' | 'slate';
}) {
  const toneClasses = {
    amber: 'bg-amber-100 text-amber-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    orange: 'bg-orange-100 text-orange-800',
    slate: 'bg-slate-200 text-slate-700',
  } as const;

  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-semibold text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function TipCard({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
