'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  PlatformUser,
  TenantUser,
  clearAuth,
  clearTenantAuth,
  getTenantUser,
  getUser,
  isAuthenticated,
  isTenantAuthenticated,
} from './auth';

function SessionLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-screen bg-neutral-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
        <p className="text-sm text-neutral-400 font-medium">{label}</p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === '/login') {
      setChecking(false);
      return;
    }

    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }

    setUser(getUser());
    setChecking(false);
  }, [pathname, router]);

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (checking) {
    return <SessionLoader label="Verifying operator session..." />;
  }

  return (
    <>
      <div
        data-platform-user={user?.username}
        data-platform-role={user?.role}
        className="contents"
      >
        {children}
      </div>

      {user && (
        <div className="fixed top-4 right-6 z-40 flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-white border border-neutral-200 rounded-xl px-4 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-white uppercase">
              {user.username.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-700">
                {user.username}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">
                Platform Operator
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-2 text-neutral-400 hover:text-rose-500 transition-colors"
              title="Sign out"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function TenantAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<TenantUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === '/tenant/login') {
      setChecking(false);
      return;
    }

    if (!isTenantAuthenticated()) {
      router.replace('/tenant/login');
      return;
    }

    const tenantUser = getTenantUser();
    setUser(tenantUser);

    if (
      tenantUser?.mustResetPassword &&
      pathname !== '/tenant/account'
    ) {
      router.replace('/tenant/account?mode=reset');
      return;
    }

    setChecking(false);
  }, [pathname, router]);

  const handleLogout = () => {
    clearTenantAuth();
    router.replace('/tenant/login');
  };

  if (pathname === '/tenant/login') {
    return <>{children}</>;
  }

  if (checking) {
    return <SessionLoader label="Verifying tenant session..." />;
  }

  return (
    <>
      <div
        data-tenant-user={user?.username}
        data-tenant-role={user?.role}
        data-tenant-id={user?.tenantId}
        className="contents"
      >
        {children}
      </div>

      {user && (
        <div className="fixed top-4 right-6 z-40 flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-white border border-neutral-200 rounded-xl px-4 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-sky-700 flex items-center justify-center text-[10px] font-bold text-white uppercase">
              {user.username.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-700">
                {user.displayName || user.username}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">
                Tenant Admin
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-2 text-neutral-400 hover:text-rose-500 transition-colors"
              title="Sign out"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
