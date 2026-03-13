'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';

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

export default function LogsPage() {
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
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end border-b border-slate-200 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Notification Logs</h2>
                    <p className="text-sm text-slate-500">Searchable audit trail of every Email, SMS, and real-time dispatch processed by the engine.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={filterChannel}
                        onChange={(e) => setFilterChannel(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                    >
                        <option value="">All Channels</option>
                        <option value="EMAIL">EMAIL</option>
                        <option value="SMS">SMS</option>
                        <option value="PUSH">PUSH</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                    >
                        <option value="">All Statuses</option>
                        <option value="PENDING">PENDING</option>
                        <option value="SENT">SENT</option>
                        <option value="DELIVERED">DELIVERED</option>
                        <option value="FAILED">FAILED</option>
                    </select>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <span>Total: <span className="font-bold text-slate-700">{pagination.total}</span> records</span>
                <span className="text-slate-300">|</span>
                <span>Page <span className="font-bold text-slate-700">{pagination.page}</span> of <span className="font-bold text-slate-700">{pagination.totalPages}</span></span>
            </div>

            {/* Logs Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl border border-slate-200"></div>)}
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-1">Channel</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3">Notification ID</div>
                        <div className="col-span-2">User ID</div>
                        <div className="col-span-2">Template</div>
                        <div className="col-span-2 text-right">Timestamp</div>
                    </div>

                    {/* Rows */}
                    {logs.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No logs match the current filters.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
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
                                                <p className="text-xs font-mono text-slate-500 truncate" title={log.user_id}>{log.user_id.substring(0, 12)}...</p>
                                            </div>
                                            <div className="col-span-2">
                                                <p className="text-xs font-mono text-slate-500 truncate" title={log.template_id}>{log.template_id.substring(0, 12)}...</p>
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
                                                        <p className="text-xs font-mono text-slate-700 break-all">{log.user_id}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Template ID</p>
                                                        <p className="text-xs font-mono text-slate-700 break-all">{log.template_id}</p>
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
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center items-center gap-3">
                    <button
                        onClick={() => fetchLogs(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        ← Previous
                    </button>
                    <div className="flex gap-1">
                        {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => fetchLogs(pageNum)}
                                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${pagination.page === pageNum ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => fetchLogs(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
