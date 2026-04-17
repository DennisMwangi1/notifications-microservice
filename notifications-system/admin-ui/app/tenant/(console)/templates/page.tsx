'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { tenantApiFetch } from '../../../../lib/api';

interface Template {
  template_id: string;
  version: number;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line: string | null;
  content_body: string;
  is_active: boolean;
  event_type: string;
  target_ws_channel: string | null;
  created_at: string | null;
}

interface TemplateLibraryEntry {
  id: string;
  name: string;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line: string | null;
  content_body: string;
  sample_data: Record<string, unknown>;
  created_at: string;
}

const channelBadge: Record<string, string> = {
  EMAIL: 'bg-sky-50 text-sky-700 border-sky-200',
  SMS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUSH: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function TenantTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateLibrary, setTemplateLibrary] = useState<TemplateLibraryEntry[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
  const [versionHistory, setVersionHistory] = useState<Template[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [libraryDetail, setLibraryDetail] = useState<TemplateLibraryEntry | null>(
    null,
  );

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    try {
      const [templatesResponse, libraryResponse] = await Promise.all([
        tenantApiFetch<Template[]>('/api/v1/tenant/templates'),
        tenantApiFetch<TemplateLibraryEntry[]>('/api/v1/tenant/template-library'),
      ]);

      if (templatesResponse.success) {
        setTemplates(templatesResponse.data || []);
      }

      if (libraryResponse.success) {
        setTemplateLibrary(libraryResponse.data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (template: Template) => {
    setDetailTemplate(template);
    setLoadingHistory(true);

    const response = await tenantApiFetch<Template[]>(
      `/api/v1/tenant/templates/${template.template_id}/versions`,
    );

    if (response.success) {
      setVersionHistory(response.data || []);
    }

    setLoadingHistory(false);
  };

  const latestTemplates = Object.values(
    templates.reduce<Record<string, Template>>((acc, template) => {
      if (
        !acc[template.template_id] ||
        template.version > acc[template.template_id].version
      ) {
        acc[template.template_id] = template;
      }

      return acc;
    }, {}),
  );

  const countSampleDataLeaves = (value: unknown): number => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 1;
      }

      return value.reduce(
        (total, item) => total + countSampleDataLeaves(item),
        0,
      );
    }

    if (value && typeof value === 'object') {
      const entries = Object.values(value as Record<string, unknown>);

      if (entries.length === 0) {
        return 1;
      }

      return entries.reduce<number>(
        (total, item) => total + countSampleDataLeaves(item),
        0,
      );
    }

    return 1;
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-10 pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900">
            Templates
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Template authoring, edits, publishing, and runtime interventions now
            happen in the playground. This page stays focused on visibility into
            what is live and what is saved in the library.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/tenant/playground"
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Open Playground
          </Link>
          <Link
            href="/tenant/template-library"
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Open Library
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Live Templates"
          value={latestTemplates.length}
          detail="Current runtime template lineages published for this tenant."
        />
        <StatCard
          label="Stored Versions"
          value={templates.length}
          detail="Version history across all tenant runtime templates."
        />
        <StatCard
          label="Library Entries"
          value={templateLibrary.length}
          detail="Reusable starters available to load into the playground."
        />
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Live Runtime Templates</h3>
            <p className="mt-1 text-sm text-slate-500">
              Inspect the currently published templates, then jump into the
              playground to make the next version or retire the active one.
            </p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
            Managed in playground
          </p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="h-16 rounded-[1.8rem] border border-slate-100 bg-slate-100"
              />
            ))}
          </div>
        ) : latestTemplates.length === 0 ? (
          <EmptyState
            title="No live templates yet"
            description="Start in the playground to preview content, validate variables, and publish the first live template for this tenant."
            href="/tenant/playground"
            cta="Create In Playground"
          />
        ) : (
          <div className="space-y-3">
            {latestTemplates.map((template) => (
              <article
                key={template.template_id}
                className={`rounded-[1.9rem] border border-slate-200 bg-white p-5 shadow-sm transition ${
                  !template.is_active ? 'opacity-70' : ''
                }`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[template.channel_type]}`}
                      >
                        {template.channel_type}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                          template.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {template.is_active ? 'Live' : 'Inactive'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                        v{template.version}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-slate-900">
                        {template.event_type}
                      </h4>
                      <p className="mt-1 text-sm text-slate-500">
                        {template.subject_line || 'No subject line for this channel.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                      <span className="font-mono text-slate-400">
                        {template.template_id}
                      </span>
                      <span>
                        Published{' '}
                        {template.created_at
                          ? new Date(template.created_at).toLocaleString()
                          : 'recently'}
                      </span>
                      {template.channel_type === 'PUSH' && (
                        <span>WS channel: {template.target_ws_channel || 'global_system'}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button
                      onClick={() => void handleViewDetail(template)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Inspect
                    </button>
                    <Link
                      href={`/tenant/playground?templateId=${template.template_id}&version=${template.version}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Manage In Playground
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Template Library</h3>
            <p className="mt-1 text-sm text-slate-500">
              Reusable starter content and sample payloads for faster playground
              workflows.
            </p>
          </div>
          <Link
            href="/tenant/playground"
            className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 transition hover:text-slate-700"
          >
            Save new entries from playground
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="h-56 rounded-[1.8rem] border border-slate-100 bg-slate-100"
              />
            ))}
          </div>
        ) : templateLibrary.length === 0 ? (
          <EmptyState
            title="No library entries saved yet"
            description="Load a draft into the playground, refine it with preview data, then save it back into the library for future use."
            href="/tenant/playground"
            cta="Build A Library Entry"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templateLibrary.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[entry.channel_type]}`}
                    >
                      {entry.channel_type}
                    </span>
                    <h4 className="mt-3 text-lg font-bold text-slate-900">
                      {entry.name}
                    </h4>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {countSampleDataLeaves(entry.sample_data)} vars
                  </span>
                </div>

                <p className="mt-3 line-clamp-3 text-sm text-slate-500">
                  {entry.subject_line || entry.content_body}
                </p>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Sample JSON Shape
                  </p>
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {JSON.stringify(entry.sample_data, null, 2)}
                  </pre>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400">
                    Saved {new Date(entry.created_at).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLibraryDetail(entry)}
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      View
                    </button>
                    <Link
                      href={`/tenant/playground?libraryId=${entry.id}`}
                      className="rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
                    >
                      Open In Playground
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {detailTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/20 p-4 backdrop-blur-sm"
          onClick={() => {
            setDetailTemplate(null);
            setVersionHistory([]);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[2rem] border border-slate-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    {detailTemplate.event_type}
                  </h3>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[detailTemplate.channel_type]}`}
                  >
                    {detailTemplate.channel_type}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Template ID:{' '}
                  <span className="font-mono text-slate-600">
                    {detailTemplate.template_id}
                  </span>
                </p>
              </div>

              <Link
                href={`/tenant/playground?templateId=${detailTemplate.template_id}&version=${detailTemplate.version}`}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Manage In Playground
              </Link>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              {detailTemplate.subject_line && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Subject
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {detailTemplate.subject_line}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                  Content Body
                </p>
                <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {detailTemplate.content_body}
                  </pre>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
                      Version History
                    </h4>
                    <p className="mt-1 text-sm text-slate-500">
                      Open any version in the playground to create the next
                      iteration or deactivate that version.
                    </p>
                  </div>
                </div>

                {loadingHistory ? (
                  <div className="mt-4 text-sm text-slate-400">Loading history...</div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {versionHistory.map((version) => (
                      <div
                        key={version.version}
                        className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 md:flex-row md:items-center md:justify-between ${
                          version.is_active
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                              v{version.version}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                version.is_active
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {version.is_active ? 'Live' : 'Inactive'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {version.subject_line || version.event_type}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {version.created_at
                              ? new Date(version.created_at).toLocaleString()
                              : 'Recently created'}
                          </p>
                        </div>

                        <Link
                          href={`/tenant/playground?templateId=${version.template_id}&version=${version.version}`}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Open In Playground
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {libraryDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/20 p-4 backdrop-blur-sm"
          onClick={() => setLibraryDetail(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[2rem] border border-slate-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 px-6 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900">
                    {libraryDetail.name}
                  </h3>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[libraryDetail.channel_type]}`}
                  >
                    {libraryDetail.channel_type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Load this saved starter into the playground to continue
                  editing, previewing, or publishing.
                </p>
              </div>

              <Link
                href={`/tenant/playground?libraryId=${libraryDetail.id}`}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open In Playground
              </Link>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              {libraryDetail.subject_line && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Subject
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {libraryDetail.subject_line}
                  </p>
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Content Body
                  </p>
                  <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                      {libraryDetail.content_body}
                    </pre>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Sample JSON Shape
                  </p>
                  <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                      {JSON.stringify(libraryDetail.sample_data, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end rounded-b-[2rem] border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                onClick={() => setLibraryDetail(null)}
                className="rounded-2xl px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <h4 className="text-lg font-bold text-slate-900">{title}</h4>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
        {description}
      </p>
      <Link
        href={href}
        className="mt-5 inline-flex rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {cta}
      </Link>
    </div>
  );
}
