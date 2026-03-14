'use client';

import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/api';

interface ProviderConfig {
    id: string;
    name: string;
    provider: 'SENDGRID' | 'RESEND' | 'TWILIO' | 'AFRICASTALKING' | 'CUSTOM';
    api_key?: string;
    sender_email: string;
    sender_name: string;
    created_at: string;
}

export default function ProvidersPage() {
    const [providers, setProviders] = useState<ProviderConfig[]>([]);
    const [loading, setLoading] = useState(true);

    // Create Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newProvider, setNewProvider] = useState<ProviderConfig['provider']>('RESEND');
    const [newApiKey, setNewApiKey] = useState('');
    const [newSenderEmail, setNewSenderEmail] = useState('');
    const [newSenderName, setNewSenderName] = useState('');

    // Edit Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
    const [editName, setEditName] = useState('');
    const [editProvider, setEditProvider] = useState<ProviderConfig['provider']>('RESEND');
    const [editApiKey, setEditApiKey] = useState('');
    const [editSenderEmail, setEditSenderEmail] = useState('');
    const [editSenderName, setEditSenderName] = useState('');

    useEffect(() => { fetchProviders(); }, []);

    const fetchProviders = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/v1/admin/providers`);
            const json = await res.json();
            if (json.success) setProviders(json.data);
        } catch (err) { console.error('Failed to fetch provider configs:', err); }
        finally { setLoading(false); }
    };

    const handleCreateNew = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/providers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    provider: newProvider,
                    api_key: newApiKey,
                    sender_email: newSenderEmail || undefined,
                    sender_name: newSenderName || undefined
                }),
            });
            const json = await res.json();
            if (json.success) {
                setProviders([json.data, ...providers]);
                setIsModalOpen(false);
                setNewName(''); setNewApiKey(''); setNewSenderEmail(''); setNewSenderName('');
            }
        } catch (err) { console.error('Failed to create provider config', err); }
    };

    const handleOpenEdit = (provider: ProviderConfig) => {
        setEditingProvider(provider);
        setEditName(provider.name);
        setEditProvider(provider.provider);
        setEditApiKey(''); // Leave blank unless they want to update it
        setEditSenderEmail(provider.sender_email || '');
        setEditSenderName(provider.sender_name || '');
        setIsEditModalOpen(true);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProvider) return;
        try {
            const payload: any = {
                name: editName,
                provider: editProvider,
                sender_email: editSenderEmail || null,
                sender_name: editSenderName || null
            };
            // Only update API key if user typed a new one
            if (editApiKey.trim() !== '') {
                payload.api_key = editApiKey;
            }

            const res = await fetch(`${API_URL}/api/v1/admin/providers/${editingProvider.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.success) {
                setProviders(providers.map(p => p.id === editingProvider.id ? {
                    ...p,
                    name: editName,
                    provider: editProvider,
                    sender_email: editSenderEmail,
                    sender_name: editSenderName
                } : p));
                setIsEditModalOpen(false);
                setEditingProvider(null);
            }
        } catch (err) { console.error('Failed to update provider config', err); }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}? Projects explicitly relying on this will fallback to system defaults.`)) return;
        try {
            const res = await fetch(`${API_URL}/api/v1/admin/providers/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                setProviders(providers.filter(p => p.id !== id));
            }
        } catch (err) { console.error('Failed to delete provider config', err); }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">Integrations (BYOP)</h2>
                    <p className="text-sm text-slate-500">Bring Your Own Provider. Register API keys for external services once and share them across multiple tenants securely.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm">+ Add Integration</button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="animate-pulse space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl border border-slate-200"></div>)}</div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        <div className="col-span-3">Configuration Name</div>
                        <div className="col-span-2 text-center">Provider</div>
                        <div className="col-span-5">Default Sender Info</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {providers.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">No external integrations set up yet. Click &quot;+ Add Integration&quot; to get started.</div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {providers.map((config) => (
                                <div key={config.id} className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/50 transition-colors`}>
                                    <div className="col-span-3">
                                        <p className="text-sm font-semibold text-slate-800">{config.name}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{new Date(config.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div className="col-span-2 text-center">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">{config.provider}</span>
                                    </div>
                                    <div className="col-span-5">
                                        <p className="text-xs font-medium text-slate-700">{config.sender_name || 'System Default Name'}</p>
                                        <p className="text-xs font-mono text-slate-500 mt-0.5">&lt;{config.sender_email || 'system-default@fallback.com'}&gt;</p>
                                    </div>
                                    <div className="col-span-2 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(config)} className="text-[10px] uppercase tracking-wider font-bold text-indigo-500 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">Edit</button>
                                        <button onClick={() => handleDelete(config.id, config.name)} className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 px-2.5 py-1.5 rounded-lg transition-colors">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Add New Integration</h3>
                            <p className="text-sm text-slate-500 mt-1">Configure an external dispatch provider like Resend or Twilio.</p>
                        </div>
                        <form onSubmit={handleCreateNew} className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Internal Registration Name</label>
                                <input type="text" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Master Resend Account" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Provider Platform</label>
                                <select value={newProvider} onChange={e => setNewProvider(e.target.value as any)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm select-chevron">
                                    <option value="RESEND">Resend (Email)</option>
                                    <option value="SENDGRID">SendGrid (Email)</option>
                                    <option value="TWILIO">Twilio (SMS)</option>
                                    <option value="AFRICASTALKING">Africa's Talking (SMS)</option>
                                    <option value="CUSTOM">Custom Provider</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">API Key / Credentials</label>
                                <input type="password" required value={newApiKey} onChange={e => setNewApiKey(e.target.value)} placeholder="e.g. re_123456789" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                                <p className="text-[11px] text-slate-500 mt-2 font-medium">Encrypted at rest securely.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sender Email (Optional)</label>
                                    <input type="email" value={newSenderEmail} onChange={e => setNewSenderEmail(e.target.value)} placeholder="hello@tmaas.africa" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sender Name (Optional)</label>
                                    <input type="text" value={newSenderName} onChange={e => setNewSenderName(e.target.value)} placeholder="TMaaS Core" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 shadow-sm">Save Integration</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && editingProvider && (
                <div className="fixed inset-0 bg-slate-500/20 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Edit Integration</h3>
                            <p className="text-sm text-slate-500 mt-1">Update external provider settings.</p>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Internal Registration Name</label>
                                <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Provider Platform</label>
                                <select value={editProvider} onChange={e => setEditProvider(e.target.value as any)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm select-chevron">
                                    <option value="RESEND">Resend (Email)</option>
                                    <option value="SENDGRID">SendGrid (Email)</option>
                                    <option value="TWILIO">Twilio (SMS)</option>
                                    <option value="AFRICASTALKING">Africa's Talking (SMS)</option>
                                    <option value="CUSTOM">Custom Provider</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">API Key / Credentials (Optional - Leave blank to keep existing)</label>
                                <input type="password" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Enter new API key to update..." className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sender Email (Optional)</label>
                                    <input type="email" value={editSenderEmail} onChange={e => setEditSenderEmail(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Sender Name (Optional)</label>
                                    <input type="text" value={editSenderName} onChange={e => setEditSenderName(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent shadow-sm" />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end space-x-3">
                                <button type="button" onClick={() => { setIsEditModalOpen(false); setEditingProvider(null); }} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 shadow-sm">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
