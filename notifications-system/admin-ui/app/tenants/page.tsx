'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';
import { authHeaders } from '../../lib/auth';

interface Tenant {
    id: string;
    name: string;
    api_key: string;
    allowed_channels: string[];
    is_active: boolean;
    created_at: string;
    provider_config_id?: string | null;
    sender_email?: string | null;
    sender_name?: string | null;
    rate_limit_per_minute: number;
    daily_notification_cap: number;
}

interface ProviderConfig {
    id: string;
    name: string;
}

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [providers, setProviders] = useState<ProviderConfig[]>([]);
    const [loading, setLoading] = useState(true);

    // Create Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newTenantName, setNewTenantName] = useState('');
    const [newChannels, setNewChannels] = useState('');
    const [newProviderId, setNewProviderId] = useState('');
    const [newSenderEmail, setNewSenderEmail] = useState('');
    const [newSenderName, setNewSenderName] = useState('');
    const [newRateLimit, setNewRateLimit] = useState(100);
    const [newDailyCap, setNewDailyCap] = useState(10000);

    // Edit Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [editTenantName, setEditTenantName] = useState('');
    const [editChannels, setEditChannels] = useState('');
    const [editProviderId, setEditProviderId] = useState('');
    const [editSenderEmail, setEditSenderEmail] = useState('');
    const [editSenderName, setEditSenderName] = useState('');
    const [editRateLimit, setEditRateLimit] = useState(100);
    const [editDailyCap, setEditDailyCap] = useState(10000);

    // Detail Modal
    const [detailTenant, setDetailTenant] = useState<Tenant | null>(null);

    useEffect(() => {
        fetchTenants();
        fetchProviders();
    }, []);

    const fetchTenants = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/v1/admin/tenants`, { headers: authHeaders() });
            const json = await res.json();
            if (json.success) setTenants(json.data);
        } catch (err) { console.error('Failed to fetch tenants:', err); }
        finally { setLoading(false); }
    };

    const fetchProviders = async () => {
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/providers`, { headers: authHeaders() });
            const json = await res.json();
            if (json.success) setProviders(json.data);
        } catch (err) { console.error('Failed to fetch providers:', err); }
    };

    const handleCreateNew = async (e: React.FormEvent) => {
        e.preventDefault();
        const channelsArray = newChannels.split(',').map(c => c.trim()).filter(Boolean);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/tenants`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    name: newTenantName,
                    allowed_channels: channelsArray,
                    provider_config_id: newProviderId || undefined,
                    sender_email: newSenderEmail || undefined,
                    sender_name: newSenderName || undefined,
                    rate_limit_per_minute: Number(newRateLimit),
                    daily_notification_cap: Number(newDailyCap)
                }),
            });
            const json = await res.json();
            if (json.success) {
                setTenants([json.data, ...tenants]);
                setIsModalOpen(false);
                setNewTenantName(''); setNewChannels(''); setNewProviderId(''); setNewSenderEmail(''); setNewSenderName('');
                setNewRateLimit(100); setNewDailyCap(10000);
            }
        } catch (err) { console.error('Failed to create tenant', err); }
    };

    const handleOpenEdit = (tenant: Tenant) => {
        setEditingTenant(tenant);
        setEditTenantName(tenant.name);
        setEditChannels(tenant.allowed_channels ? tenant.allowed_channels.join(', ') : '');
        setEditProviderId(tenant.provider_config_id || '');
        setEditSenderEmail(tenant.sender_email || '');
        setEditSenderName(tenant.sender_name || '');
        setEditRateLimit(tenant.rate_limit_per_minute || 100);
        setEditDailyCap(tenant.daily_notification_cap || 10000);
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTenant) return;
        const channelsArray = editChannels.split(',').map(c => c.trim()).filter(Boolean);
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/tenants/${editingTenant.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    name: editTenantName,
                    allowed_channels: channelsArray,
                    provider_config_id: editProviderId || null,
                    sender_email: editSenderEmail || null,
                    sender_name: editSenderName || null,
                    rate_limit_per_minute: Number(editRateLimit),
                    daily_notification_cap: Number(editDailyCap)
                }),
            });
            const json = await res.json();
            if (json.success) {
                setTenants(tenants.map(t => t.id === editingTenant.id ? {
                    ...t,
                    name: editTenantName,
                    allowed_channels: channelsArray,
                    provider_config_id: editProviderId || null,
                    sender_email: editSenderEmail || null,
                    sender_name: editSenderName || null,
                    rate_limit_per_minute: Number(editRateLimit),
                    daily_notification_cap: Number(editDailyCap)
                } : t));
                setIsEditModalOpen(false);
                setEditingTenant(null);
            }
        } catch (err) { console.error('Failed to update tenant', err); }
    };

    const handleRotateKey = async (id: string) => {
        if (!confirm('Are you sure you want to rotate this API key? Existing integrations will break immediately.')) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/tenants/${id}/rotate-key`, { method: 'PUT', headers: authHeaders() });
            const json = await res.json();
            if (json.success) {
                setTenants(tenants.map(t => t.id === id ? { ...t, api_key: json.data.api_key } : t));
                if (detailTenant?.id === id) setDetailTenant({ ...detailTenant, api_key: json.data.api_key });
            }
        } catch (err) { console.error('Failed to rotate API Key', err); }
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        if (!confirm(`Are you sure you want to ${currentStatus ? 'Deactivate' : 'Reactivate'} this Tenant?`)) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/tenants/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ is_active: !currentStatus })
            });
            const json = await res.json();
            if (json.success) {
                setTenants(tenants.map(t => t.id === id ? { ...t, is_active: !currentStatus } : t));
            }
        } catch (err) { console.error('Failed to toggle status', err); }
    };

    const handleCopyId = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Project Tenants</h2>
                    <p className="text-sm text-slate-500">Manage decoupled projects, configure channel boundaries, and securely rotate API keys.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm">+ Onboard Project</button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl border border-slate-200"></div>)}</div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-3">Project Name</div>
                        <div className="col-span-3">Project ID</div>
                        <div className="col-span-2">Namespaces</div>
                        <div className="col-span-1 text-center">Status</div>
                        <div className="col-span-3 text-right">Actions</div>
                    </div>
                    {tenants.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">No tenants onboarded yet. Click &quot;+ Onboard Project&quot; to get started.</div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {tenants.map((tenant) => (
                                <div key={tenant.id} className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/50 transition-colors ${!tenant.is_active ? 'opacity-60' : ''}`}>
                                    <div className="col-span-3">
                                        <p className="text-sm font-semibold text-slate-800">{tenant.name}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{new Date(tenant.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="col-span-3">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-mono text-slate-500 truncate" title={tenant.id}>{tenant.id}</p>
                                            <button onClick={() => handleCopyId(tenant.id)} className="text-slate-400 hover:text-indigo-500 transition-colors shrink-0" title="Copy ID">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="col-span-2">
                                        <div className="flex flex-wrap gap-1">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">global_system</span>
                                            {tenant.allowed_channels?.map(ch => (
                                                <span key={ch} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">{ch}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        {tenant.is_active ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">Active</span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-50 text-rose-500 border border-rose-100">Inactive</span>
                                        )}
                                    </div>
                                    <div className="col-span-3 flex justify-end gap-2">
                                        <button onClick={() => setDetailTenant(tenant)} className="text-[10px] uppercase tracking-wider font-bold text-blue-500 hover:bg-blue-50 border border-transparent hover:border-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">View</button>
                                        <button onClick={() => handleOpenEdit(tenant)} className="text-[10px] uppercase tracking-wider font-bold text-indigo-500 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">Edit</button>
                                        <button onClick={() => handleToggleActive(tenant.id, tenant.is_active)} className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1.5 rounded-lg transition-colors border border-transparent ${tenant.is_active ? 'text-rose-500 hover:bg-rose-50 hover:border-rose-100' : 'text-emerald-500 hover:bg-emerald-50 hover:border-emerald-100'}`}>
                                            {tenant.is_active ? 'Suspend' : 'Restore'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            {detailTenant && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setDetailTenant(null)}>
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{detailTenant.name}</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Created {new Date(detailTenant.created_at).toLocaleDateString()}</p>
                            </div>
                            {detailTenant.is_active ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">Active</span>
                            ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-500 border border-rose-100">Inactive</span>
                            )}
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Project ID (Public — Frontend Safe)</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate">{detailTenant.id}</code>
                                    <button onClick={() => handleCopyId(detailTenant.id)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors text-xs font-bold">Copy</button>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">API Webhook Key (Secret — Backend Only)</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 truncate">{detailTenant.api_key}</code>
                                    <button onClick={() => handleCopyId(detailTenant.api_key)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors text-xs font-bold">Copy</button>
                                    <button onClick={() => handleRotateKey(detailTenant.id)} className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors text-xs font-bold border border-rose-100">Rotate</button>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">WebSocket Namespaces</p>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">global_system</span>
                                    {detailTenant.allowed_channels?.map(ch => (
                                        <span key={ch} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">{ch}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Rate Limit (Per Min)</p>
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600">
                                        {detailTenant.rate_limit_per_minute} req/m
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2">Daily Quota</p>
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-600">
                                        {detailTenant.daily_notification_cap?.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end">
                            <button onClick={() => setDetailTenant(null)} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/50 transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Configure New Project</h3>
                            <p className="text-sm text-slate-500 mt-1">Generate an independent API Key and WebSocket boundary isolation.</p>
                        </div>
                        <form onSubmit={handleCreateNew} className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Project Name</label>
                                <input type="text" required value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="e.g. TMaaS Processing Engine" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">WebSocket Boundaries</label>
                                <input type="text" value={newChannels} onChange={e => setNewChannels(e.target.value)} placeholder="e.g. ecommerce_store, support_chat" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                <p className="text-[11px] text-slate-500 mt-2 font-medium">Comma separated namespaces for real-time In-App Popups (Optional).</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Integration Configuration (BYOP)</label>
                                <select value={newProviderId} onChange={e => setNewProviderId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm select-chevron">
                                    <option value="">System Default</option>
                                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Override Sender Email</label>
                                    <input type="email" value={newSenderEmail} onChange={e => setNewSenderEmail(e.target.value)} placeholder="hello@tmaas.africa" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Override Sender Name</label>
                                    <input type="text" value={newSenderName} onChange={e => setNewSenderName(e.target.value)} placeholder="TMaaS App" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Rate Limit (req/min)</label>
                                    <input type="number" required value={newRateLimit} onChange={e => setNewRateLimit(parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Daily Notifications Cap</label>
                                    <input type="number" required value={newDailyCap} onChange={e => setNewDailyCap(parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">Establish Infrastructure</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingTenant && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Edit Project</h3>
                            <p className="text-sm text-slate-500 mt-1">Update the project name and websocket boundaries.</p>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Project Name</label>
                                <input type="text" required value={editTenantName} onChange={e => setEditTenantName(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">WebSocket Boundaries</label>
                                <input type="text" value={editChannels} onChange={e => setEditChannels(e.target.value)} placeholder="e.g. ecommerce_store, support_chat" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                <p className="text-[11px] text-slate-500 mt-2 font-medium">Comma separated namespaces (Optional).</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Integration Configuration (BYOP)</label>
                                <select value={editProviderId} onChange={e => setEditProviderId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm select-chevron">
                                    <option value="">System Default</option>
                                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Override Sender Email</label>
                                    <input type="email" value={editSenderEmail} onChange={e => setEditSenderEmail(e.target.value)} placeholder="hello@tmaas.africa" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Override Sender Name</label>
                                    <input type="text" value={editSenderName} onChange={e => setEditSenderName(e.target.value)} placeholder="TMaaS App" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Rate Limit (req/min)</label>
                                    <input type="number" required value={editRateLimit} onChange={e => setEditRateLimit(parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Daily Notifications Cap</label>
                                    <input type="number" required value={editDailyCap} onChange={e => setEditDailyCap(parseInt(e.target.value) || 0)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end space-x-3">
                                <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingTenant(null); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
