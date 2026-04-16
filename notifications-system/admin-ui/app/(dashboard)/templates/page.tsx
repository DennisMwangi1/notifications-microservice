'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { API_URL } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

interface Tenant { id: string; name: string; }

interface Template {
    template_id: string;
    version: number;
    channel_type: 'EMAIL' | 'SMS' | 'PUSH';
    subject_line: string | null;
    content_body: string;
    is_active: boolean;
    tenant_id: string | null;
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

// Semantic channel colors (RGB — kept for meaning)
const channelBadge: Record<string, string> = {
    EMAIL: 'bg-sky-50 text-sky-600 border-sky-200',
    SMS: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    PUSH: 'bg-amber-50 text-amber-600 border-amber-200',
};

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [templateLibrary, setTemplateLibrary] = useState<TemplateLibraryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // Editor Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [eventType, setEventType] = useState('');
    const [channelType, setChannelType] = useState<'EMAIL' | 'SMS' | 'PUSH'>('EMAIL');
    const [subjectLine, setSubjectLine] = useState('');
    const [contentBody, setContentBody] = useState('');
    const [targetWsChannel, setTargetWsChannel] = useState('');

    // Detail / History Modal
    const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
    const [versionHistory, setVersionHistory] = useState<Template[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [libraryDetail, setLibraryDetail] = useState<TemplateLibraryEntry | null>(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [tplRes, tntRes, libraryRes] = await Promise.all([
                fetch(`${API_URL}/api/v1/admin/templates`, { headers: authHeaders() }),
                fetch(`${API_URL}/api/v1/admin/tenants`, { headers: authHeaders() }),
                fetch(`${API_URL}/api/v1/admin/template-library`, { headers: authHeaders() }),
            ]);
            const [tplJson, tntJson, libraryJson] = await Promise.all([
                tplRes.json(),
                tntRes.json(),
                libraryRes.json(),
            ]);
            if (tplJson.success) setTemplates(tplJson.data.filter((t: Template) => t.tenant_id === null));
            if (tntJson.success) setTenants(tntJson.data);
            if (libraryJson.success) setTemplateLibrary(libraryJson.data);
        } catch (err) { console.error('Failed to fetch data:', err); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    tenant_id: null, event_type: eventType, channel_type: channelType,
                    subject_line: subjectLine || null, content_body: contentBody,
                    target_ws_channel: channelType === 'PUSH' && targetWsChannel ? targetWsChannel : null
                })
            });
            const json = await res.json();
            if (json.success) { await fetchData(); closeModal(); }
        } catch (err) { console.error('Failed to publish template:', err); }
    };

    const handleDeactivate = async (templateId: string, version: number) => {
        if (!confirm(`Deactivate v${version}? Requests will fallback to the previous active version.`)) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/deactivate`, { method: 'PUT', headers: authHeaders() });
            const json = await res.json();
            if (json.success) {
                setTemplates(prev => prev.map(t => t.template_id === templateId && t.version === version ? { ...t, is_active: false } : t));
                setVersionHistory(prev => prev.map(v => v.version === version ? { ...v, is_active: false } : v));
            }
        } catch (err) { console.error('Failed to deactivate', err); }
    };

    const handleReactivate = async (templateId: string, version: number) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/reactivate`, { method: 'PUT', headers: authHeaders() });
            const json = await res.json();
            if (json.success) {
                setTemplates(prev => prev.map(t => t.template_id === templateId && t.version === version ? { ...t, is_active: true } : t));
                setVersionHistory(prev => prev.map(v => v.version === version ? { ...v, is_active: true } : v));
            }
        } catch (err) { console.error('Failed to reactivate', err); }
    };

    const handleEdit = (tpl: Template) => {
        setEditingTemplate(tpl);
        setEventType(tpl.event_type);
        setChannelType(tpl.channel_type);
        setSubjectLine(tpl.subject_line || '');
        setContentBody(tpl.content_body);
        setTargetWsChannel(tpl.target_ws_channel || '');
        setIsModalOpen(true);
    };

    const handleViewDetail = async (tpl: Template) => {
        setDetailTemplate(tpl);
        setLoadingHistory(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${tpl.template_id}/versions`, { headers: authHeaders() });
            const json = await res.json();
            if (json.success) setVersionHistory(json.data);
        } catch (err) { console.error('Failed to fetch history', err); }
        finally { setLoadingHistory(false); }
    };

    const closeModal = () => {
        setIsModalOpen(false); setEditingTemplate(null);
        setEventType(''); setSubjectLine(''); setContentBody(''); setTargetWsChannel('');
    };

    // Group: show only latest version per template_id
    const latestTemplates = Object.values(
        templates.reduce<Record<string, Template>>((acc, tpl) => {
            if (!acc[tpl.template_id] || tpl.version > acc[tpl.template_id].version) acc[tpl.template_id] = tpl;
            return acc;
        }, {})
    );

    const countSampleDataLeaves = (value: unknown): number => {
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return 1;
            }

            return value.reduce((total, item) => total + countSampleDataLeaves(item), 0);
        }

        if (value && typeof value === 'object') {
            const entries = Object.values(value as Record<string, unknown>);

            if (entries.length === 0) {
                return 1;
            }

            return entries.reduce((total, item) => total + countSampleDataLeaves(item), 0);
        }

        return 1;
    };

    const inputClasses = "w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white transition-all shadow-sm";

    return (
        <div className="max-w-[1600px] mx-auto space-y-10 pb-10 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-100 pb-6 gap-4">
                <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Template Library</h2>
                    <p className="text-sm text-slate-500">Manage published global defaults and reusable tenant starter templates from one place.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link href="/templates/playground" className="px-5 py-2.5 rounded-2xl font-medium border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm">
                        Open Playground
                    </Link>
                    <button onClick={() => { closeModal(); setIsModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 hover:-translate-y-0.5 px-5 py-2.5 rounded-2xl font-medium transition-all shadow-sm">+ Publish Global Default</button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">Global Defaults</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{latestTemplates.length}</p>
                    <p className="mt-1 text-sm text-slate-500">Published baseline templates available to all tenant routing flows.</p>
                </div>
                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">Tenant Library</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{templateLibrary.length}</p>
                    <p className="mt-1 text-sm text-slate-500">Reusable building blocks saved from the playground for routing overrides.</p>
                </div>
                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-400">Projects Covered</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{tenants.length}</p>
                    <p className="mt-1 text-sm text-slate-500">Active tenant projects that can consume global defaults or library-based overrides.</p>
                </div>
            </div>

            {/* Table */}
            <section className="space-y-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">Global Defaults</h3>
                    <p className="mt-1 text-sm text-slate-500">Versioned baseline templates published directly into the notification engine.</p>
                </div>
                {loading ? (
                    <div className="animate-pulse space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-2xl border border-slate-100"></div>)}</div>
                ) : (
                    <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-1">Channel</div>
                        <div className="col-span-3">Event Trigger</div>
                        <div className="col-span-2">Subject</div>
                        <div className="col-span-1 text-center">Version</div>
                        <div className="col-span-1 text-center">Status</div>
                        <div className="col-span-2">WS Channel</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {latestTemplates.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">No global templates registered. Deploy your first Email, SMS, or Push template.</div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {latestTemplates.map((tpl) => (
                                <div key={tpl.template_id} className={`grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50/50 transition-colors ${!tpl.is_active ? 'opacity-60' : ''}`}>
                                    <div className="col-span-1">
                                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[tpl.channel_type]}`}>{tpl.channel_type}</span>
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-sm font-semibold text-slate-800 font-mono">{tpl.event_type}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-xs text-slate-500 truncate" title={tpl.subject_line || '—'}>{tpl.subject_line || '—'}</p>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md text-xs font-mono">v{tpl.version}</span>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        {tpl.is_active ? (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">Live</span>
                                        ) : (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-500 border border-rose-100">Off</span>
                                        )}
                                    </div>
                                    <div className="col-span-2">
                                        {tpl.channel_type === 'PUSH' ? (
                                            <span className="text-xs font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{tpl.target_ws_channel || 'global_system'}</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1.5">
                                        <button onClick={() => handleViewDetail(tpl)} className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-100 px-2.5 py-1 rounded-lg transition-colors">View</button>
                                        <button onClick={() => handleEdit(tpl)} className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-100 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
                                        {tpl.is_active ? (
                                            <button onClick={() => handleDeactivate(tpl.template_id, tpl.version)} className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 px-2.5 py-1 rounded-lg transition-colors">Drop</button>
                                        ) : (
                                            <button onClick={() => handleReactivate(tpl.template_id, tpl.version)} className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 px-2.5 py-1 rounded-lg transition-colors">Restore</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                )}
            </section>

            <section className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Tenant Reusable Library</h3>
                        <p className="mt-1 text-sm text-slate-500">Saved starter templates teams can pull into tenant-specific routing overrides.</p>
                    </div>
                    <p className="text-xs font-medium text-slate-400">Built for {tenants.length} tenant project{tenants.length === 1 ? '' : 's'}</p>
                </div>

                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-slate-100 rounded-[1.8rem] border border-slate-100 animate-pulse"></div>)}
                    </div>
                ) : templateLibrary.length === 0 ? (
                    <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
                        <p className="text-sm text-slate-400">No reusable tenant templates have been saved yet. Create one in the playground to seed tenant routing flows faster.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {templateLibrary.map((entry) => (
                            <div key={entry.id} className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[entry.channel_type]}`}>
                                            {entry.channel_type}
                                        </span>
                                        <h4 className="mt-3 text-lg font-bold text-slate-900">{entry.name}</h4>
                                    </div>
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                        {countSampleDataLeaves(entry.sample_data)} vars
                                    </span>
                                </div>

                                <p className="mt-3 text-sm text-slate-500 line-clamp-3">
                                    {entry.subject_line || entry.content_body}
                                </p>

                                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                    <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-400">Sample JSON Shape</p>
                                    <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600 font-mono">
                                        {JSON.stringify(entry.sample_data, null, 2)}
                                    </pre>
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <p className="text-[11px] text-slate-400">
                                        Saved {new Date(entry.created_at).toLocaleDateString()}
                                    </p>
                                    <div className="flex gap-2">
                                        <button onClick={() => setLibraryDetail(entry)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                                            View
                                        </button>
                                        <Link href="/routing" className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                                            Use
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Detail + Version History Modal */}
            {detailTemplate && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => { setDetailTemplate(null); setVersionHistory([]); }}>
                    <div className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    {detailTemplate.event_type}
                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[detailTemplate.channel_type]}`}>{detailTemplate.channel_type}</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">Template ID: <span className="font-mono">{detailTemplate.template_id}</span></p>
                            </div>
                            <button onClick={() => { handleEdit(detailTemplate); setDetailTemplate(null); setVersionHistory([]); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-100 transition-colors">Edit Template</button>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            <div className="p-6 space-y-4 border-b border-slate-100">
                                {detailTemplate.subject_line && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Subject</p>
                                        <p className="text-sm font-medium text-slate-700">{detailTemplate.subject_line}</p>
                                    </div>
                                )}
                                {detailTemplate.channel_type === 'PUSH' && (
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">WebSocket Namespace</p>
                                        <span className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">{detailTemplate.target_ws_channel || 'global_system'}</span>
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Content Body (Latest v{detailTemplate.version})</p>
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 max-h-48 overflow-y-auto">
                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">{detailTemplate.content_body}</pre>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Version History
                                </h4>
                                {loadingHistory ? (
                                    <div className="text-sm text-slate-400 animate-pulse">Loading...</div>
                                ) : (
                                    <div className="space-y-2">
                                        {versionHistory.map(ver => (
                                            <div key={ver.version} className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${ver.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${ver.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>v{ver.version}</span>
                                                    <div>
                                                        <p className="text-xs font-medium text-slate-700">{ver.subject_line || ver.event_type}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{ver.created_at ? new Date(ver.created_at).toLocaleString() : '—'} · {ver.content_body.length} chars</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => { handleEdit(ver); setDetailTemplate(null); setVersionHistory([]); }} className="text-[9px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 px-2 py-1 rounded transition-colors">Fork</button>
                                                    {ver.is_active ? (
                                                        <button onClick={() => handleDeactivate(ver.template_id, ver.version)} className="text-[9px] uppercase tracking-wider font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition-colors">Drop</button>
                                                    ) : (
                                                        <button onClick={() => handleReactivate(ver.template_id, ver.version)} className="text-[9px] uppercase tracking-wider font-bold text-emerald-500 hover:bg-emerald-50 px-2 py-1 rounded transition-colors">Restore</button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end">
                            <button onClick={() => { setDetailTemplate(null); setVersionHistory([]); }} className="px-5 py-2 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-200/50 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {libraryDetail && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setLibraryDetail(null)}>
                    <div className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-start gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-bold text-slate-900">{libraryDetail.name}</h3>
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${channelBadge[libraryDetail.channel_type]}`}>
                                        {libraryDetail.channel_type}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-500">Reusable tenant-library entry saved from the playground for routing overrides.</p>
                            </div>
                            <Link href="/templates/playground" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                                Open Playground
                            </Link>
                        </div>

                        <div className="overflow-y-auto p-6 space-y-5">
                            {libraryDetail.subject_line && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Subject</p>
                                    <p className="text-sm font-medium text-slate-700">{libraryDetail.subject_line}</p>
                                </div>
                            )}
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Content Body</p>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 max-h-80 overflow-y-auto">
                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">{libraryDetail.content_body}</pre>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Sample JSON Shape</p>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 max-h-80 overflow-y-auto">
                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">{JSON.stringify(libraryDetail.sample_data, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end gap-3">
                            <Link href="/routing" className="px-5 py-2 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                                Open Routing
                            </Link>
                            <button onClick={() => setLibraryDetail(null)} className="px-5 py-2 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Editor Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            {editingTemplate ? (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                        Edit Template
                                        <span className="text-xs font-mono bg-slate-100 text-slate-600 border border-slate-100 px-2 py-0.5 rounded-md">v{editingTemplate.version} → v{editingTemplate.version + 1}</span>
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Saving publishes a new version. Previous versions remain in history.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900">New Global Template</h3>
                                    <p className="text-sm text-slate-500 mt-1">Universal wildcard accessible by all tenants.</p>
                                </>
                            )}
                        </div>
                        <div className="overflow-y-auto p-6">
                            <form id="templateForm" onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Event Trigger</label>
                                    <input type="text" required value={eventType} onChange={e => setEventType(e.target.value)} placeholder="e.g. global.success" disabled={!!editingTemplate}
                                        className={`${inputClasses} font-mono ${editingTemplate ? 'opacity-60 cursor-not-allowed' : ''}`} />
                                </div>
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-3">Channel</label>
                                    <div className="flex gap-3">
                                        {(['EMAIL', 'SMS', 'PUSH'] as const).map(type => (
                                            <label key={type} className={`flex-1 cursor-pointer border rounded-2xl p-3 flex flex-col items-center transition-all ${editingTemplate ? 'pointer-events-none' : ''} ${channelType === type ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="radio" value={type} checked={channelType === type} onChange={() => setChannelType(type)} className="sr-only" disabled={!!editingTemplate} />
                                                <span className="font-extrabold tracking-wider text-sm">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {editingTemplate && <p className="text-[10px] text-slate-400 font-medium">Event trigger and channel are locked. Modify content below.</p>}
                                {channelType !== 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Subject Line</label>
                                        <input type="text" value={subjectLine} onChange={e => setSubjectLine(e.target.value)} placeholder="e.g. Your invoice for {{orderId}}" className={`${inputClasses} font-mono`} />
                                    </div>
                                )}
                                {channelType === 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-amber-500 mb-2">WebSocket Namespace</label>
                                        <input type="text" value={targetWsChannel} onChange={e => setTargetWsChannel(e.target.value)} placeholder="e.g. application_alerts" className="w-full bg-amber-50/30 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-mono text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm placeholder-amber-400/70" />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Content Body</label>
                                    <textarea required rows={8} value={contentBody} onChange={e => setContentBody(e.target.value)}
                                        placeholder={channelType === 'EMAIL' ? '<mjml>\n  <mj-body>...</mj-body>\n</mjml>' : 'Hello {{name}}, your action was successful!'}
                                        className={`${inputClasses} font-mono shadow-inner whitespace-pre placeholder-slate-400`} />
                                </div>
                            </form>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end space-x-3">
                            <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                            <button type="submit" form="templateForm" className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-sm">
                                {editingTemplate ? `Publish v${editingTemplate.version + 1}` : 'Deploy Global Branch'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
