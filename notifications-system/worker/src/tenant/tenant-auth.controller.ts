import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import prisma from '../config/prisma.config';
import { TenantAdminLoginDto } from '../common/dto/admin-auth.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/tenant/auth')
export class TenantAuthController {
  @Post('login')
  async login(@Body() body: TenantAdminLoginDto) {
    const { username, password } = body;
    if (!username || !password) {
      throw new UnauthorizedException('Username and password are required');
    }

    const secret =
      process.env.TENANT_ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'Authentication system is not configured',
      );
    }

    const tenantAdmin = await prisma.tenant_admins.findFirst({
      where: { username, is_active: true },
    });

    if (
      !tenantAdmin ||
      tenantAdmin.password_hash !== this.hashPassword(password)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = jwt.sign(
      {
        sub: tenantAdmin.id,
        role: 'tenant_admin',
        tenantId: tenantAdmin.tenant_id,
      },
      secret,
      { expiresIn: '8h' },
    );

    return {
      success: true,
      data: {
        token,
        expiresIn: '8h',
        user: {
          id: tenantAdmin.id,
          username: tenantAdmin.username,
          role: 'tenant_admin',
          tenantId: tenantAdmin.tenant_id,
        },
      },
    };
  }

  @UseGuards(TenantAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      data: {
        id: req.tenantAdminUser.sub,
        role: req.tenantAdminUser.role,
        tenantId: req.tenantAdminUser.tenantId,
      },
    };
  }

  @UseGuards(TenantAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: AuthenticatedRequest) {
    const secret =
      process.env.TENANT_ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'Authentication system is not configured',
      );
    }

    const token = jwt.sign(
      {
        sub: req.tenantAdminUser.sub,
        role: 'tenant_admin',
        tenantId: req.tenantAdminUser.tenantId,
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
