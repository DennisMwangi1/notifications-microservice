'use client';

import { useState, useEffect } from 'react';

interface DashboardStats {
  tenants: { total: number; active: number };
  templates: { total: number };
  notifications: {
    totalDispatched: number;
    totalInApp: number;
    unreadInApp: number;
  };
  channelBreakdown: { channel: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  recentActivity: {
    notification_id: string;
    user_id: string;
    template_id: string;
    channel: string;
    status: string;
    sent_at: string | null;
    metadata: Record<string, unknown> | null;
  }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/admin/stats`);
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48"></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-2xl border border-slate-200"></div>)}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl border border-slate-200"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-6xl mx-auto text-center py-20">
        <h3 className="text-slate-600 font-semibold mb-1">Unable to load dashboard.</h3>
        <p className="text-slate-500 text-sm">Ensure the worker service is running.</p>
      </div>
    );
  }

  const totalByChannel = stats.channelBreakdown.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Dashboard</h2>
        <p className="text-sm text-slate-500">Real-time overview of your notification infrastructure.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Tenants */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Tenants</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.tenants.active}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">{stats.tenants.total} total · {stats.tenants.active} active</p>
        </div>

        {/* Templates */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Templates</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.templates.total}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">All versions across all channels</p>
        </div>

        {/* Dispatched */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <span className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Dispatched</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.notifications.totalDispatched}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Email + SMS logs processed</p>
        </div>

        {/* In-App */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between mb-4">
            <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
            </span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">In-App Push</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.notifications.totalInApp}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            <span className="text-amber-600 font-semibold">{stats.notifications.unreadInApp}</span> unread
          </p>
        </div>
      </div>

      {/* Channel Breakdown + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-5">Channel Distribution</h3>
          {stats.channelBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No dispatches recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {stats.channelBreakdown.map((ch) => {
                const colors = channelColors[ch.channel] || channelColors.EMAIL;
                const pct = Math.round((ch.count / totalByChannel) * 100);
                return (
                  <div key={ch.channel}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}>{ch.channel}</span>
                      <span className="text-sm font-bold text-slate-700">{ch.count} <span className="text-xs text-slate-400 font-medium">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${ch.channel === 'EMAIL' ? 'bg-sky-400' : ch.channel === 'SMS' ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delivery Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-5">Delivery Status</h3>
          {stats.statusBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No dispatches recorded yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {stats.statusBreakdown.map((st) => {
                const colors = statusColors[st.status || 'PENDING'] || statusColors.PENDING;
                return (
                  <div key={st.status} className={`${colors.bg} rounded-xl p-4 border border-transparent`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`}></span>
                      <span className={`text-xs uppercase tracking-wider font-bold ${colors.text}`}>{st.status || 'UNKNOWN'}</span>
                    </div>
                    <p className="text-2xl font-black text-slate-900">{st.count}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Recent Dispatch Log</h3>
        </div>
        {stats.recentActivity.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No dispatch activity recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {stats.recentActivity.map((log) => {
              const chColor = channelColors[log.channel] || channelColors.EMAIL;
              const stColor = statusColors[log.status || 'PENDING'] || statusColors.PENDING;
              return (
                <div key={log.notification_id} className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${chColor.bg} ${chColor.text} border ${chColor.border}`}>{log.channel}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-700 font-mono truncate max-w-xs" title={log.template_id}>{log.template_id.substring(0, 8)}...</p>
                      <p className="text-xs text-slate-400 font-mono">{log.user_id.substring(0, 12)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${stColor.bg} ${stColor.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stColor.dot}`}></span>
                      {log.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono w-32 text-right">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
