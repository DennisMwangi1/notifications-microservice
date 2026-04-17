type SessionActor = 'platform' | 'tenant';

const STORAGE_KEYS = {
  platform: {
    token: 'nucleus_platform_token',
    user: 'nucleus_platform_user',
  },
  tenant: {
    token: 'nucleus_tenant_token',
    user: 'nucleus_tenant_user',
  },
} as const;

export interface PlatformUser {
  username: string;
  role: 'platform_operator' | 'admin';
}

export interface TenantUser {
  id: string;
  username: string;
  email: string;
  displayName?: string | null;
  role: 'tenant_admin';
  tenantId: string;
  mustResetPassword: boolean;
}

export interface PlatformLoginResponse {
  success: boolean;
  data?: {
    token: string;
    expiresIn: string;
    user: PlatformUser;
  };
  message?: string;
}

export type LoginResponse = PlatformLoginResponse;

export interface TenantLoginResponse {
  success: boolean;
  data?: {
    token: string;
    expiresIn: string;
    user: TenantUser;
  };
  message?: string;
}

function getStorageKey(actor: SessionActor, key: 'token' | 'user') {
  return STORAGE_KEYS[actor][key];
}

function getStoredToken(actor: SessionActor): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(getStorageKey(actor, 'token'));
}

function getStoredUser<T>(actor: SessionActor): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(getStorageKey(actor, 'user'));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function setStoredAuth<T>(actor: SessionActor, token: string, user: T): void {
  localStorage.setItem(getStorageKey(actor, 'token'), token);
  localStorage.setItem(getStorageKey(actor, 'user'), JSON.stringify(user));
}

function clearStoredAuth(actor: SessionActor): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getStorageKey(actor, 'token'));
  localStorage.removeItem(getStorageKey(actor, 'user'));
}

function isStoredAuthenticated(actor: SessionActor): boolean {
  const token = getStoredToken(actor);
  if (!token) return false;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function authHeadersFor(actor: SessionActor): Record<string, string> {
  const token = getStoredToken(actor);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function getToken(): string | null {
  return getStoredToken('platform');
}

export function getUser(): PlatformUser | null {
  return getStoredUser<PlatformUser>('platform');
}

export function setAuth(token: string, user: PlatformUser): void {
  setStoredAuth('platform', token, user);
}

export function clearAuth(): void {
  clearStoredAuth('platform');
}

export function isAuthenticated(): boolean {
  return isStoredAuthenticated('platform');
}

export function authHeaders(): Record<string, string> {
  return authHeadersFor('platform');
}

export function getTenantToken(): string | null {
  return getStoredToken('tenant');
}

export function getTenantUser(): TenantUser | null {
  return getStoredUser<TenantUser>('tenant');
}

export function setTenantAuth(token: string, user: TenantUser): void {
  setStoredAuth('tenant', token, user);
}

export function clearTenantAuth(): void {
  clearStoredAuth('tenant');
}

export function isTenantAuthenticated(): boolean {
  return isStoredAuthenticated('tenant');
}

export function tenantAuthHeaders(): Record<string, string> {
  return authHeadersFor('tenant');
}
