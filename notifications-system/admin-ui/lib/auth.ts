/**
 * Admin Authentication library for the Admin UI.
 * Manages JWT tokens in localStorage and provides auth helpers.
 */

const TOKEN_KEY = 'nucleus_admin_token';
const USER_KEY = 'nucleus_admin_user';

export interface AdminUser {
    username: string;
    role: string;
}

export interface LoginResponse {
    success: boolean;
    data?: {
        token: string;
        expiresIn: string;
        user: AdminUser;
    };
    message?: string;
}

/**
 * Get the stored JWT token
 */
export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get the stored admin user info
 */
export function getUser(): AdminUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Store authentication data after successful login
 */
export function setAuth(token: string, user: AdminUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear all authentication data (logout)
 */
export function clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

/**
 * Check if the user is currently authenticated
 */
export function isAuthenticated(): boolean {
    const token = getToken();
    if (!token) return false;

    // Check JWT expiry (decode without verification — server validates)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
    } catch {
        return false;
    }
}

/**
 * Create auth headers for API requests
 */
export function authHeaders(): Record<string, string> {
    const token = getToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}
