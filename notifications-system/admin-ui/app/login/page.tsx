'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '../../lib/api';
import { setAuth, isAuthenticated, LoginResponse } from '../../lib/auth';
import { theme } from '../../lib/theme-config';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (isAuthenticated()) {
            router.replace('/');
        }
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/v1/admin/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const json: LoginResponse = await res.json();

            if (json.success && json.data) {
                setAuth(json.data.token, json.data.user);
                router.replace('/');
            } else {
                setError(json.message || 'Invalid credentials');
            }
        } catch {
            setError('Unable to connect to the server');
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
            </div>

            {/* Login card */}
            <div className="relative w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-10">
                    <h1 className={`text-4xl font-black bg-gradient-to-br ${theme.sidebar.logoGradient} bg-clip-text text-transparent drop-shadow-sm`}>
                        {theme.brandName}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 uppercase tracking-[0.3em] font-semibold">{theme.tagline}</p>
                </div>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/60 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-8 pt-8 pb-4">
                        <h2 className="text-xl font-bold text-white">Welcome back</h2>
                        <p className="text-sm text-slate-400 mt-1.5">Sign in to your admin console</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
                        {error && (
                            <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2" htmlFor="login-username">
                                Username
                            </label>
                            <input
                                id="login-username"
                                type="text"
                                required
                                autoFocus
                                autoComplete="username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="admin"
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2" htmlFor="login-password">
                                Password
                            </label>
                            <input
                                id="login-password"
                                type="password"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all shadow-lg ${
                                loading
                                    ? 'bg-blue-500/50 text-blue-200 cursor-wait'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white hover:shadow-blue-500/25'
                            }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Authenticating...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer hint */}
                <p className="text-center text-xs text-slate-600 mt-6">
                    Protected admin interface · Session expires in 8 hours
                </p>
            </div>
        </div>
    );
}
