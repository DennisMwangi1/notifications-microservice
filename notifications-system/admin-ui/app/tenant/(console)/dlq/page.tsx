'use client';

import { useEffect, useState } from 'react';
import { tenantApiFetch, API_URL } from '../../../../lib/api';
import { tenantAuthHeaders } from '../../../../lib/auth';

interface DlqEntry {
  id: string;
  notification_id: string;
  channel: string;
  error_details: string;
  retry_count: number;
  max_retries: number;
  permanently_failed: boolean;
  created_at: string;
  payload: Record<string, unknown>;
}

export default function TenantDlqPage() {
  const [entries, setEntries] = useState<DlqEntry[]>([]);
  const [selected, setSelected] = useState<DlqEntry | null>(null);

  useEffect(() => {
    void fetchEntries();
  }, []);

  const fetchEntries = async () => {
    const response = await tenantApiFetch<DlqEntry[]>('/api/v1/tenant/dlq');
    if (response.success) {
      setEntries(response.data || []);
    }
  };

  const retryEntry = async (id: string) => {
    await fetch(`${API_URL}/api/v1/tenant/dlq/${id}/retry`, {
      method: 'POST',
      headers: tenantAuthHeaders(),
    });
    await fetchEntries();
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">DLQ</h2>
        <p className="mt-2 text-sm text-slate-500">
          Retry tenant-scoped failed notifications without leaving your boundary.
        </p>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-600">
                  {entry.channel} · {entry.permanently_failed ? 'FAILED' : 'RETRYABLE'}
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-900">
                  {entry.notification_id}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{entry.error_details}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(entry)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Inspect
                </button>
                <button
                  onClick={() => void retryEntry(entry.id)}
                  className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
            No DLQ entries for this tenant.
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-3xl rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">DLQ Payload</h3>
              <button onClick={() => setSelected(null)} className="text-sm text-slate-500">
                Close
              </button>
            </div>
            <pre className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-700 whitespace-pre-wrap">
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
