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
        <div className="min-h-screen flex bg-white relative overflow-hidden">
            {/* Left Side - Brand / Art */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-slate-950 items-center justify-center overflow-hidden">
                {/* Abstract animated glow background */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-1/4 left-1/4 w-[30rem] h-[30rem] bg-indigo-600/30 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-[35rem] h-[35rem] bg-violet-600/20 rounded-full blur-[100px]" style={{ animationDelay: '2s' }} />
                </div>
                
                {/* Brand Text */}
                <div className="relative z-10 p-12 max-w-xl text-left">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/30">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                </svg>
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-tight leading-tight mb-4">
                        Nucleus
                    </h1>
                    <p className="text-lg text-slate-400 font-medium leading-relaxed">
                        Securely manage your global omnichannel notifications. High throughput, guaranteed delivery, and minimal configuration.
                    </p>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
                <div className="w-full max-w-md">
                    {/* Mobile Logo */}
                    <div className="lg:hidden flex flex-col items-center mb-10 text-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{theme.brandName}</h1>
                        <p className="text-slate-500 text-xs mt-1 uppercase tracking-[0.2em] font-semibold">{theme.tagline}</p>
                    </div>

                    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8 sm:p-10">
                        {/* Header */}
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
                            <p className="text-sm text-slate-500 mt-2">Sign in to the platform operator console to continue.</p>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-2xl text-sm font-medium">
                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2" htmlFor="login-username">
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
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white transition-all shadow-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2" htmlFor="login-password">
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
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white transition-all shadow-sm"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-4 rounded-2xl font-bold text-sm transition-all duration-300 ${
                                    loading
                                        ? 'bg-slate-300 text-slate-500 cursor-wait shadow-none'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/40 hover:-translate-y-0.5'
                                }`}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Authenticating...
                                    </span>
                                ) : (
                                    'Secure Sign In'
                                )}
                            </button>
                        </form>

                        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            Tenant admins sign in at <span className="font-semibold text-slate-700">/tenant/login</span>.
                        </div>
                    </div>

                    <p className="text-center text-xs text-slate-400 font-medium mt-8">
                        Session strictly locked to terminal IP · Expires in 8 hours
                    </p>
                </div>
            </div>
        </div>
    );
}
