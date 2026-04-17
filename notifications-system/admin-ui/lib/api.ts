/**
 * Shared API configuration for the Admin UI.
 * Single source of truth — no more duplicating `process.env.NEXT_PUBLIC_API_URL` in every page.
 */

import { authHeaders, clearAuth, clearTenantAuth, tenantAuthHeaders } from "./auth";

function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const runtimeConfig = (
      window as Window & {
        __RUNTIME_CONFIG__?: { NEXT_PUBLIC_API_URL?: string };
      }
    ).__RUNTIME_CONFIG__;

    if (runtimeConfig?.NEXT_PUBLIC_API_URL) {
      return runtimeConfig.NEXT_PUBLIC_API_URL;
    }
  }

  return (
    process.env.NEXT_PUBLIC_API_URL ||
    //TODO: Remove hardcoded fallback once we have a better local dev story (e.g. docker-compose with Traefik)
    "http://localhost:4000"
  );
}

export const API_URL = getApiUrl();

/**
 * Type-safe fetch wrapper with standard error handling and automatic auth.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{
  success: boolean;
  data?: T;
  message?: string;
  pagination?: unknown;
}> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  // Handle 401 — redirect to login
  if (res.status === 401) {
    clearAuth();
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/login")
    ) {
      window.location.href = "/login";
    }
    return { success: false, message: "Authentication required" };
  }

  return res.json();
}

export async function tenantApiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{
  success: boolean;
  data?: T;
  message?: string;
  pagination?: unknown;
}> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...tenantAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  if (res.status === 401) {
    clearTenantAuth();
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/tenant/login")
    ) {
      window.location.href = "/tenant/login";
    }
    return { success: false, message: "Authentication required" };
  }

  return res.json();
}
