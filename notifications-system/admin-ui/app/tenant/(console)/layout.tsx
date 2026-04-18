'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTenantAuth, getTenantUser } from '../../../lib/auth';
import { TenantAuthProvider } from '../../../lib/auth-provider';
import { ErrorBoundary } from '../../../lib/error-boundary';
import { StatusBadge, cx } from '../../../lib/operator-console';
import { theme } from '../../../lib/theme-config';

type NavItem = {
  href: string;
  label: string;
  match: 'exact' | 'prefix';
  description: string;
  icon: ReactNode;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      {
        href: '/tenant',
        label: 'Overview',
        match: 'exact',
        description: 'Tenant activity, provider posture, and current delivery pressure.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5m0 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0H7.25M9 11.25v1.5M12 9v3.75m3-6v6"
            />
          </svg>
        ),
      },
      {
        href: '/tenant/playground',
        label: 'Playground',
        match: 'prefix',
        description: 'Compose, preview, and test multi-channel template output safely.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931ZM19.5 7.125 16.875 4.5M18 14.25v4.125c0 .621-.504 1.125-1.125 1.125H5.625A1.125 1.125 0 0 1 4.5 18.375V7.125C4.5 6.504 5.004 6 5.625 6H9.75"
            />
          </svg>
        ),
      },
      {
        href: '/tenant/account',
        label: 'Account',
        match: 'prefix',
        description: 'Session ownership, password reset state, and access identity.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.964 0m11.964 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        href: '/tenant/templates',
        label: 'Templates',
        match: 'prefix',
        description: 'Author, revise, and publish tenant-owned communication templates.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        ),
      },
      {
        href: '/tenant/template-library',
        label: 'Template Library',
        match: 'prefix',
        description: 'Browse reusable patterns and accelerate tenant-side publishing.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 6.75A2.25 2.25 0 0 1 4.5 4.5h4.5a2.25 2.25 0 0 1 2.25 2.25v12.75A2.25 2.25 0 0 0 9 17.25H4.5A2.25 2.25 0 0 1 2.25 15V6.75Zm9 0A2.25 2.25 0 0 1 13.5 4.5H18a2.25 2.25 0 0 1 2.25 2.25V15A2.25 2.25 0 0 1 18 17.25h-4.5a2.25 2.25 0 0 0-2.25 2.25V6.75Z"
            />
          </svg>
        ),
      },
      {
        href: '/tenant/providers',
        label: 'Providers',
        match: 'prefix',
        description: 'Manage tenant-scoped providers, credentials, and channel readiness.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25v-1.5a3 3 0 0 0-6 0v1.5m-3 0h9.75m-9.75 0A2.25 2.25 0 0 0 4.5 7.5v9A2.25 2.25 0 0 0 6.75 18.75h10.5A2.25 2.25 0 0 0 19.5 16.5v-9a2.25 2.25 0 0 0-2.25-2.25m-9.75 0h9.75"
            />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/tenant/logs',
        label: 'Logs',
        match: 'prefix',
        description: 'Inspect notification outcomes, metadata, and channel behavior.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        ),
      },
      {
        href: '/tenant/dlq',
        label: 'Recovery Queue',
        match: 'prefix',
        description: 'Review failed deliveries and replay eligible tenant notifications.',
        icon: (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        ),
      },
    ],
  },
];

const pageLabels: { match: RegExp; label: string }[] = [
  { match: /^\/tenant$/, label: 'Tenant Overview' },
  { match: /^\/tenant\/playground/, label: 'Template Playground' },
  { match: /^\/tenant\/templates/, label: 'Template Manager' },
  { match: /^\/tenant\/template-library/, label: 'Template Library' },
  { match: /^\/tenant\/providers/, label: 'Provider Policy' },
  { match: /^\/tenant\/logs/, label: 'Delivery Logs' },
  { match: /^\/tenant\/dlq/, label: 'Recovery Queue' },
  { match: /^\/tenant\/account/, label: 'Tenant Account' },
];

export default function TenantConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tenantUser = getTenantUser();
  const activeLabel =
    pageLabels.find((entry) => entry.match.test(pathname))?.label ||
    'Tenant Console';

  const isActiveItem = (href: string, match: 'exact' | 'prefix') =>
    match === 'exact'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    clearTenantAuth();
    router.replace('/tenant/login');
  };

  return (
    <TenantAuthProvider>
      <div className="h-[100dvh] overflow-hidden bg-slate-100 text-slate-900">
        <div className="grid h-full min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-slate-800 bg-slate-950 text-slate-300 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
            <div className="border-b border-slate-800 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 shadow-lg shadow-sky-950/40">
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h1 className="mt-1 text-xl font-black tracking-tight text-white">
                    {theme.brandName}
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    Tenant workspace
                  </p>
                </div>
              </div>
            </div>

            <nav className="custom-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto px-4 py-5">
              {navSections.map((section) => (
                <div key={section.label}>
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {section.label}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {section.items.map((item) => {
                      const isActive = isActiveItem(item.href, item.match);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cx(
                            'group block rounded-xl border px-3 py-3 transition',
                            isActive
                              ? 'border-sky-500/60 bg-sky-600 text-white shadow-lg shadow-sky-950/20'
                              : 'border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900',
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cx(
                                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center',
                                isActive
                                  ? 'text-white'
                                  : 'text-slate-500 group-hover:text-slate-300',
                              )}
                            >
                              {item.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tracking-tight">
                                {item.label}
                              </p>
                              <p
                                className={cx(
                                  'mt-1 text-xs leading-5',
                                  isActive
                                    ? 'text-sky-100'
                                    : 'text-slate-500 group-hover:text-slate-400',
                                )}
                              >
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-slate-800 px-4 py-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-xs font-bold uppercase text-white">
                    <span suppressHydrationWarning>
                      {(tenantUser?.displayName || tenantUser?.username)?.charAt(0) || 'T'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold text-white"
                      suppressHydrationWarning
                    >
                      {tenantUser?.displayName || tenantUser?.username || 'Tenant admin'}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Tenant session
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-100"
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>

          <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {activeLabel}
                  </p>
                  <p
                    className="truncate text-sm font-semibold text-slate-900"
                    suppressHydrationWarning
                  >
                    {tenantUser?.displayName || tenantUser?.username || 'Tenant admin'}
                  </p>
                </div>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  Sign out
                </button>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="min-w-0 px-4 py-5 lg:px-8 lg:py-6">
                <ErrorBoundary>{children}</ErrorBoundary>
              </div>
            </div>
          </main>
        </div>
      </div>
    </TenantAuthProvider>
  );
}
