'use client';

import { useEffect, useState } from 'react';
import { tenantApiFetch } from '../../../../lib/api';

interface LogEntry {
  notification_id: string;
  template_id: string;
  channel: string;
  status: string;
  provider_ref: string | null;
  sent_at: string | null;
  error_details: string | null;
  metadata: Record<string, unknown> | null;
}

export default function TenantLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    void fetchLogs();
  }, [channel, status]);

  const fetchLogs = async () => {
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (status) params.set('status', status);
    const response = await tenantApiFetch<LogEntry[]>(
      `/api/v1/tenant/logs?${params.toString()}`,
    );
    if (response.success) {
      setLogs(response.data || []);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">Logs</h2>
        <p className="mt-2 text-sm text-slate-500">
          Review tenant delivery outcomes across channels.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="">All Channels</option>
          <option value="EMAIL">EMAIL</option>
          <option value="SMS">SMS</option>
          <option value="PUSH">PUSH</option>
        </select>
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="SENT">SENT</option>
          <option value="DELIVERED">DELIVERED</option>
          <option value="FAILED">FAILED</option>
          <option value="RETRYING">RETRYING</option>
        </select>
      </div>

      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.notification_id}
            className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">
                  {log.channel} · {log.status}
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-900">
                  {log.template_id}
                </h3>
                <p className="mt-1 text-xs font-mono text-slate-500">
                  {log.notification_id}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>{log.sent_at ? new Date(log.sent_at).toLocaleString() : 'Pending'}</p>
                <p>{log.provider_ref || 'No provider reference'}</p>
              </div>
            </div>
            {log.error_details && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {log.error_details}
              </div>
            )}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
            No logs found for the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
