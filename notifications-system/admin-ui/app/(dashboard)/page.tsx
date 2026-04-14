'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';
import { authHeaders } from '../../lib/auth';

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

// Semantic channel colors (RGB — kept for meaning)
const channelColors: Record<string, { bg: string; text: string; border: string }> = {
  EMAIL: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
  SMS: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  PUSH: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
};

// Semantic status colors (RGB — kept for meaning)
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
    const interval = setInterval(fetchStats, 15000);
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
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="h-10 bg-slate-200/50 rounded-xl w-64 mb-10"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white rounded-3xl border border-slate-100 shadow-sm"></div>)}
        </div>
        <div className="h-72 bg-white rounded-3xl border border-slate-100 shadow-sm"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-6xl mx-auto text-center py-32 bg-white rounded-3xl border border-slate-100 shadow-sm mt-10">
        <div className="w-16 h-16 mx-auto bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-slate-800 text-xl font-bold mb-2">Unable to load dashboard</h3>
        <p className="text-slate-500">Ensure the core engine is running and accessible.</p>
      </div>
    );
  }

  const totalByChannel = stats.channelBreakdown.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-200/60 pb-8 mt-2 gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Nucleus Dashboard</h2>
          <p className="text-sm font-medium text-slate-500">Real-time telemetry and global observability metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            Live Sync
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Tenants */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl shadow-slate-200/50 hover:shadow-indigo-500/10 transition-all duration-300 group">
          <div className="flex items-start justify-between mb-8">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center text-indigo-600 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">Projects</span>
          </div>
          <p className="text-5xl font-black text-slate-900 tracking-tight">{stats.tenants.active}</p>
          <p className="text-sm text-slate-500 mt-2 font-medium">Out of <span className="text-slate-800 font-bold">{stats.tenants.total}</span> registered tenants</p>
        </div>

        {/* Templates */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl shadow-slate-200/50 hover:shadow-sky-500/10 transition-all duration-300 group">
          <div className="flex items-start justify-between mb-8">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 flex items-center justify-center text-sky-600 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">Templates</span>
          </div>
          <p className="text-5xl font-black text-slate-900 tracking-tight">{stats.templates.total}</p>
          <p className="text-sm text-slate-500 mt-2 font-medium">Global blueprints fully synced</p>
        </div>

        {/* Dispatched */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl shadow-slate-200/50 hover:shadow-emerald-500/10 transition-all duration-300 group">
          <div className="flex items-start justify-between mb-8">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center text-emerald-600 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">Outbound</span>
          </div>
          <p className="text-5xl font-black text-slate-900 tracking-tight">{stats.notifications.totalDispatched}</p>
          <p className="text-sm text-slate-500 mt-2 font-medium">Successfully relayed events</p>
        </div>

        {/* In-App */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl shadow-slate-200/50 hover:shadow-violet-500/10 transition-all duration-300 group">
          <div className="flex items-start justify-between mb-8">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center text-violet-600 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </span>
            <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">In-App Push</span>
          </div>
          <p className="text-5xl font-black text-slate-900 tracking-tight">{stats.notifications.totalInApp}</p>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            <span className="text-slate-900 font-bold">{stats.notifications.unreadInApp}</span> remaining unread
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
              Rate Limit Insights
            </h3>
            <p className="text-sm text-slate-500 mt-1">Real-time quota enforcement monitoring across the cluster.</p>
          </div>
          <div className="flex gap-4 md:gap-8 border border-slate-100 bg-slate-50 rounded-2xl px-6 py-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tracked</span>
              <span className="font-black text-lg text-slate-800">{stats.rateLimits.activeTenantsTracked}</span>
            </div>
            <div className="w-px bg-slate-200"></div>
            <div className="flex flex-col">
               <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RPM Filter</span>
              <span className="font-black text-lg text-slate-800">{stats.rateLimits.currentMinuteRequests}</span>
            </div>
            <div className="w-px bg-slate-200"></div>
            <div className="flex flex-col">
               <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">RPD Global</span>
              <span className="font-black text-lg text-slate-800">{stats.rateLimits.currentDailyRequests}</span>
            </div>
          </div>
        </div>

        {stats.rateLimits.tenantsNearingLimits.length === 0 ? (
          <div className="bg-slate-50/50 border border-slate-100 border-dashed rounded-2xl p-12 text-center">
            <p className="text-sm font-semibold text-slate-400">All tenants operating optimally within defined thresholds.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stats.rateLimits.tenantsNearingLimits.map((tenant) => {
              const maxUsage = Math.max(tenant.minuteUsagePct, tenant.dailyUsagePct, tenant.templateUsagePct, tenant.burstUsagePct);
              const statusColor = maxUsage >= 90 ? 'bg-rose-50 text-rose-600 border-rose-200' : maxUsage >= 70 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-700 border-slate-200';

              return (
                <div key={tenant.tenantId} className="border border-slate-100 rounded-3xl p-6 bg-slate-50 transition-all hover:bg-slate-100/50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-bold text-slate-400">
                        {tenant.tenantName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-900">{tenant.tenantName}</p>
                        <p className="text-xs font-mono text-slate-500">{tenant.tenantId}</p>
                      </div>
                    </div>
                    <span className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border ${statusColor}`}>
                      Peak Usage {maxUsage}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Minute Window (RPM)</p>
                      <div className="flex items-end gap-2">
                        <p className="text-2xl font-black text-slate-800">{tenant.minuteCount}</p>
                        <p className="text-sm font-bold text-slate-400 mb-1">/ {tenant.minuteLimit}</p>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                        <div className={`h-full rounded-full ${maxUsage >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(tenant.minuteUsagePct, 100)}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Burst Bucket</p>
                      <div className="flex items-end gap-2">
                        <p className="text-2xl font-black text-slate-800">{tenant.burstRemaining}</p>
                        <p className="text-sm font-bold text-slate-400 mb-1">/ {tenant.burstCapacity}</p>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                         <div className={`h-full rounded-full ${maxUsage >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(tenant.burstUsagePct, 100)}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Daily Cap (RPD)</p>
                      <div className="flex items-end gap-2">
                        <p className="text-2xl font-black text-slate-800">{tenant.dailyCount}</p>
                        <p className="text-sm font-bold text-slate-400 mb-1">/ {tenant.dailyLimit}</p>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                        <div className={`h-full rounded-full ${maxUsage >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(tenant.dailyUsagePct, 100)}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Template Quota</p>
                      <div className="flex items-end gap-2">
                        <p className="text-2xl font-black text-slate-800">{tenant.templateCount}</p>
                        <p className="text-sm font-bold text-slate-400 mb-1">/ {tenant.templateLimit}</p>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                         <div className={`h-full rounded-full ${maxUsage >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(tenant.templateUsagePct, 100)}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Channel Breakdown + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Channel Distribution */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
             <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
            </svg>
            Channel Matrix
          </h3>
          {stats.channelBreakdown.length === 0 ? (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-12 text-center text-sm font-medium text-slate-400">No dispatches recorded.</div>
          ) : (
            <div className="space-y-6 mt-4">
              {stats.channelBreakdown.map((ch) => {
                const colors = channelColors[ch.channel] || channelColors.EMAIL;
                const pct = Math.round((ch.count / totalByChannel) * 100);
                return (
                  <div key={ch.channel} className="group">
                    <div className="flex justify-between items-end mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] uppercase font-bold tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}>{ch.channel}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-slate-800 mr-2">{ch.count}</span>
                        <span className="text-xs font-bold text-slate-400">({pct}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${ch.channel === 'EMAIL' ? 'bg-sky-500' : ch.channel === 'SMS' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delivery Status */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            Delivery Telemetry
          </h3>
          {stats.statusBreakdown.length === 0 ? (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-12 text-center text-sm font-medium text-slate-400">No events tracked.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {stats.statusBreakdown.map((st) => {
                const colors = statusColors[st.status || 'PENDING'] || statusColors.PENDING;
                return (
                  <div key={st.status} className={`${colors.bg} rounded-[1.5rem] p-5 border ${colors.bg.replace('bg-', 'border-').replace('50', '200')} transition-all hover:scale-[1.02]`}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className={`w-3 h-3 rounded-full ${colors.dot} shadow-sm`}></span>
                      <span className={`text-xs uppercase tracking-wider font-black ${colors.text}`}>{st.status || 'UNKNOWN'}</span>
                    </div>
                    <p className="text-3xl font-black text-slate-900 tracking-tight">{st.count}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Activity Stream
          </h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">Live View</span>
        </div>
        {stats.recentActivity.length === 0 ? (
          <div className="p-16 text-center text-slate-400 bg-slate-50/50">
            <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
               <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
               </svg>
            </div>
            <p className="font-medium text-sm">No recent activity detected on the cluster.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {stats.recentActivity.map((log) => {
              const chColor = channelColors[log.channel] || channelColors.EMAIL;
              const stColor = statusColors[log.status || 'PENDING'] || statusColors.PENDING;
              return (
                <div key={log.notification_id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-[10px] uppercase font-bold tracking-wider ${chColor.bg} ${chColor.text} border ${chColor.border} shadow-sm group-hover:scale-105 transition-transform`}>
                      {log.channel.substring(0, 3)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-mono" title={log.template_id || 'Unknown'}>{(log.template_id || 'sys.unknown').substring(0, 18)}{log.template_id && log.template_id.length > 18 ? '...' : ''}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5" title={log.user_id || 'System (Guest)'}>usr:{(log.user_id || 'guest').substring(0, 14)}{log.user_id && log.user_id.length > 14 ? '...' : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider ${stColor.bg} ${stColor.text} border ${stColor.bg.replace('bg-', 'border-').replace('50', '200')}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${stColor.dot}`}></span>
                      {log.status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {log.sent_at ? new Date(log.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : '—'}
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
