/**
 * Shared API configuration for the Admin UI.
 * Single source of truth — no more duplicating `process.env.NEXT_PUBLIC_API_URL` in every page.
 */

import { authHeaders, clearAuth } from "./auth";

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
    "http://nucleus-worker-zwppxs-e0a9fe-62-238-23-27.traefik.me"
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
