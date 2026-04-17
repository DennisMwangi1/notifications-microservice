'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { theme } from '../../lib/theme-config';
import { ErrorBoundary } from '../../lib/error-boundary';
import { AuthProvider } from '../../lib/auth-provider';

type NavItem = {
  href: string;
  label: string;
  match: 'exact' | 'prefix';
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { href: '/', label: 'Overview', match: 'exact', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg> },
  { href: '/tenants', label: 'Tenants', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
  { href: '/limits', label: 'Quotas & Limits', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" /><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25 10.5 11l3 2.25 4.5-6" /></svg> },
  { href: '/logs', label: 'Logs', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
  { href: '/dlq', label: 'DLQ', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg> },
  { href: '/mail', label: 'Operational Mailer', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-.671 1.591l-7.5 7.5a2.25 2.25 0 01-3.182 0l-7.5-7.5A2.25 2.25 0 012.25 9V6A2.25 2.25 0 014.5 3.75h15A2.25 2.25 0 0121.75 6V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 6l9 6 9-6" /></svg> },
  { href: '/audit', label: 'Audit & Support', match: 'prefix', icon: <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12s4.03-9 9-9 9 4.03 9 9Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v4.5" /></svg> },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActiveItem = (href: string, match: 'exact' | 'prefix') => (
    match === 'exact'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`)
  );

  return (
    <AuthProvider>
      <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
        {/* Sidebar */}
        <aside className="w-72 bg-slate-950 border-r border-slate-800/80 flex flex-col shadow-2xl z-20 text-slate-400">
          <div className="p-8 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {theme.brandName}
                </h1>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1.5 mt-8 overflow-y-auto custom-scrollbar">
            <div className="px-4 text-xs font-bold uppercase tracking-wider text-slate-600 mb-4">Menu</div>
            {navItems.map((item) => {
              const isActive = isActiveItem(item.href, item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center px-4 py-3.5 text-sm font-semibold rounded-2xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-5 h-5 mr-3.5 transition-colors ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top Bar for polish */}
          <header className="h-16 px-8 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
              <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                Platform Operations
              </div>
              <div className="text-sm font-medium text-slate-600">
                Platform Operator
              </div>
          </header>
          
          <div className="flex-1 overflow-y-auto p-8 lg:p-12 mb-10">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
