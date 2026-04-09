'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../lib/api';
import { authHeaders } from '../lib/auth';

interface DashboardStats {
  tenants: { total: number; active: number };
  templates: { total: number };
  notifications: {
    totalDispatched: number;
    totalInApp: number;
    unreadInApp: number;
  };
  rateLimits: {
    activeTenantsTracked: number;
    currentMinuteRequests: number;
    currentDailyRequests: number;
    tenantsNearingLimits: {
      tenantId: string;
      tenantName: string;
      minuteCount: number;
      minuteLimit: number;
      minuteUsagePct: number;
      dailyCount: number;
      dailyLimit: number;
      dailyUsagePct: number;
      burstRemaining: number;
      burstCapacity: number;
      burstUsagePct: number;
      templateCount: number;
      templateLimit: number;
      templateUsagePct: number;
    }[];
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
      const res = await fetch(`${API_URL}/api/v1/admin/stats`, { headers: authHeaders() });
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
      <div className="border-b border-slate-200 pb-8 mt-2 relative">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-gradient-to-br from-indigo-100 to-purple-50 rounded-full blur-3xl opacity-50 -z-10"></div>
        <h2 className="text-4xl font-black tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent mb-2">Dashboard Overview</h2>
        <p className="text-sm font-medium text-slate-500">Real-time telemetry and management plane for your notification microservices.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Tenants */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-indigo-200 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-indigo-50 rounded-full blur-2xl group-hover:bg-indigo-100 transition-colors pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-100 transition-all">
                <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Tenants</span>
            </div>
            <p className="text-4xl font-black text-slate-900 drop-shadow-sm">{stats.tenants.active}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">{stats.tenants.total} total · <span className="text-indigo-600 font-bold">{stats.tenants.active} active</span></p>
          </div>
        </div>

        {/* Templates */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-50 rounded-full blur-2xl group-hover:bg-emerald-100 transition-colors pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-emerald-100 transition-all">
                <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Templates</span>
            </div>
            <p className="text-4xl font-black text-slate-900 drop-shadow-sm">{stats.templates.total}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Synced globally across all clients.</p>
          </div>
        </div>

        {/* Dispatched */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-sky-200 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-sky-50 rounded-full blur-2xl group-hover:bg-sky-100 transition-colors pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-sky-100 transition-all">
                <svg className="w-6 h-6 text-sky-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Dispatched</span>
            </div>
            <p className="text-4xl font-black text-slate-900 drop-shadow-sm">{stats.notifications.totalDispatched}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Emails + SMS logs successfully requested.</p>
          </div>
        </div>

        {/* In-App */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-amber-200 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-50 rounded-full blur-2xl group-hover:bg-amber-100 transition-colors pointer-events-none"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-amber-100 transition-all">
                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              </span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">In-App Push</span>
            </div>
            <p className="text-4xl font-black text-slate-900 drop-shadow-sm">{stats.notifications.totalInApp}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">
              <span className="text-amber-600 font-black">{stats.notifications.unreadInApp}</span> unread remaining.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Rate Limit Watch</h3>
            <p className="text-xs text-slate-400 mt-1">Live usage across burst, minute, daily, and template quota enforcement.</p>
          </div>
          <div className="flex gap-5 text-xs text-slate-500">
            <span>Tracked tenants: <span className="font-bold text-slate-700">{stats.rateLimits.activeTenantsTracked}</span></span>
            <span>Current minute: <span className="font-bold text-slate-700">{stats.rateLimits.currentMinuteRequests}</span></span>
            <span>Current day: <span className="font-bold text-slate-700">{stats.rateLimits.currentDailyRequests}</span></span>
          </div>
        </div>

        {stats.rateLimits.tenantsNearingLimits.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No tenants are currently trending near burst, rate, daily, or template limits.</p>
        ) : (
          <div className="space-y-4">
            {stats.rateLimits.tenantsNearingLimits.map((tenant) => {
              const maxUsage = Math.max(tenant.minuteUsagePct, tenant.dailyUsagePct, tenant.templateUsagePct, tenant.burstUsagePct);

              return (
                <div key={tenant.tenantId} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{tenant.tenantName}</p>
                      <p className="text-[11px] font-mono text-slate-400">{tenant.tenantId}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${maxUsage >= 90 ? 'bg-rose-100 text-rose-700 border border-rose-200' : maxUsage >= 70 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-sky-100 text-sky-700 border border-sky-200'}`}>
                      Peak Usage {maxUsage}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Minute Window</p>
                      <p className="text-sm font-bold text-slate-800">{tenant.minuteCount} / {tenant.minuteLimit}</p>
                      <p className="text-xs text-slate-500 mt-1">{tenant.minuteUsagePct}% used</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Burst Bucket</p>
                      <p className="text-sm font-bold text-slate-800">{tenant.burstRemaining} / {tenant.burstCapacity} left</p>
                      <p className="text-xs text-slate-500 mt-1">{tenant.burstUsagePct}% consumed</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Daily Cap</p>
                      <p className="text-sm font-bold text-slate-800">{tenant.dailyCount} / {tenant.dailyLimit}</p>
                      <p className="text-xs text-slate-500 mt-1">{tenant.dailyUsagePct}% used</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Template Quota</p>
                      <p className="text-sm font-bold text-slate-800">{tenant.templateCount} / {tenant.templateLimit}</p>
                      <p className="text-xs text-slate-500 mt-1">{tenant.templateUsagePct}% used</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                      <p className="text-sm font-medium text-slate-700 font-mono truncate max-w-xs" title={log.template_id || 'Unknown'}>{(log.template_id || 'Unknown').substring(0, 8)}{log.template_id ? '...' : ''}</p>
                      <p className="text-xs text-slate-400 font-mono" title={log.user_id || 'System (Guest)'}>{(log.user_id || 'System (Guest)').substring(0, 12)}{log.user_id ? '...' : ''}</p>
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
