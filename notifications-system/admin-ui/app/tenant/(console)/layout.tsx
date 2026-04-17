'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { theme } from '../../../lib/theme-config';
import { ErrorBoundary } from '../../../lib/error-boundary';
import { TenantAuthProvider } from '../../../lib/auth-provider';
import { getTenantUser } from '../../../lib/auth';

type NavItem = {
  href: string;
  label: string;
  match: 'exact' | 'prefix';
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    href: '/tenant',
    label: 'Overview',
    match: 'exact',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    href: '/tenant/playground',
    label: 'Playground',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931ZM19.5 7.125 16.875 4.5M18 14.25v4.125c0 .621-.504 1.125-1.125 1.125H5.625A1.125 1.125 0 0 1 4.5 18.375V7.125C4.5 6.504 5.004 6 5.625 6H9.75" />
      </svg>
    ),
  },
  {
    href: '/tenant/templates',
    label: 'Templates',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: '/tenant/template-library',
    label: 'Template Library',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75A2.25 2.25 0 0 1 4.5 4.5h4.5a2.25 2.25 0 0 1 2.25 2.25v12.75A2.25 2.25 0 0 0 9 17.25H4.5A2.25 2.25 0 0 1 2.25 15V6.75Zm9 0A2.25 2.25 0 0 1 13.5 4.5H18a2.25 2.25 0 0 1 2.25 2.25V15A2.25 2.25 0 0 1 18 17.25h-4.5a2.25 2.25 0 0 0-2.25 2.25V6.75Z" />
      </svg>
    ),
  },
  {
    href: '/tenant/providers',
    label: 'Providers',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v-1.5a3 3 0 0 0-6 0v1.5m-3 0h9.75m-9.75 0A2.25 2.25 0 0 0 4.5 7.5v9A2.25 2.25 0 0 0 6.75 18.75h10.5A2.25 2.25 0 0 0 19.5 16.5v-9a2.25 2.25 0 0 0-2.25-2.25m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    href: '/tenant/logs',
    label: 'Logs',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: '/tenant/dlq',
    label: 'DLQ',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    href: '/tenant/account',
    label: 'Account',
    match: 'prefix',
    icon: (
      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.964 0m11.964 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

export default function TenantConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tenantUser = getTenantUser();
  const isActiveItem = (href: string, match: 'exact' | 'prefix') =>
    match === 'exact'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <TenantAuthProvider>
      <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
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

        <main className="flex-1 flex flex-col overflow-hidden relative">
          <header className="h-16 px-8 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
            <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Tenant Console
            </div>
            <div className="text-sm font-medium text-slate-600">
              {tenantUser?.displayName || tenantUser?.username || 'Tenant Admin'}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 lg:p-12 mb-10">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </TenantAuthProvider>
  );
}
