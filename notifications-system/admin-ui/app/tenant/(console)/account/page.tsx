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
import {
  KeyValueGrid,
  MetricTile,
  PageHeader,
  StatusBadge,
  Surface,
  controlInputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  cx,
} from '../../../../lib/operator-console';

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
    <div className="mx-auto max-w-[1650px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Tenant Identity"
        title={isForcedReset ? 'Complete Password Reset' : 'Account & Access'}
        description={
          isForcedReset
            ? 'Your temporary credential must be replaced before tenant-console access is fully restored.'
            : 'Review your tenant-admin identity, monitor session posture, and rotate your password from the same workspace used across the rest of the console.'
        }
        chips={
          <>
            <StatusBadge tone={isForcedReset ? 'warning' : 'success'}>
              {isForcedReset ? 'Reset required' : 'Account active'}
            </StatusBadge>
            <StatusBadge tone="indigo">Tenant admin</StatusBadge>
            <StatusBadge tone="default">Tenant-scoped session</StatusBadge>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Access State"
          value={isForcedReset ? 'Gated' : 'Ready'}
          detail={
            isForcedReset
              ? 'Some tenant-console actions remain restricted until this reset is completed.'
              : 'Your tenant session is ready for template work, provider updates, and delivery review.'
          }
          tone={isForcedReset ? 'warning' : 'success'}
        />
        <MetricTile
          label="Role"
          value="Tenant Admin"
          detail="This session authorizes activity inside your tenant boundary only."
          tone="indigo"
        />
        <MetricTile
          label="Identity"
          value={displayName}
          detail={user?.email || 'No email available'}
          tone="default"
        />
        <MetricTile
          label="Password Policy"
          value="8+ chars"
          detail="Use a unique password not reused in staging, internal, or personal systems."
          tone="default"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <Surface
          title="Credential Update"
          description={
            isForcedReset
              ? 'Use the temporary onboarding password one last time, then set a permanent credential.'
              : 'Enter your current password to rotate credentials without leaving the tenant console.'
          }
        >
          {message ? (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleChangePassword} className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {isForcedReset ? 'Temporary password' : 'Current password'}
                </span>
                <input
                  id="current-password"
                  className={controlInputClassName}
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={isForcedReset ? 'Temporary password' : 'Current password'}
                  autoComplete="current-password"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  New password
                </span>
                <input
                  id="new-password"
                  className={controlInputClassName}
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">What happens next</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isForcedReset
                  ? 'Once the password is changed, first-login recovery actions from the platform owner are locked and you will be returned to the tenant console.'
                  : 'Your current tenant session stays active, and the new password becomes the credential required for future sign-ins.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={saving}
                className={cx(
                  primaryButtonClassName,
                  saving && 'cursor-wait bg-slate-300 text-slate-600 hover:bg-slate-300',
                )}
              >
                {saving
                  ? 'Saving...'
                  : isForcedReset
                    ? 'Complete Password Reset'
                    : 'Save New Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setError(null);
                  setMessage(null);
                }}
                className={secondaryButtonClassName}
              >
                Clear form
              </button>
            </div>
          </form>
        </Surface>

        <div className="space-y-4">
          <Surface
            title="Identity Snapshot"
            description="Current tenant-admin identity and reset posture."
          >
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-lg font-black text-white shadow-sm">
                {initials || 'TA'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-black tracking-tight text-slate-950">
                  {displayName}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {user?.email || 'No email available'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <KeyValueGrid
                columns={2}
                items={[
                  { label: 'Username', value: user?.username || 'Not available' },
                  { label: 'Role', value: 'Tenant Admin' },
                  {
                    label: 'Tenant ID',
                    value: <span className="font-mono text-xs">{user?.tenantId || '—'}</span>,
                  },
                  {
                    label: 'Password state',
                    value: isForcedReset ? 'Reset required' : 'Up to date',
                  },
                ]}
              />
            </div>
          </Surface>

          <Surface
            title="Security Notes"
            description="Guidance that matches the rest of the tenant operations workspace."
          >
            <div className="space-y-3">
              <TipCard
                title="Temporary passwords are one-time"
                detail="After the first successful reset, onboarding resend and temporary password recovery are intentionally locked."
              />
              <TipCard
                title="Tenant access stays isolated"
                detail="This session authorizes activity inside your tenant boundary and never grants platform-owner privileges."
              />
              <TipCard
                title="Choose a strong password"
                detail="Use a unique passphrase that is not reused from any internal, staging, or personal account."
              />
            </div>
          </Surface>
        </div>
      </section>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
