/**
 * Shared API configuration for the Admin UI.
 * Single source of truth — no more duplicating `process.env.NEXT_PUBLIC_API_URL` in every page.
 */

import { authHeaders, clearAuth } from "./auth";
import * as dotenv from "dotenv";
dotenv.config();
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
