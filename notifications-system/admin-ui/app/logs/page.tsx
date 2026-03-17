'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface NotificationLog {
    notification_id: string;
    user_id: string;
    template_id: string;
    channel: string;
    status: string;
    metadata: Record<string, unknown> | null;
    provider_ref: string | null;
    sent_at: string | null;
    error_details: string | null;
}

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface DlqSummary {
    total: number;
    permanentlyFailed: number;
    pendingRetry: number;
}

interface FailedNotification {
    id: string;
    notification_id: string;
    tenant_id: string;
    channel: string;
    payload: Record<string, any>;
    error_details: string;
    retry_count: number;
    max_retries: number;
    permanently_failed: boolean;
    created_at: string;
    updated_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const channelColors: Record<string, { bg: string; text: string; border: string }> = {
    EMAIL: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
    SMS: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    PUSH: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
};

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
    SENT: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
    DELIVERED: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
    FAILED: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-400' },
};

// ─── Audit Logs Component ───────────────────────────────────────────────────

function AuditLogsView() {
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 25, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [filterChannel, setFilterChannel] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [expandedLog, setExpandedLog] = useState<string | null>(null);

    useEffect(() => {
        fetchLogs(1);
    }, [filterChannel, filterStatus]);

    const fetchLogs = async (page: number) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: String(page), limit: '25' });
            if (filterChannel) params.set('channel', filterChannel);
            if (filterStatus) params.set('status', filterStatus);

            const res = await fetch(`${API_URL}/api/v1/admin/logs?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setLogs(json.data);
                setPagination(json.pagination);
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                    <span>Total: <span className="font-bold text-slate-700">{pagination.total}</span> records</span>
                    <span className="text-slate-300">|</span>
                    <span>Page <span className="font-bold text-slate-700">{pagination.page}</span> of <span className="font-bold text-slate-700">{pagination.totalPages || 1}</span></span>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={filterChannel}
                        onChange={(e) => setFilterChannel(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    >
                        <option value="">All Channels</option>
                        <option value="EMAIL">EMAIL</option>
                        <option value="SMS">SMS</option>
                        <option value="PUSH">PUSH</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    >
                        <option value="">All Statuses</option>
                        <option value="PENDING">PENDING</option>
                        <option value="SENT">SENT</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="FAILED">FAILED</option>
                    </select>
                </div>
            </div>

            {/* Logs Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl border border-slate-200"></div>)}
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-1">Channel</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3">Notification ID</div>
                        <div className="col-span-2">User ID</div>
                        <div className="col-span-2">Template</div>
                        <div className="col-span-2 text-right">Timestamp</div>
                    </div>

                    {logs.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center p-12 text-center text-sm text-slate-400">
                            No logs match the current filters.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50 flex-1">
                            {logs.map((log) => {
                                const chColor = channelColors[log.channel] || channelColors.EMAIL;
                                const stColor = statusColors[log.status || 'PENDING'] || statusColors.PENDING;
                                const isExpanded = expandedLog === log.notification_id;
                                return (
                                    <div key={log.notification_id}>
                                        <div
                                            className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50/50 transition-colors cursor-pointer"
                                            onClick={() => setExpandedLog(isExpanded ? null : log.notification_id)}
                                        >
                                            <div className="col-span-1">
                                                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${chColor.bg} ${chColor.text} border ${chColor.border}`}>{log.channel}</span>
                                            </div>
                                            <div className="col-span-2">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${stColor.bg} ${stColor.text}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${stColor.dot}`}></span>
                                                    {log.status}
                                                </span>
                                            </div>
                                            <div className="col-span-3">
                                                <p className="text-xs font-mono text-slate-600 truncate" title={log.notification_id}>{log.notification_id}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-xs font-mono text-slate-500 truncate" title={log.user_id || 'System'}>{(log.user_id || 'System').substring(0, 12)}{log.user_id ? '...' : ''}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-xs font-mono text-slate-500 truncate" title={log.template_id || 'Unknown'}>{(log.template_id || 'Unknown').substring(0, 12)}{log.template_id ? '...' : ''}</p>
                                            </div>
                                            <div className="col-span-2 text-right">
                                                <p className="text-[10px] font-mono text-slate-400">{log.sent_at ? new Date(log.sent_at).toLocaleString() : '—'}</p>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 animate-in slide-in-from-top-1 duration-150">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Full Notification ID</p>
                                                        <p className="text-xs font-mono text-slate-700 break-all">{log.notification_id}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Full User ID</p>
                                                        <p className="text-xs font-mono text-slate-700 break-all">{log.user_id || 'System (Guest)'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Template ID</p>
                                                        <p className="text-xs font-mono text-slate-700 break-all">{log.template_id || 'Unknown'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Provider Reference</p>
                                                        <p className="text-xs font-mono text-slate-700">{log.provider_ref || '—'}</p>
                                                    </div>
                                                    {log.error_details && (
                                                        <div className="col-span-2">
                                                            <p className="text-[10px] uppercase tracking-wider font-bold text-rose-400 mb-1">Error Details</p>
                                                            <div className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                                                                <pre className="text-xs font-mono text-rose-700 whitespace-pre-wrap">{log.error_details}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {log.metadata && (
                                                        <div className="col-span-2">
                                                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Event Metadata</p>
                                                            <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 max-h-32 overflow-y-auto custom-scrollbar">
                                                                <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 2)}</pre>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                            <button onClick={() => fetchLogs(Math.max(1, pagination.page - 1))} disabled={pagination.page <= 1} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Previous</button>
                            <div className="flex gap-1 overflow-x-auto mx-4">
                                {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                                    const pageNum = i + 1;
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => fetchLogs(pageNum)}
                                            className={`w-7 h-7 rounded-md text-xs font-semibold transition-colors shrink-0 flex items-center justify-center ${pagination.page === pageNum ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>
                            <button onClick={() => fetchLogs(Math.min(pagination.totalPages, pagination.page + 1))} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Next</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── DLQ Component ──────────────────────────────────────────────────────────

function DlqView() {
    const [stats, setStats] = useState<DlqSummary>({ total: 0, permanentlyFailed: 0, pendingRetry: 0 });
    const [messages, setMessages] = useState<FailedNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailMsg, setDetailMsg] = useState<FailedNotification | null>(null);
    const [isRetryingAll, setIsRetryingAll] = useState(false);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showPermanentlyFailed, setShowPermanentlyFailed] = useState(true);

    useEffect(() => {
        fetchStats();
        fetchMessages(page, showPermanentlyFailed);
    }, [page, showPermanentlyFailed]);

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/dlq/stats/summary`);
            const json = await res.json();
            if (json.success) setStats(json.data);
        } catch (err) { console.error('Failed to fetch DLQ stats:', err); }
    };

    const fetchMessages = async (pageNum: number, permanentOnly: boolean) => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams({ page: pageNum.toString(), limit: '15' });
            if (permanentOnly) {
                queryParams.set('permanentlyFailed', 'true');
            }

            const res = await fetch(`${API_URL}/api/v1/admin/dlq?${queryParams.toString()}`);
            const json = await res.json();
            if (json.success) {
                setMessages(json.data);
                setTotalPages(json.pagination.pages || 1);
            }
        } catch (err) { console.error('Failed to fetch DLQ messages:', err); }
        finally { setLoading(false); }
    };

    const handleRetryAll = async () => {
        if (!confirm(`Are you sure you want to retry all permanently failed messages?`)) return;
        setIsRetryingAll(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/dlq/retry-all`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                alert(`Successfully re-queued ${json.retriedCount} messages.`);
                fetchStats();
                fetchMessages(page, showPermanentlyFailed);
            } else {
                alert(`Failed to retry all: ${json.message}`);
            }
        } catch (err) { console.error('Failed bulk retry:', err); }
        finally { setIsRetryingAll(false); }
    };

    const handleRetrySingle = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/dlq/${id}/retry`, { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                setMessages(messages.map(m => m.id === id ? { ...m, permanently_failed: false, retry_count: m.retry_count + 1 } : m));
                fetchStats();
            } else {
                alert(`Failed to retry: ${json.message}`);
            }
        } catch (err) { console.error('Failed single retry:', err); }
    };

    const handlePurgeSingle = async (id: string) => {
        if (!confirm(`Are you sure you want to delete this DLQ message? It will be gone entirely.`)) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/dlq/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                setMessages(messages.filter(m => m.id !== id));
                fetchStats();
                if (detailMsg?.id === id) setDetailMsg(null);
            }
        } catch (err) { console.error('Failed to purge:', err); }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={() => setShowPermanentlyFailed(!showPermanentlyFailed)} className={`flex-1 md:flex-none px-4 py-2 rounded-xl font-medium transition-all text-sm shadow-sm ${showPermanentlyFailed ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}>
                        {showPermanentlyFailed ? 'Showing: Dead Letters Only' : 'Showing: All DLQ History'}
                    </button>
                    <button onClick={handleRetryAll} disabled={isRetryingAll || stats.permanentlyFailed === 0} className="flex-1 md:flex-none bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2">
                        {isRetryingAll ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Retrying...
                            </>
                        ) : (
                            'Retry All Failures'
                        )}
                    </button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm border-l-4 border-l-rose-500">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Permanent Failures</p>
                    <p className="text-2xl font-black text-slate-800">{stats.permanentlyFailed}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm border-l-4 border-l-amber-500">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Pending Auto-Retry</p>
                    <p className="text-2xl font-black text-slate-800">{stats.pendingRetry}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm bg-slate-50 pl-6">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Monitored By DLQ</p>
                    <p className="text-2xl font-black text-slate-800">{stats.total}</p>
                </div>
            </div>

            {/* DLQ Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl border border-slate-200"></div>)}</div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-3">Date / Project</div>
                        <div className="col-span-2">Channel</div>
                        <div className="col-span-4">Error Context</div>
                        <div className="col-span-1 text-center">Attempts</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>

                    {messages.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center p-12 text-center text-sm text-slate-400">
                            Queue is healthy! No dead letters found.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50 flex-1">
                            {messages.map((msg) => (
                                <div key={msg.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/50 transition-colors">
                                    <div className="col-span-3">
                                        <p className="text-xs font-bold text-slate-700">{new Date(msg.created_at).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono truncate" title={msg.tenant_id}>{msg.tenant_id}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${msg.channel === 'EMAIL' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                            msg.channel === 'SMS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                'bg-amber-50 text-amber-700 border border-amber-200'
                                            }`}>
                                            {msg.channel}
                                        </span>
                                    </div>
                                    <div className="col-span-4">
                                        <p className="text-xs text-rose-600 font-semibold truncate" title={msg.error_details}>
                                            {msg.error_details.split('\n')[0]}
                                        </p>
                                        {msg.permanently_failed ? (
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-bold uppercase border border-rose-200">Dead Letter</span>
                                        ) : (
                                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase border border-amber-200">Backoff Active</span>
                                        )}
                                    </div>
                                    <div className="col-span-1 text-center text-xs font-mono font-bold text-slate-600">
                                        {msg.retry_count} / {msg.max_retries}
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-2">
                                        <button onClick={() => handleRetrySingle(msg.id)} disabled={!msg.permanently_failed} className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1.5 rounded-lg transition-colors border border-transparent ${msg.permanently_failed ? 'text-slate-700 bg-slate-100 hover:bg-slate-200' : 'text-slate-300 cursor-not-allowed'}`}>
                                            Retry
                                        </button>
                                        <button onClick={() => setDetailMsg(msg)} className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
                                            Inspect
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Previous</button>
                            <span className="text-xs font-medium text-slate-500">Page {page} of {totalPages}</span>
                            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* Inspect Modal */}
            {detailMsg && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setDetailMsg(null)}>
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    Incident Report <span className="text-slate-300 font-normal">|</span> <span className="text-sm font-mono text-slate-500">{detailMsg.notification_id}</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">First failed at {new Date(detailMsg.created_at).toLocaleString()}</p>
                            </div>
                            {detailMsg.permanently_failed ? (
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">Dead Letter</span>
                            ) : (
                                <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">Auto-Retrying</span>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                            {/* Error Trace */}
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Failure Reason</h4>
                                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs font-mono text-rose-800 whitespace-pre-wrap shadow-sm">
                                    {detailMsg.error_details}
                                </div>
                            </div>

                            {/* Technical Details */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Target Channel</p>
                                    <p className="text-sm font-bold text-slate-700">{detailMsg.channel}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Retry Count</p>
                                    <p className="text-sm font-bold text-slate-700">{detailMsg.retry_count} / {detailMsg.max_retries}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Tenant Project</p>
                                    <p className="text-sm font-bold text-slate-700 font-mono truncate" title={detailMsg.tenant_id}>{detailMsg.tenant_id}</p>
                                </div>
                            </div>

                            {/* Original Payload JSON */}
                            <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Original Payload Dispatched</h4>
                                <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-green-400 overflow-x-auto shadow-inner custom-scrollbar">
                                    <pre>{JSON.stringify(detailMsg.payload, null, 2)}</pre>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                            <button onClick={() => handlePurgeSingle(detailMsg.id)} className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-4 py-2 rounded-lg transition-colors border border-transparent hover:border-rose-100">
                                Purge Record
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => setDetailMsg(null)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                                    Close
                                </button>
                                {detailMsg.permanently_failed && (
                                    <button onClick={() => handleRetrySingle(detailMsg.id)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors">
                                        Re-Queue for Dispatch
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function LogsAndDlqPage() {
    const [activeTab, setActiveTab] = useState<'audit' | 'dlq'>('audit');

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Page Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Monitoring & Logs</h2>
                <p className="text-sm text-slate-500">Track notification dispatches and manage system failures through the Dead Letter Queue.</p>
            </div>

            {/* Custom Tab Switcher */}
            <div className="flex bg-slate-200/50 p-1.5 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveTab('audit')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'audit'
                        ? 'bg-white text-indigo-900 shadow-sm border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transparent'
                        }`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                    Audit Dispatch Logs
                </button>
                <button
                    onClick={() => setActiveTab('dlq')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'dlq'
                        ? 'bg-white text-rose-900 shadow-sm border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 transparent'
                        }`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Dead Letter Queue
                </button>
            </div>

            {/* Tab Panels */}
            {activeTab === 'audit' ? <AuditLogsView /> : <DlqView />}
        </div>
    );
}
