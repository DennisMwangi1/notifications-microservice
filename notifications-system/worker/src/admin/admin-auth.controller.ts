import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { AdminLoginDto } from '../common/dto/admin-auth.dto';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Admin Authentication Controller
 *
 * Provides JWT-based authentication for the Admin UI.
 * Credentials are configured via environment variables:
 *   - ADMIN_USERNAME (default: 'admin')
 *   - ADMIN_PASSWORD_HASH (SHA-256 hash of the password)
 *   - ADMIN_JWT_SECRET (required — used to sign/verify tokens)
 *
 * For development, if ADMIN_PASSWORD_HASH is not set,
 * the plain-text ADMIN_PASSWORD env var is hashed at runtime.
 */
@Controller('api/v1/admin/auth')
export class AdminAuthController {
  @Post('login')
  async login(@Body() body: AdminLoginDto) {
    const { username, password } = body;

    if (!username || !password) {
      throw new UnauthorizedException('Username and password are required');
    }

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'Authentication system is not configured. Set ADMIN_JWT_SECRET.',
      );
    }

    // Resolve expected credentials from environment
    const expectedUsername = process.env.ADMIN_USERNAME;
    const plainPassword = process.env.ADMIN_PASSWORD;
    const expectedPasswordHash =
      process.env.ADMIN_PASSWORD_HASH ||
      (plainPassword ? this.hashPassword(plainPassword) : null);

    if (!expectedUsername || !expectedPasswordHash) {
      throw new UnauthorizedException(
        'Authentication credentials are not completely configured on the server.',
      );
    }

    const incomingPasswordHash = this.hashPassword(password);

    // Constant-time comparison for username isn't critical, but password hash comparison is
    if (
      username !== expectedUsername ||
      incomingPasswordHash !== expectedPasswordHash
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Issue a JWT token
    const token = jwt.sign(
      {
        sub: username,
        role: 'platform_operator',
      },
      secret,
      { expiresIn: '8h' },
    );

    return {
      success: true,
      data: {
        token,
        expiresIn: '8h',
        user: { username, role: 'platform_operator' },
      },
    };
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      data: {
        username: req.adminUser.sub,
        role: 'platform_operator',
      },
    };
  }

  @UseGuards(AdminAuthGuard)
  @Post('refresh')
  async refreshToken(@Req() req: AuthenticatedRequest) {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'Authentication system is not configured',
      );
    }

    const token = jwt.sign(
      {
        sub: req.adminUser.sub,
        role: 'platform_operator',
      },
      secret,
      { expiresIn: '8h' },
    );

    return {
      success: true,
      data: {
        token,
        expiresIn: '8h',
      },
    };
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }
}
