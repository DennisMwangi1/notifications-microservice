/**
 * Shared API configuration for the Admin UI.
 * Single source of truth — no more duplicating `process.env.NEXT_PUBLIC_API_URL` in every page.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Type-safe fetch wrapper with standard error handling.
 */
export async function apiFetch<T = unknown>(
    path: string,
    options?: RequestInit
): Promise<{ success: boolean; data?: T; message?: string; pagination?: unknown }> {
    const res = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    return res.json();
}
