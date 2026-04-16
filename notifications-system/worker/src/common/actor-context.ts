import { Request } from 'express';

export type ActorType = 'platform_operator' | 'tenant_admin' | 'system';

export interface ActorContext {
  actorType: ActorType;
  actorId: string;
  tenantId?: string | null;
}

export interface PlatformOperatorTokenPayload {
  sub: string;
  role: 'platform_operator' | 'admin';
  iat?: number;
  exp?: number;
}

export interface TenantAdminTokenPayload {
  sub: string;
  role: 'tenant_admin';
  tenantId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  adminUser: PlatformOperatorTokenPayload;
  tenantAdminUser: TenantAdminTokenPayload;
  actorContext: ActorContext;
  traceId?: string;
  requestId?: string;
}
