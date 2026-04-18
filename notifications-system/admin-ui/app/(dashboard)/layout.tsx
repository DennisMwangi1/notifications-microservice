"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider } from "../../lib/auth-provider";
import { clearAuth, getUser } from "../../lib/auth";
import { ErrorBoundary } from "../../lib/error-boundary";
import { StatusBadge, cx } from "../../lib/operator-console";
import { theme } from "../../lib/theme-config";

type NavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  description: string;
  icon: ReactNode;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Control Plane",
    items: [
      {
        href: "/",
        label: "Overview",
        match: "exact",
        description: "Global health, queues, and pressure hotspots",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5m0 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0H7.25M9 11.25v1.5M12 9v3.75m3-6v6"
            />
          </svg>
        ),
      },
      {
        href: "/tenants",
        label: "Tenant Governance",
        match: "prefix",
        description: "Provisioning, isolation, access, and posture",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            />
          </svg>
        ),
      },
      {
        href: "/limits",
        label: "Quotas & Limits",
        match: "prefix",
        description: "Throughput caps, template quotas, and burst controls",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 14.25 10.5 11l3 2.25 4.5-6"
            />
          </svg>
        ),
      },
      {
        href: "/audit",
        label: "Audit & Access",
        match: "prefix",
        description: "Operator interventions and tenant-admin activity",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12s4.03-9 9-9 9 4.03 9 9Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 7.5v4.5"
            />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Runtime",
    items: [
      {
        href: "/logs",
        label: "Event Logs",
        match: "prefix",
        description: "Cross-tenant delivery tracing and diagnostics",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        ),
      },
      {
        href: "/dlq",
        label: "Delivery Recovery",
        match: "prefix",
        description: "Retry queue, purge actions, and dead-letter review",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
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
  {
    label: "Configuration",
    items: [
      {
        href: "/mail",
        label: "Operational Mailer",
        match: "prefix",
        description: "Platform-owned provider and onboarding template config",
        icon: (
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 9v.906a2.25 2.25 0 01-.671 1.591l-7.5 7.5a2.25 2.25 0 01-3.182 0l-7.5-7.5A2.25 2.25 0 012.25 9V6A2.25 2.25 0 014.5 3.75h15A2.25 2.25 0 0121.75 6V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6l9 6 9-6"
            />
          </svg>
        ),
      },
    ],
  },
];

const pageLabels: { match: RegExp; label: string }[] = [
  { match: /^\/$/, label: "Platform Overview" },
  { match: /^\/tenants/, label: "Tenant Governance" },
  { match: /^\/limits/, label: "Quota Controls" },
  { match: /^\/logs/, label: "Event Logs" },
  { match: /^\/dlq/, label: "Delivery Recovery" },
  { match: /^\/audit/, label: "Audit & Access" },
  { match: /^\/mail/, label: "Operational Mailer" },
  { match: /^\/providers/, label: "Provider Policy" },
  { match: /^\/templates/, label: "Template Policy" },
  { match: /^\/routing/, label: "Routing Policy" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const environment =
    process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "development";
  const activeLabel =
    pageLabels.find((entry) => entry.match.test(pathname))?.label ||
    "Operator Console";

  const isActiveItem = (href: string, match: "exact" | "prefix") =>
    match === "exact"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const handleLogout = () => {
    clearAuth();
    router.replace("/login");
  };

  return (
    <AuthProvider>
      <div className="h-[100dvh] overflow-hidden bg-slate-100 text-slate-900">
        <div className="grid h-full min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-slate-800 bg-slate-950 text-slate-300 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
            <div className="border-b border-slate-800 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-950/40">
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
                            "group block rounded-xl border px-3 py-3 transition",
                            isActive
                              ? "border-indigo-500/60 bg-indigo-600 text-white shadow-lg shadow-indigo-950/20"
                              : "border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={cx(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center",
                                isActive
                                  ? "text-white"
                                  : "text-slate-500 group-hover:text-slate-300",
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
                                  "mt-1 text-xs leading-5",
                                  isActive
                                    ? "text-indigo-100"
                                    : "text-slate-500 group-hover:text-slate-400",
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
                      {user?.username?.charAt(0) || "O"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white" suppressHydrationWarning>
                      {user?.username || "Platform operator"}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Platform session
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
                  <p className="truncate text-sm font-semibold text-slate-900" suppressHydrationWarning>
                    {user?.username || "Platform operator"}
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
    </AuthProvider>
  );
}
