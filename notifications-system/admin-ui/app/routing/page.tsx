'use client';

import { useState, useEffect } from 'react';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const channelBadge: Record<string, string> = {
    EMAIL: 'bg-sky-50 text-sky-600 border-sky-200',
    SMS: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    PUSH: 'bg-amber-50 text-amber-600 border-amber-200',
};

export default function RoutingMatrixPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);

    // Editor Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [eventType, setEventType] = useState('');
    const [channelType, setChannelType] = useState<'EMAIL' | 'SMS' | 'PUSH'>('EMAIL');
    const [subjectLine, setSubjectLine] = useState('');
    const [contentBody, setContentBody] = useState('');
    const [targetWsChannel, setTargetWsChannel] = useState('');

    // Detail / History Modal
    const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
    const [versionHistory, setVersionHistory] = useState<Template[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [tplRes, tntRes] = await Promise.all([
                fetch(`${API_URL}/api/v1/admin/templates`),
                fetch(`${API_URL}/api/v1/admin/tenants`)
            ]);
            const [tplJson, tntJson] = await Promise.all([tplRes.json(), tntRes.json()]);
            if (tplJson.success) setTemplates(tplJson.data.filter((t: Template) => t.tenant_id !== null));
            if (tntJson.success) {
                setTenants(tntJson.data);
                if (tntJson.data.length > 0 && !selectedTenant) setSelectedTenant(tntJson.data[0].id);
            }
        } catch (err) { console.error('Failed to fetch data:', err); }
        finally { setLoading(false); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenant_id: editingTemplate ? editingTemplate.tenant_id : selectedTenant,
                    event_type: eventType, channel_type: channelType,
                    subject_line: subjectLine || null, content_body: contentBody,
                    target_ws_channel: channelType === 'PUSH' && targetWsChannel ? targetWsChannel : null
                })
            });
            const json = await res.json();
            if (json.success) { await fetchData(); closeModal(); }
        } catch (err) { console.error('Failed to publish template:', err); }
    };

    const handleDeactivate = async (templateId: string, version: number) => {
        if (!confirm(`Deactivate v${version}?`)) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/deactivate`, { method: 'PUT' });
            const json = await res.json();
            if (json.success) {
                setTemplates(prev => prev.map(t => t.template_id === templateId && t.version === version ? { ...t, is_active: false } : t));
                setVersionHistory(prev => prev.map(v => v.version === version ? { ...v, is_active: false } : v));
            }
        } catch (err) { console.error('Failed to deactivate', err); }
    };

    const handleReactivate = async (templateId: string, version: number) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/reactivate`, { method: 'PUT' });
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
        if (tpl.tenant_id) setSelectedTenant(tpl.tenant_id);
        setIsModalOpen(true);
    };

    const handleViewDetail = async (tpl: Template) => {
        setDetailTemplate(tpl);
        setLoadingHistory(true);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${tpl.template_id}/versions`);
            const json = await res.json();
            if (json.success) setVersionHistory(json.data);
        } catch (err) { console.error('Failed to fetch history', err); }
        finally { setLoadingHistory(false); }
    };

    const closeModal = () => {
        setIsModalOpen(false); setEditingTemplate(null);
        setEventType(''); setSubjectLine(''); setContentBody(''); setTargetWsChannel('');
    };

    const getTenantName = (id: string | null) => tenants.find(t => t.id === id)?.name || id || 'GLOBAL';

    // Show only latest version per template_id
    const latestTemplates = Object.values(
        templates.reduce<Record<string, Template>>((acc, tpl) => {
            if (!acc[tpl.template_id] || tpl.version > acc[tpl.template_id].version) acc[tpl.template_id] = tpl;
            return acc;
        }, {})
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Tenant Routing Matrix</h2>
                    <p className="text-sm text-slate-500">Publish isolated Email, SMS, and Push overrides strictly bound to a single project.</p>
                </div>
                <button onClick={() => { closeModal(); setIsModalOpen(true); }} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm">+ Publish Override</button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl border border-slate-200"></div>)}</div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-1">Channel</div>
                        <div className="col-span-2">Project</div>
                        <div className="col-span-3">Event Trigger</div>
                        <div className="col-span-1 text-center">Version</div>
                        <div className="col-span-1 text-center">Status</div>
                        <div className="col-span-2">WS Channel</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {latestTemplates.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">No tenant-specific overrides registered. Deploy your first routing override.</div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {latestTemplates.map((tpl) => (
                                <div key={tpl.template_id} className={`grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50/50 transition-colors ${!tpl.is_active ? 'opacity-60' : ''}`}>
                                    <div className="col-span-1">
                                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[tpl.channel_type]}`}>{tpl.channel_type}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-xs font-semibold text-slate-700 truncate" title={getTenantName(tpl.tenant_id)}>{getTenantName(tpl.tenant_id)}</p>
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-sm font-semibold text-slate-800 font-mono">{tpl.event_type}</p>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <span className="font-bold text-fuchsia-600 bg-fuchsia-50 px-1.5 py-0.5 rounded-md text-xs font-mono">v{tpl.version}</span>
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
                                        <button onClick={() => handleViewDetail(tpl)} className="text-[10px] uppercase tracking-wider font-bold text-blue-500 hover:bg-blue-50 border border-transparent hover:border-blue-100 px-2.5 py-1 rounded-lg transition-colors">View</button>
                                        <button onClick={() => handleEdit(tpl)} className="text-[10px] uppercase tracking-wider font-bold text-indigo-500 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
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

            {/* Detail + Version History Modal */}
            {detailTemplate && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => { setDetailTemplate(null); setVersionHistory([]); }}>
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    {detailTemplate.event_type}
                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[detailTemplate.channel_type]}`}>{detailTemplate.channel_type}</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">Project: <span className="font-semibold text-slate-700">{getTenantName(detailTemplate.tenant_id)}</span></p>
                            </div>
                            <button onClick={() => { handleEdit(detailTemplate); setDetailTemplate(null); setVersionHistory([]); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-fuchsia-600 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-100 transition-colors">Edit Override</button>
                        </div>

                        <div className="overflow-y-auto flex-1 custom-scrollbar">
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
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-48 overflow-y-auto custom-scrollbar">
                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">{detailTemplate.content_body}</pre>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-600 mb-4 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Version History
                                </h4>
                                {loadingHistory ? (
                                    <div className="text-sm text-slate-400 animate-pulse">Loading...</div>
                                ) : (
                                    <div className="space-y-2">
                                        {versionHistory.map(ver => (
                                            <div key={ver.version} className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${ver.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${ver.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>v{ver.version}</span>
                                                    <div>
                                                        <p className="text-xs font-medium text-slate-700">{ver.subject_line || ver.event_type}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{ver.created_at ? new Date(ver.created_at).toLocaleString() : '—'} · {ver.content_body.length} chars</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => { handleEdit(ver); setDetailTemplate(null); setVersionHistory([]); }} className="text-[9px] uppercase tracking-wider font-bold text-indigo-500 hover:bg-indigo-50 px-2 py-1 rounded transition-colors">Fork</button>
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
                            <button onClick={() => { setDetailTemplate(null); setVersionHistory([]); }} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/50 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Editor Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            {editingTemplate ? (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                        Edit Override
                                        <span className="text-xs font-mono bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-md">v{editingTemplate.version} → v{editingTemplate.version + 1}</span>
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Saving publishes a new version. Previous versions remain in history.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900">New Tenant Override</h3>
                                    <p className="text-sm text-slate-500 mt-1">Bind this template to a specific project ecosystem.</p>
                                </>
                            )}
                        </div>
                        <div className="overflow-y-auto p-6 custom-scrollbar">
                            <form id="templateForm" onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Target Project</label>
                                        <select value={editingTemplate ? (editingTemplate.tenant_id || '') : selectedTenant} onChange={e => setSelectedTenant(e.target.value)} disabled={!!editingTemplate}
                                            className={`w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-sm ${editingTemplate ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                            <option value="" disabled>Select a Project</option>
                                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Event Trigger</label>
                                        <input type="text" required value={eventType} onChange={e => setEventType(e.target.value)} placeholder="e.g. core.payment.processed" disabled={!!editingTemplate}
                                            className={`w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono text-fuchsia-700 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-sm placeholder-slate-400 ${editingTemplate ? 'opacity-60 cursor-not-allowed' : ''}`} />
                                    </div>
                                </div>
                                {editingTemplate && <p className="text-[10px] text-slate-400 font-medium -mt-2">Project, event trigger, and channel are locked. Modify content below.</p>}
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-3">Channel</label>
                                    <div className="flex gap-3">
                                        {['EMAIL', 'SMS', 'PUSH'].map(type => (
                                            <label key={type} className={`flex-1 cursor-pointer border rounded-xl p-3 flex flex-col items-center transition-all ${editingTemplate ? 'pointer-events-none' : ''} ${channelType === type ? 'bg-fuchsia-50 border-fuchsia-300 ring-2 ring-fuchsia-500/10 text-fuchsia-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                <input type="radio" value={type} checked={channelType === type} onChange={() => setChannelType(type as any)} className="sr-only" disabled={!!editingTemplate} />
                                                <span className="font-extrabold tracking-wider text-sm">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {channelType !== 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Subject Line</label>
                                        <input type="text" value={subjectLine} onChange={e => setSubjectLine(e.target.value)} placeholder="e.g. Your invoice for {{orderId}}" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-sm placeholder-slate-400" />
                                    </div>
                                )}
                                {channelType === 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-amber-500 mb-2">WebSocket Namespace</label>
                                        <input type="text" value={targetWsChannel} onChange={e => setTargetWsChannel(e.target.value)} placeholder="e.g. application_alerts" className="w-full bg-amber-50/30 border border-amber-200 rounded-xl px-4 py-3 text-sm font-mono text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm placeholder-amber-400/70" />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Content Body</label>
                                    <textarea required rows={8} value={contentBody} onChange={e => setContentBody(e.target.value)}
                                        placeholder={channelType === 'EMAIL' ? '<mjml>\n  <mj-body>...</mj-body>\n</mjml>' : 'Hello {{name}}, your action was successful!'}
                                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-4 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 shadow-inner whitespace-pre custom-scrollbar placeholder-slate-400" />
                                </div>
                            </form>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end space-x-3">
                            <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                            <button type="submit" form="templateForm" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-fuchsia-600 hover:bg-fuchsia-700 shadow-sm">
                                {editingTemplate ? `Publish v${editingTemplate.version + 1}` : 'Deploy Route Override'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
