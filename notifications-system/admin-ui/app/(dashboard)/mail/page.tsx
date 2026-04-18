'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';
import {
  MetricTile,
  PageHeader,
  StatusBadge,
  Surface,
  controlInputClassName,
  controlTextareaClassName,
} from '../../../lib/operator-console';

interface MailerConfig {
  id?: string;
  name: string;
  provider: 'RESEND' | 'SENDGRID';
  api_key_last4?: string | null;
  sender_email?: string | null;
  sender_name?: string | null;
  is_active?: boolean;
}

interface MailTemplate {
  id?: string;
  name: string;
  subject_line: string | null;
  content_body: string;
  sample_data: Record<string, unknown>;
  is_active?: boolean;
}

export default function OperationalMailerPage() {
  const [config, setConfig] = useState<MailerConfig>({
    name: 'Platform Operational Mailer',
    provider: 'RESEND',
    sender_email: '',
    sender_name: 'Nucleus Platform',
    is_active: true,
  });
  const [apiKey, setApiKey] = useState('');
  const [template, setTemplate] = useState<MailTemplate>({
    name: 'Tenant Admin Welcome',
    subject_line: 'Welcome to {{tenantName}} on Nucleus',
    content_body: '',
    sample_data: {},
    is_active: true,
  });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configRes, templateRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/admin/operational-mailer/config`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/api/v1/admin/operational-mailer/template`, {
          headers: authHeaders(),
        }),
      ]);

      const [configJson, templateJson] = await Promise.all([
        configRes.json(),
        templateRes.json(),
      ]);

      if (configJson.success && configJson.data) {
        setConfig(configJson.data);
      }

      if (templateJson.success && templateJson.data) {
        setTemplate(templateJson.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/operational-mailer/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          ...config,
          api_key: apiKey || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        setApiKey('');
        setMessage('Operational mailer configuration saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/operational-mailer/template`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(template),
      });
      const json = await res.json();
      if (json.success) {
        setTemplate(json.data);
        setMessage('Onboarding template saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  const previewTemplate = async () => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/operational-mailer/template/preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(template),
      },
    );
    const json = await res.json();
    if (json.success) {
      setPreviewHtml(json.data.html);
      setPreviewSubject(json.data.subject);
      setPreviewWarnings(json.data.warnings || []);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-5 animate-pulse">
        <div className="h-24 rounded-2xl bg-white" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 rounded-2xl bg-white" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="h-[520px] rounded-2xl bg-white" />
          <div className="h-[520px] rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <PageHeader
        eyebrow="Platform Configuration"
        title="Operational Mailer"
        description="Manage the platform-owned outbound provider, sender identity, and tenant-admin onboarding template from one controlled configuration surface."
        chips={
          <>
            <StatusBadge
              tone={config.is_active ? 'success' : 'warning'}
            >
              Mailer {config.is_active ? 'active' : 'inactive'}
            </StatusBadge>
            <StatusBadge tone="indigo">{config.provider} provider</StatusBadge>
            <StatusBadge tone={template.is_active ? 'success' : 'warning'}>
              Template {template.is_active ? 'active' : 'inactive'}
            </StatusBadge>
          </>
        }
      />

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Mailer State"
          value={config.is_active ? 'Enabled' : 'Disabled'}
          detail="Controls platform-owned welcome and operational email delivery."
          tone={config.is_active ? 'success' : 'warning'}
        />
        <MetricTile
          label="Provider"
          value={config.provider}
          detail={
            config.api_key_last4
              ? `Credential on file ending ${config.api_key_last4}`
              : 'No API credential fingerprint stored yet.'
          }
          tone="indigo"
        />
        <MetricTile
          label="Sender Identity"
          value={config.sender_name || 'Unassigned'}
          detail={config.sender_email || 'No sender email configured.'}
          tone="default"
        />
        <MetricTile
          label="Preview Warnings"
          value={previewWarnings.length}
          detail="Validation or rendering warnings returned by preview."
          tone={previewWarnings.length > 0 ? 'warning' : 'success'}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Surface
          title="Mailer Configuration"
          description="Provider credential, sender identity, and activation state for platform-owned outbound mail."
          action={
            <button
              onClick={saveConfig}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save mailer'}
            </button>
          }
        >
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Mailer name
                </label>
                <input
                  className={controlInputClassName}
                  value={config.name}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Provider
                </label>
                <select
                  className={controlInputClassName}
                  value={config.provider}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      provider: event.target.value as MailerConfig['provider'],
                    }))
                  }
                >
                  <option value="RESEND">Resend</option>
                  <option value="SENDGRID">SendGrid</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                API key
              </label>
              <input
                className={`${controlInputClassName} font-mono`}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  config.api_key_last4
                    ? `Leave blank to keep current key ending ${config.api_key_last4}`
                    : 'Enter provider API key'
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sender email
                </label>
                <input
                  className={controlInputClassName}
                  value={config.sender_email || ''}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      sender_email: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sender name
                </label>
                <input
                  className={controlInputClassName}
                  value={config.sender_name || ''}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      sender_name: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.is_active ?? true}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              Mailer is active and available for platform-owned sends
            </label>
          </div>
        </Surface>

        <Surface
          title="Onboarding Template"
          description="MJML + Handlebars content used when a tenant admin is provisioned."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                onClick={previewTemplate}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Preview
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save template'}
              </button>
            </div>
          }
        >
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Template name
                </label>
                <input
                  className={controlInputClassName}
                  value={template.name}
                  onChange={(event) =>
                    setTemplate((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Subject line
                </label>
                <input
                  className={controlInputClassName}
                  value={template.subject_line || ''}
                  onChange={(event) =>
                    setTemplate((current) => ({
                      ...current,
                      subject_line: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Content body
              </label>
              <textarea
                className={`${controlTextareaClassName} min-h-72 font-mono`}
                value={template.content_body}
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    content_body: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sample data
              </label>
              <textarea
                className={`${controlTextareaClassName} min-h-44 font-mono`}
                value={JSON.stringify(template.sample_data || {}, null, 2)}
                onChange={(event) => {
                  try {
                    setTemplate((current) => ({
                      ...current,
                      sample_data: JSON.parse(event.target.value) as Record<
                        string,
                        unknown
                      >,
                    }));
                  } catch {
                    // Invalid JSON is tolerated during editing and validated on preview/save.
                  }
                }}
              />
            </div>
          </div>
        </Surface>
      </section>

      {(previewSubject || previewHtml) ? (
        <Surface
          title="Rendered Preview"
          description="Preview the current template payload before saving to verify substitutions and formatting."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Subject
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {previewSubject}
              </p>
            </div>

            {previewWarnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {previewWarnings.join(' | ')}
              </div>
            ) : null}

            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
            />
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
