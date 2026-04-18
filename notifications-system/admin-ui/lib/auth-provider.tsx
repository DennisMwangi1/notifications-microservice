'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/login';
  const authenticated = isAuthenticated();
  const user = authenticated ? getUser() : null;

  useEffect(() => {
    if (!isLoginRoute && !authenticated) {
      router.replace('/login');
    }
  }, [authenticated, isLoginRoute, router]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!authenticated) {
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
    </>
  );
}

export function TenantAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/tenant/login';
  const authenticated = isTenantAuthenticated();
  const user = authenticated ? getTenantUser() : null;

  useEffect(() => {
    if (!isLoginRoute && !authenticated) {
      router.replace('/tenant/login');
      return;
    }

    if (user?.mustResetPassword && pathname !== '/tenant/account') {
      router.replace('/tenant/account?mode=reset');
    }
  }, [authenticated, isLoginRoute, pathname, router, user]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!authenticated) {
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
    </>
  );
}
