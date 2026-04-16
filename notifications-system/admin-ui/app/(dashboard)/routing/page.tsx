'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../../../lib/api';
import { authHeaders } from '../../../lib/auth';

interface Tenant {
    id: string;
    name: string;
}

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

const channelBadge: Record<string, string> = {
    EMAIL: 'bg-sky-50 text-sky-600 border-sky-200',
    SMS: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    PUSH: 'bg-amber-50 text-amber-600 border-amber-200',
};

export default function RoutingMatrixPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [templateLibrary, setTemplateLibrary] = useState<TemplateLibraryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [eventType, setEventType] = useState('');
    const [channelType, setChannelType] = useState<'EMAIL' | 'SMS' | 'PUSH'>('EMAIL');
    const [subjectLine, setSubjectLine] = useState('');
    const [contentBody, setContentBody] = useState('');
    const [targetWsChannel, setTargetWsChannel] = useState('');
    const [detailTemplate, setDetailTemplate] = useState<Template | null>(null);
    const [versionHistory, setVersionHistory] = useState<Template[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [startMode, setStartMode] = useState<'library' | 'custom'>('library');
    const [selectedLibraryTemplateId, setSelectedLibraryTemplateId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [tplRes, tenantRes, libraryRes] = await Promise.all([
                fetch(`${API_URL}/api/v1/admin/templates`, { headers: authHeaders() }),
                fetch(`${API_URL}/api/v1/admin/tenants`, { headers: authHeaders() }),
                fetch(`${API_URL}/api/v1/admin/template-library`, { headers: authHeaders() }),
            ]);
            const [tplJson, tenantJson, libraryJson] = await Promise.all([
                tplRes.json(),
                tenantRes.json(),
                libraryRes.json(),
            ]);

            if (tplJson.success) {
                setTemplates(tplJson.data.filter((template: Template) => template.tenant_id !== null));
            }

            if (tenantJson.success) {
                setTenants(tenantJson.data);
                if (tenantJson.data.length > 0 && !selectedTenant) {
                    setSelectedTenant(tenantJson.data[0].id);
                }
            }

            if (libraryJson.success) {
                setTemplateLibrary(libraryJson.data);
            }
        } catch (error) {
            console.error('Failed to fetch routing data:', error);
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTemplate(null);
        setEventType('');
        setSubjectLine('');
        setContentBody('');
        setTargetWsChannel('');
        setChannelType('EMAIL');
        setStartMode(templateLibrary.length > 0 ? 'library' : 'custom');
        setSelectedLibraryTemplateId('');
    };

    const openCreateModal = () => {
        setEditingTemplate(null);
        setEventType('');
        setSubjectLine('');
        setContentBody('');
        setTargetWsChannel('');
        setChannelType('EMAIL');
        setStartMode(templateLibrary.length > 0 ? 'library' : 'custom');
        setSelectedLibraryTemplateId('');
        if (tenants.length > 0 && !selectedTenant) {
            setSelectedTenant(tenants[0].id);
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    tenant_id: editingTemplate ? editingTemplate.tenant_id : selectedTenant,
                    event_type: eventType,
                    channel_type: channelType,
                    subject_line: subjectLine || null,
                    content_body: contentBody,
                    target_ws_channel: channelType === 'PUSH' && targetWsChannel ? targetWsChannel : null,
                }),
            });
            const json = await res.json();

            if (json.success) {
                await fetchData();
                closeModal();
            }
        } catch (error) {
            console.error('Failed to publish template:', error);
        }
    };

    const handleDeactivate = async (templateId: string, version: number) => {
        if (!confirm(`Deactivate v${version}?`)) {
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/deactivate`, {
                method: 'PUT',
                headers: authHeaders(),
            });
            const json = await res.json();

            if (json.success) {
                setTemplates((currentTemplates) => currentTemplates.map((template) => (
                    template.template_id === templateId && template.version === version
                        ? { ...template, is_active: false }
                        : template
                )));
                setVersionHistory((currentHistory) => currentHistory.map((versionItem) => (
                    versionItem.version === version
                        ? { ...versionItem, is_active: false }
                        : versionItem
                )));
            }
        } catch (error) {
            console.error('Failed to deactivate template override:', error);
        }
    };

    const handleReactivate = async (templateId: string, version: number) => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${templateId}/version/${version}/reactivate`, {
                method: 'PUT',
                headers: authHeaders(),
            });
            const json = await res.json();

            if (json.success) {
                setTemplates((currentTemplates) => currentTemplates.map((template) => (
                    template.template_id === templateId && template.version === version
                        ? { ...template, is_active: true }
                        : template
                )));
                setVersionHistory((currentHistory) => currentHistory.map((versionItem) => (
                    versionItem.version === version
                        ? { ...versionItem, is_active: true }
                        : versionItem
                )));
            }
        } catch (error) {
            console.error('Failed to reactivate template override:', error);
        }
    };

    const handleEdit = (template: Template) => {
        setEditingTemplate(template);
        setSelectedTenant(template.tenant_id || '');
        setEventType(template.event_type);
        setChannelType(template.channel_type);
        setSubjectLine(template.subject_line || '');
        setContentBody(template.content_body);
        setTargetWsChannel(template.target_ws_channel || '');
        setStartMode('custom');
        setSelectedLibraryTemplateId('');
        setIsModalOpen(true);
    };

    const handleViewDetail = async (template: Template) => {
        setDetailTemplate(template);
        setLoadingHistory(true);

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/templates/${template.template_id}/versions`, {
                headers: authHeaders(),
            });
            const json = await res.json();

            if (json.success) {
                setVersionHistory(json.data);
            }
        } catch (error) {
            console.error('Failed to fetch version history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const libraryOptions = useMemo(
        () => templateLibrary.filter((entry) => entry.channel_type === channelType),
        [channelType, templateLibrary],
    );

    const selectedLibraryTemplate = useMemo(
        () => libraryOptions.find((entry) => entry.id === selectedLibraryTemplateId) || null,
        [libraryOptions, selectedLibraryTemplateId],
    );

    useEffect(() => {
        if (editingTemplate || startMode !== 'library') {
            return;
        }

        if (libraryOptions.length === 0) {
            setSelectedLibraryTemplateId('');
            setSubjectLine('');
            setContentBody('');
            return;
        }

        if (!libraryOptions.some((entry) => entry.id === selectedLibraryTemplateId)) {
            setSelectedLibraryTemplateId(libraryOptions[0].id);
        }
    }, [editingTemplate, libraryOptions, selectedLibraryTemplateId, startMode]);

    useEffect(() => {
        if (editingTemplate || startMode !== 'library' || !selectedLibraryTemplate) {
            return;
        }

        setSubjectLine(selectedLibraryTemplate.subject_line || '');
        setContentBody(selectedLibraryTemplate.content_body);
    }, [editingTemplate, selectedLibraryTemplate, startMode]);

    const getTenantName = (tenantId: string | null) => tenants.find((tenant) => tenant.id === tenantId)?.name || tenantId || 'GLOBAL';

    const latestTemplates = Object.values(
        templates.reduce<Record<string, Template>>((accumulator, template) => {
            if (!accumulator[template.template_id] || template.version > accumulator[template.template_id].version) {
                accumulator[template.template_id] = template;
            }

            return accumulator;
        }, {}),
    );

    const inputClasses = 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white transition-all shadow-sm';

    return (
        <div className="max-w-[1600px] mx-auto space-y-10 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-100 pb-6 gap-4">
                <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Tenant Routing Matrix</h2>
                    <p className="text-sm text-slate-500">Publish isolated Email, SMS, and Push overrides strictly bound to a single project.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 hover:-translate-y-0.5 px-5 py-2.5 rounded-2xl font-medium transition-all shadow-sm"
                >
                    + Publish Override
                </button>
            </div>

            {loading ? (
                <div className="animate-pulse space-y-3">
                    {[...Array(3)].map((_, index) => (
                        <div key={index} className="h-12 bg-slate-100 rounded-2xl border border-slate-100"></div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
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
                            {latestTemplates.map((template) => (
                                <div key={template.template_id} className={`grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-slate-50/50 transition-colors ${!template.is_active ? 'opacity-60' : ''}`}>
                                    <div className="col-span-1">
                                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[template.channel_type]}`}>{template.channel_type}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <p className="text-xs font-semibold text-slate-700 truncate" title={getTenantName(template.tenant_id)}>{getTenantName(template.tenant_id)}</p>
                                    </div>
                                    <div className="col-span-3">
                                        <p className="text-sm font-semibold text-slate-800 font-mono">{template.event_type}</p>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md text-xs font-mono">v{template.version}</span>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        {template.is_active ? (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">Live</span>
                                        ) : (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-500 border border-rose-100">Off</span>
                                        )}
                                    </div>
                                    <div className="col-span-2">
                                        {template.channel_type === 'PUSH' ? (
                                            <span className="text-xs font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{template.target_ws_channel || 'global_system'}</span>
                                        ) : (
                                            <span className="text-xs text-slate-400">-</span>
                                        )}
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-1.5">
                                        <button onClick={() => handleViewDetail(template)} className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-100 px-2.5 py-1 rounded-lg transition-colors">View</button>
                                        <button onClick={() => handleEdit(template)} className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 border border-transparent hover:border-slate-100 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
                                        {template.is_active ? (
                                            <button onClick={() => handleDeactivate(template.template_id, template.version)} className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 px-2.5 py-1 rounded-lg transition-colors">Drop</button>
                                        ) : (
                                            <button onClick={() => handleReactivate(template.template_id, template.version)} className="text-[10px] uppercase tracking-wider font-bold text-emerald-500 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 px-2.5 py-1 rounded-lg transition-colors">Restore</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {detailTemplate && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => { setDetailTemplate(null); setVersionHistory([]); }}>
                    <div className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    {detailTemplate.event_type}
                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${channelBadge[detailTemplate.channel_type]}`}>{detailTemplate.channel_type}</span>
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">Project: <span className="font-semibold text-slate-700">{getTenantName(detailTemplate.tenant_id)}</span></p>
                            </div>
                            <button onClick={() => { handleEdit(detailTemplate); setDetailTemplate(null); setVersionHistory([]); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-100 transition-colors">Edit Override</button>
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
                                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 max-h-48 overflow-y-auto custom-scrollbar">
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
                                        {versionHistory.map((versionItem) => (
                                            <div key={versionItem.version} className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${versionItem.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${versionItem.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>v{versionItem.version}</span>
                                                    <div>
                                                        <p className="text-xs font-medium text-slate-700">{versionItem.subject_line || versionItem.event_type}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{versionItem.created_at ? new Date(versionItem.created_at).toLocaleString() : '-'} · {versionItem.content_body.length} chars</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => { handleEdit(versionItem); setDetailTemplate(null); setVersionHistory([]); }} className="text-[9px] uppercase tracking-wider font-bold text-slate-500 hover:bg-slate-100 px-2 py-1 rounded transition-colors">Fork</button>
                                                    {versionItem.is_active ? (
                                                        <button onClick={() => handleDeactivate(versionItem.template_id, versionItem.version)} className="text-[9px] uppercase tracking-wider font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded transition-colors">Drop</button>
                                                    ) : (
                                                        <button onClick={() => handleReactivate(versionItem.template_id, versionItem.version)} className="text-[9px] uppercase tracking-wider font-bold text-emerald-500 hover:bg-emerald-50 px-2 py-1 rounded transition-colors">Restore</button>
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

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-100 rounded-[2rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            {editingTemplate ? (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                        Edit Override
                                        <span className="text-xs font-mono bg-slate-100 text-slate-600 border border-slate-100 px-2 py-0.5 rounded-md">v{editingTemplate.version} → v{editingTemplate.version + 1}</span>
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Saving publishes a new version. Previous versions remain in history.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-bold text-slate-900">New Tenant Override</h3>
                                    <p className="text-sm text-slate-500 mt-1">Start from a saved reusable template or write a brand-new override.</p>
                                </>
                            )}
                        </div>

                        <div className="overflow-y-auto p-6 custom-scrollbar">
                            <form id="templateForm" onSubmit={handleSubmit} className="space-y-5">
                                {!editingTemplate && (
                                    <div className="space-y-3">
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500">Start Mode</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setStartMode('library')}
                                                className={`rounded-2xl border p-4 text-left transition-all ${startMode === 'library' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                            >
                                                <p className="text-sm font-semibold">Use Saved Template</p>
                                                <p className="text-xs mt-1">Prefill the override from the reusable template library.</p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStartMode('custom')}
                                                className={`rounded-2xl border p-4 text-left transition-all ${startMode === 'custom' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                            >
                                                <p className="text-sm font-semibold">Write New MJML</p>
                                                <p className="text-xs mt-1">Create the override from scratch.</p>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Target Project</label>
                                        <select
                                            value={editingTemplate ? (editingTemplate.tenant_id || '') : selectedTenant}
                                            onChange={(event) => setSelectedTenant(event.target.value)}
                                            disabled={!!editingTemplate}
                                            className={`${inputClasses} ${editingTemplate ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        >
                                            <option value="" disabled>Select a Project</option>
                                            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Event Trigger</label>
                                        <input
                                            type="text"
                                            required
                                            value={eventType}
                                            onChange={(event) => setEventType(event.target.value)}
                                            placeholder="e.g. core.payment.processed"
                                            disabled={!!editingTemplate}
                                            className={`${inputClasses} font-mono ${editingTemplate ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                </div>

                                {editingTemplate && <p className="text-[10px] text-slate-400 font-medium -mt-2">Project, event trigger, and channel are locked. Modify content below.</p>}

                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-3">Channel</label>
                                    <div className="flex gap-3">
                                        {(['EMAIL', 'SMS', 'PUSH'] as const).map((type) => (
                                            <label key={type} className={`flex-1 cursor-pointer border rounded-2xl p-3 flex flex-col items-center transition-all ${editingTemplate ? 'pointer-events-none' : ''} ${channelType === type ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                                                <input
                                                    type="radio"
                                                    value={type}
                                                    checked={channelType === type}
                                                    onChange={() => setChannelType(type)}
                                                    className="sr-only"
                                                    disabled={!!editingTemplate}
                                                />
                                                <span className="font-extrabold tracking-wider text-sm">{type}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {!editingTemplate && startMode === 'library' && (
                                    <div className="space-y-4 rounded-[1.5rem] border border-slate-200 bg-slate-50/60 p-5">
                                        <div>
                                            <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Saved Template</label>
                                            {libraryOptions.length > 0 ? (
                                                <select
                                                    value={selectedLibraryTemplateId}
                                                    onChange={(event) => setSelectedLibraryTemplateId(event.target.value)}
                                                    className={inputClasses}
                                                >
                                                    {libraryOptions.map((entry) => (
                                                        <option key={entry.id} value={entry.id}>
                                                            {entry.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                                                    No saved {channelType.toLowerCase()} templates are available yet. Use the Template Playground to create one or switch to &quot;Write New MJML&quot;.
                                                </div>
                                            )}
                                        </div>

                                        {selectedLibraryTemplate && (
                                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.95fr)]">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Library Content</p>
                                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-mono text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                                                        {selectedLibraryTemplate.content_body}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Expected JSON Shape</p>
                                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 max-h-48 overflow-y-auto custom-scrollbar">
                                                        <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-relaxed">
                                                            {JSON.stringify(selectedLibraryTemplate.sample_data, null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {channelType !== 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Subject Line</label>
                                        <input
                                            type="text"
                                            value={subjectLine}
                                            onChange={(event) => setSubjectLine(event.target.value)}
                                            placeholder="e.g. Your invoice for {{orderId}}"
                                            className={`${inputClasses} font-mono`}
                                        />
                                    </div>
                                )}

                                {channelType === 'PUSH' && (
                                    <div>
                                        <label className="block text-xs uppercase tracking-wider font-bold text-amber-500 mb-2">WebSocket Namespace</label>
                                        <input
                                            type="text"
                                            value={targetWsChannel}
                                            onChange={(event) => setTargetWsChannel(event.target.value)}
                                            placeholder="e.g. application_alerts"
                                            className="w-full bg-amber-50/30 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-mono text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm placeholder-amber-400/70"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Content Body</label>
                                    <textarea
                                        required
                                        rows={10}
                                        value={contentBody}
                                        onChange={(event) => setContentBody(event.target.value)}
                                        placeholder={channelType === 'EMAIL' ? '<mjml>\n  <mj-body>...</mj-body>\n</mjml>' : 'Hello {{name}}, your action was successful!'}
                                        className={`${inputClasses} font-mono shadow-inner whitespace-pre custom-scrollbar placeholder-slate-400`}
                                    />
                                    {!editingTemplate && startMode === 'library' && selectedLibraryTemplate && (
                                        <p className="text-[11px] text-slate-500 mt-2">This content started from <span className="font-semibold">{selectedLibraryTemplate.name}</span>. You can edit it before publishing the override.</p>
                                    )}
                                </div>
                            </form>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end space-x-3">
                            <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                            <button type="submit" form="templateForm" className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-sm">
                                {editingTemplate ? `Publish v${editingTemplate.version + 1}` : 'Deploy Route Override'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
