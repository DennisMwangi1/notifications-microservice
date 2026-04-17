import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  AuthenticatedRequest,
  TenantAdminTokenPayload,
} from '../actor-context';
import prisma from '../../config/prisma.config';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  private readonly logger = new Logger(TenantAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.TENANT_ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET;

    if (!secret) {
      this.logger.error(
        'TENANT_ADMIN_JWT_SECRET or ADMIN_JWT_SECRET is not configured',
      );
      throw new UnauthorizedException(
        'Authentication system is not configured',
      );
    }

    try {
      const payload = jwt.verify(token, secret) as TenantAdminTokenPayload;

      if (payload.role !== 'tenant_admin' || !payload.tenantId) {
        throw new UnauthorizedException('Insufficient permissions');
      }

      const tenantAdmin = await prisma.tenant_admins.findFirst({
        where: {
          id: payload.sub,
          tenant_id: payload.tenantId,
        },
        include: {
          tenant: {
            select: { is_active: true },
          },
        },
      });

      if (!tenantAdmin || !tenantAdmin.is_active) {
        throw new UnauthorizedException(
          'Tenant admin access is no longer active',
        );
      }

      if (!tenantAdmin.tenant?.is_active) {
        throw new UnauthorizedException(
          'Tenant access is suspended. Contact the platform owner.',
        );
      }

      request.tenantAdminUser = payload;
      request.actorContext = {
        actorType: 'tenant_admin',
        actorId: payload.sub,
        tenantId: payload.tenantId,
      };
      return true;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException(
          'Session expired. Please log in again.',
        );
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid authentication token');
      }
      throw err;
    }
  }
}
