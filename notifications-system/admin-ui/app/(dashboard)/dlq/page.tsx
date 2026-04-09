'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

interface DLQEntry {
  id: string;
  notification_id: string;
  tenant_id: string;
  channel: string;
  payload: Record<string, unknown>;
  error_details: string;
  retry_count: number;
  max_retries: number;
  permanently_failed: boolean;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const channelColors: Record<string, { bg: string; text: string; border: string }> = {
  EMAIL: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
  SMS: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  PUSH: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  REALTIME: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
};

export default function DLQPage() {
  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'permanent' | 'retryable'>('all');
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filter === 'permanent') params.set('permanentlyFailed', 'true');
      if (filter === 'retryable') params.set('permanentlyFailed', 'false');

      const res = await fetch(`${API_URL}/api/v1/admin/dlq?${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) {
        setEntries(json.data);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch DLQ entries:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleRetry = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/dlq/${id}/retry`, { method: 'POST', headers: authHeaders() });
      await fetchEntries();
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryAll = async () => {
    setActionLoading('retry-all');
    try {
      await fetch(`${API_URL}/api/v1/admin/dlq/retry-all`, { method: 'POST', headers: authHeaders() });
      await fetchEntries();
    } catch (err) {
      console.error('Retry all failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurge = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this DLQ entry?')) return;
    setActionLoading(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/dlq/${id}`, { method: 'DELETE', headers: authHeaders() });
      setSelectedEntry(null);
      await fetchEntries();
    } catch (err) {
      console.error('Purge failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-56"></div>
        <div className="h-12 bg-slate-100 rounded-xl"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-2xl border border-slate-200"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="border-b border-slate-200 pb-8 mt-2 relative">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-gradient-to-br from-rose-100 to-orange-50 rounded-full blur-3xl opacity-50 -z-10"></div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-4xl font-black tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-2">Dead Letter Queue</h2>
            <p className="text-sm font-medium text-slate-500">Manage failed notification deliveries. Retry or purge entries that could not be delivered.</p>
          </div>
          <button
            onClick={handleRetryAll}
            disabled={actionLoading === 'retry-all' || entries.length === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 whitespace-nowrap"
          >
            {actionLoading === 'retry-all' ? 'Retrying…' : '🔄 Retry All Failed'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'permanent', 'retryable'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all ${
              filter === f
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f === 'all' ? 'All' : f === 'permanent' ? 'Permanently Failed' : 'Retryable'}
          </button>
        ))}
        {pagination && (
          <span className="ml-auto text-xs text-slate-400 self-center font-mono">
            {pagination.total} total entries
          </span>
        )}
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">No failed notifications</h3>
          <p className="text-sm text-slate-400">All notifications have been successfully delivered or retried.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const chColor = channelColors[entry.channel] || channelColors.EMAIL;
            return (
              <div
                key={entry.id}
                onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer ${
                  selectedEntry?.id === entry.id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${entry.permanently_failed ? 'bg-rose-400' : 'bg-amber-400'}`} />
                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${chColor.bg} ${chColor.text} border ${chColor.border}`}>
                      {entry.channel}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-mono">{entry.notification_id.substring(0, 12)}…</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{entry.error_details}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      entry.permanently_failed
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : 'bg-amber-100 text-amber-700 border border-amber-200'
                    }`}>
                      {entry.permanently_failed ? 'Failed' : `Retry #${entry.retry_count}`}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono w-32 text-right">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {selectedEntry?.id === entry.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-4" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Tenant ID</p>
                        <p className="text-xs font-mono text-slate-700 break-all">{entry.tenant_id}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Retries</p>
                        <p className="text-xs font-mono text-slate-700">{entry.retry_count} / {entry.max_retries}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Last Updated</p>
                        <p className="text-xs font-mono text-slate-700">{new Date(entry.updated_at).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Error Details</p>
                      <p className="text-xs text-rose-600 font-mono whitespace-pre-wrap">{entry.error_details}</p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Original Payload</p>
                      <pre className="text-xs text-slate-600 font-mono overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleRetry(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === entry.id ? 'Retrying…' : '🔄 Retry'}
                      </button>
                      <button
                        onClick={() => handlePurge(entry.id)}
                        disabled={actionLoading === entry.id}
                        className="px-4 py-2 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50"
                      >
                        🗑 Purge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500 font-mono">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pagination.pages, page + 1))}
            disabled={page === pagination.pages}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
