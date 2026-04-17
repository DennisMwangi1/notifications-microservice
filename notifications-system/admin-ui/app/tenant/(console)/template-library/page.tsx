'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { tenantApiFetch } from '../../../../lib/api';

interface LibraryEntry {
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

export default function TenantTemplateLibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [selected, setSelected] = useState<LibraryEntry | null>(null);

  useEffect(() => {
    void fetchEntries();
  }, []);

  const stats = useMemo(
    () => ({
      total: entries.length,
      email: entries.filter((entry) => entry.channel_type === 'EMAIL').length,
      smsOrPush: entries.filter((entry) => entry.channel_type !== 'EMAIL').length,
    }),
    [entries],
  );

  const fetchEntries = async () => {
    const response = await tenantApiFetch<LibraryEntry[]>(
      '/api/v1/tenant/template-library',
    );

    if (response.success) {
      setEntries(response.data || []);
    }
  };

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
      const values = Object.values(value as Record<string, unknown>);

      if (values.length === 0) {
        return 1;
      }

      return values.reduce<number>(
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
            Template Library
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            The library stores reusable starters and payload shapes, while the
            playground is now the single place to create or refine them.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/tenant/templates"
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Open Templates
          </Link>
          <Link
            href="/tenant/playground"
            className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Manage In Playground
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Saved Entries"
          value={stats.total}
          detail="Reusable content blocks available to load into the playground."
        />
        <StatCard
          label="Email Entries"
          value={stats.email}
          detail="MJML-friendly starters for preview and publication flows."
        />
        <StatCard
          label="SMS + Push"
          value={stats.smsOrPush}
          detail="Text-first content for non-email delivery experiences."
        />
      </div>

      {entries.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <h3 className="text-lg font-bold text-slate-900">
            No library entries yet
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            Build a reusable template in the playground, then save it into the
            library so the team can reload it later.
          </p>
          <Link
            href="/tenant/playground"
            className="mt-5 inline-flex rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create In Playground
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
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
                  <h3 className="mt-3 text-lg font-bold text-slate-900">
                    {entry.name}
                  </h3>
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
                    onClick={() => setSelected(entry)}
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

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/20 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-[2rem] border border-slate-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 px-6 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900">
                    {selected.name}
                  </h3>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[selected.channel_type]}`}
                  >
                    {selected.channel_type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Open this entry in the playground to continue editing,
                  previewing, or publishing.
                </p>
              </div>

              <Link
                href={`/tenant/playground?libraryId=${selected.id}`}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open In Playground
              </Link>
            </div>

            <div className="space-y-5 overflow-y-auto p-6">
              {selected.subject_line && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Subject
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {selected.subject_line}
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
                      {selected.content_body}
                    </pre>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Sample JSON Shape
                  </p>
                  <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                      {JSON.stringify(selected.sample_data, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end rounded-b-[2rem] border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                onClick={() => setSelected(null)}
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
