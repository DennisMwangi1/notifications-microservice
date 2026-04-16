import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AdminTokenPayload } from '../dto/admin-auth.dto';

/**
 * JWT-based guard that protects all admin API routes.
 * Expects: Authorization: Bearer <token>
 *
 * The JWT is signed with ADMIN_JWT_SECRET from environment.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.ADMIN_JWT_SECRET;

    if (!secret) {
      this.logger.error('ADMIN_JWT_SECRET is not configured');
      throw new UnauthorizedException(
        'Authentication system is not configured',
      );
    }

    try {
      const payload = jwt.verify(token, secret) as AdminTokenPayload;

      if (payload.role !== 'admin') {
        throw new UnauthorizedException('Insufficient permissions');
      }

      // Attach admin info to request for downstream use
      request.adminUser = payload;
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
