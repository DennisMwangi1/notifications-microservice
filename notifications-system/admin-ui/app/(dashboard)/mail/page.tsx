'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

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
        setMessage('Operational mailer saved.');
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
    return <div className="max-w-[1200px] mx-auto animate-pulse h-80 bg-white rounded-[2rem] border border-slate-100" />;
  }

  const inputClasses =
    'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50';

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
          Operational Mailer
        </h2>
        <p className="text-sm text-slate-500">
          Manage the platform-owned outbound mailer and the tenant-admin welcome
          template.
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Mailer Config</h3>
            <p className="text-sm text-slate-500">
              Used for platform-owned onboarding and operational emails.
            </p>
          </div>

          <input
            className={inputClasses}
            value={config.name}
            onChange={(event) =>
              setConfig((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Mailer name"
          />

          <select
            className={inputClasses}
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

          <input
            className={`${inputClasses} font-mono`}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              config.api_key_last4
                ? `Leave blank to keep current key ending ${config.api_key_last4}`
                : 'API key'
            }
          />

          <div className="grid gap-4 md:grid-cols-2">
            <input
              className={inputClasses}
              value={config.sender_email || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  sender_email: event.target.value,
                }))
              }
              placeholder="Sender email"
            />
            <input
              className={inputClasses}
              value={config.sender_name || ''}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  sender_name: event.target.value,
                }))
              }
              placeholder="Sender name"
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-600">
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
            Mailer is active
          </label>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold"
          >
            Save Mailer
          </button>
        </section>

        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Onboarding Template</h3>
            <p className="text-sm text-slate-500">
              MJML + Handlebars template used when a tenant admin is provisioned.
            </p>
          </div>

          <input
            className={inputClasses}
            value={template.name}
            onChange={(event) =>
              setTemplate((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Template name"
          />
          <input
            className={inputClasses}
            value={template.subject_line || ''}
            onChange={(event) =>
              setTemplate((current) => ({
                ...current,
                subject_line: event.target.value,
              }))
            }
            placeholder="Subject line"
          />
          <textarea
            className={`${inputClasses} min-h-60 font-mono`}
            value={template.content_body}
            onChange={(event) =>
              setTemplate((current) => ({
                ...current,
                content_body: event.target.value,
              }))
            }
          />
          <textarea
            className={`${inputClasses} min-h-40 font-mono`}
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
                // Keep editing UX tolerant; invalid JSON is resolved on save/preview.
              }
            }}
          />

          <div className="flex gap-3">
            <button
              onClick={saveTemplate}
              disabled={saving}
              className="px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold"
            >
              Save Template
            </button>
            <button
              onClick={previewTemplate}
              className="px-5 py-2.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700"
            >
              Preview
            </button>
          </div>
        </section>
      </div>

      {(previewSubject || previewHtml) && (
        <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Preview</h3>
            <p className="text-sm text-slate-500">{previewSubject}</p>
          </div>
          {previewWarnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {previewWarnings.join(' | ')}
            </div>
          )}
          <div
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            dangerouslySetInnerHTML={{ __html: previewHtml || '' }}
          />
        </section>
      )}
    </div>
  );
}
