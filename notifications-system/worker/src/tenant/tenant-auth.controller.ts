import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import prisma from '../config/prisma.config';
import { TenantAdminLoginDto } from '../common/dto/admin-auth.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { TenantAdminCredentialsService } from '../common/tenant-admin-credentials.service';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

@Controller('api/v1/tenant/auth')
export class TenantAuthController {
  constructor(
    private readonly tenantAdminCredentials: TenantAdminCredentialsService,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

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
      where: { username },
      orderBy: { created_at: 'asc' },
      include: {
        tenant: {
          select: { is_active: true },
        },
      },
    });

    if (
      !tenantAdmin ||
      !tenantAdmin.is_active ||
      !this.tenantAdminCredentials.verifyPassword(
        password,
        tenantAdmin.password_hash,
      )
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!tenantAdmin.tenant?.is_active) {
      throw new UnauthorizedException(
        'Tenant access is suspended. Contact the platform owner.',
      );
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
          email: tenantAdmin.email,
          displayName: tenantAdmin.display_name,
          role: 'tenant_admin',
          tenantId: tenantAdmin.tenant_id,
          mustResetPassword: tenantAdmin.must_reset_password,
        },
      },
    };
  }

  @UseGuards(TenantAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const tenantAdmin = await prisma.tenant_admins.findUnique({
      where: { id: req.tenantAdminUser.sub },
    });

    if (!tenantAdmin) {
      throw new UnauthorizedException('Tenant admin not found');
    }

    return {
      success: true,
      data: {
        id: tenantAdmin.id,
        username: tenantAdmin.username,
        email: tenantAdmin.email,
        displayName: tenantAdmin.display_name,
        role: req.tenantAdminUser.role,
        tenantId: req.tenantAdminUser.tenantId,
        mustResetPassword: tenantAdmin.must_reset_password,
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

  @UseGuards(TenantAuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      throw new UnauthorizedException(
        'Current password and new password are required',
      );
    }

    const tenantAdmin = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.tenant_admins.findFirst({
          where: {
            id: req.tenantAdminUser.sub,
            tenant_id: req.tenantAdminUser.tenantId,
          },
        });

        if (!existing) {
          throw new UnauthorizedException('Tenant admin not found');
        }

        if (
          !this.tenantAdminCredentials.verifyPassword(
            currentPassword,
            existing.password_hash,
          )
        ) {
          throw new UnauthorizedException('Current password is invalid');
        }

        const updated = await tx.tenant_admins.update({
          where: { id: existing.id },
          data: {
            password_hash:
              this.tenantAdminCredentials.hashPassword(newPassword),
            must_reset_password: false,
            password_set_at: new Date(),
            welcome_delivery_error: null,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant_admin.password_changed',
          resourceType: 'tenant_admin',
          resourceId: updated.id,
          tenantId: updated.tenant_id,
        });

        return updated;
      },
    );

    return {
      success: true,
      data: {
        id: tenantAdmin.id,
        username: tenantAdmin.username,
        email: tenantAdmin.email,
        displayName: tenantAdmin.display_name,
        tenantId: tenantAdmin.tenant_id,
        mustResetPassword: tenantAdmin.must_reset_password,
      },
    };
  }
}
