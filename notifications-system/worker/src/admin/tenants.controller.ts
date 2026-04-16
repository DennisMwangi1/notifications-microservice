import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppLoggerService } from '../common/app-logger.service';
import { createHash, randomBytes } from 'crypto';
import {
  CreateTenantAdminDto,
  CreateTenantDto,
  UpdateTenantDto,
} from '../common/dto/admin.dto';
import {
  cacheTenantIdentity,
  invalidateTenantIdentityCache,
} from '../common/ingress-cache';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/tenants')
@UseGuards(AdminAuthGuard)
export class TenantsController {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  async createTenant(
    @Body() body: CreateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const {
      name,
      allowed_channels,
      webhook_secret,
      provider_config_id,
      sender_email,
      sender_name,
      rate_limit_per_minute,
      daily_notification_cap,
    } = body;

    const apiKey = randomBytes(32).toString('hex');

    const tenant = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const createdTenant = await tx.tenants.create({
          data: {
            name,
            api_key: apiKey,
            webhook_secret,
            allowed_channels: allowed_channels || [],
            provider_config_id,
            sender_email,
            sender_name,
            rate_limit_per_minute,
            daily_notification_cap,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.created',
          resourceType: 'tenant',
          resourceId: createdTenant.id,
          afterState: createdTenant as unknown as Record<string, unknown>,
        });

        return createdTenant;
      },
    );

    await cacheTenantIdentity(tenant.api_key, {
      id: tenant.id,
      name: tenant.name,
      is_active: tenant.is_active,
      webhook_secret: tenant.webhook_secret,
      sender_email: tenant.sender_email,
      sender_name: tenant.sender_name,
      provider_config_id: tenant.provider_config_id,
      rate_limit_per_minute: tenant.rate_limit_per_minute,
      daily_notification_cap: tenant.daily_notification_cap,
    }).catch((error) =>
      this.logger.error('Failed to warm tenant cache after creation:', error),
    );

    return { success: true, data: tenant };
  }

  @Get()
  async getTenants(@Req() req: AuthenticatedRequest) {
    const tenants = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.tenants.findMany({
          orderBy: { created_at: 'desc' },
        }),
    );
    return { success: true, data: tenants };
  }

  @Get(':id')
  async getTenant(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const tenant = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.tenants.findUnique({
          where: { id },
        }),
    );

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return { success: true, data: tenant };
  }

  @Put(':id')
  async updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenant = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existingTenant = await tx.tenants.findUnique({
          where: { id },
        });

        if (!existingTenant) {
          throw new NotFoundException('Tenant not found');
        }

        const updatedTenant = await tx.tenants.update({
          where: { id },
          data: body,
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.updated',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: existingTenant as unknown as Record<string, unknown>,
          afterState: updatedTenant as unknown as Record<string, unknown>,
        });

        return {
          previousApiKey: existingTenant.api_key,
          tenant: updatedTenant,
        };
      },
    );

    await Promise.all([
      invalidateTenantIdentityCache(tenant.previousApiKey),
      invalidateTenantIdentityCache(tenant.tenant.api_key),
    ]).catch((error) =>
      this.logger.error(
        'Failed to invalidate tenant cache after update:',
        error,
      ),
    );

    return { success: true, data: tenant.tenant };
  }

  @Put(':id/rotate-key')
  async rotateApiKey(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const newApiKey = randomBytes(32).toString('hex');
    const tenant = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existingTenant = await tx.tenants.findUnique({
          where: { id },
        });

        if (!existingTenant) {
          throw new NotFoundException('Tenant not found');
        }

        const updatedTenant = await tx.tenants.update({
          where: { id },
          data: { api_key: newApiKey },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.api_key_rotated',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: { api_key_last4: existingTenant.api_key.slice(-4) },
          afterState: { api_key_last4: updatedTenant.api_key.slice(-4) },
        });

        return {
          previousApiKey: existingTenant.api_key,
          tenant: updatedTenant,
        };
      },
    );

    await Promise.all([
      invalidateTenantIdentityCache(tenant.previousApiKey),
      invalidateTenantIdentityCache(newApiKey),
    ]).catch((error) =>
      this.logger.error(
        'Failed to invalidate tenant cache after API key rotation:',
        error,
      ),
    );

    return {
      success: true,
      message: 'API Key rotated securely',
      data: { api_key: tenant.tenant.api_key },
    };
  }

  @Delete(':id')
  async deactivateTenant(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenant = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existingTenant = await tx.tenants.findUnique({
          where: { id },
        });

        if (!existingTenant) {
          throw new NotFoundException('Tenant not found');
        }

        const updatedTenant = await tx.tenants.update({
          where: { id },
          data: { is_active: false },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.deactivated',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: existingTenant as unknown as Record<string, unknown>,
          afterState: updatedTenant as unknown as Record<string, unknown>,
        });

        return {
          previousApiKey: existingTenant.api_key,
          tenant: updatedTenant,
        };
      },
    );

    await invalidateTenantIdentityCache(tenant.previousApiKey).catch((error) =>
      this.logger.error(
        'Failed to invalidate tenant cache after deactivation:',
        error,
      ),
    );

    return {
      success: true,
      message: 'Tenant deactivated successfully',
      data: tenant.tenant,
    };
  }

  @Post(':id/admins')
  async createTenantAdmin(
    @Param('id') tenantId: string,
    @Body() body: CreateTenantAdminDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantAdmin = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({
          where: { id: tenantId },
          select: { id: true },
        });

        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const createdAdmin = await tx.tenant_admins.create({
          data: {
            tenant_id: tenantId,
            username: body.username.trim(),
            password_hash: this.hashPassword(body.password),
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant_admin.created',
          resourceType: 'tenant_admin',
          resourceId: createdAdmin.id,
          tenantId,
          afterState: {
            id: createdAdmin.id,
            username: createdAdmin.username,
            tenant_id: createdAdmin.tenant_id,
          },
        });

        return createdAdmin;
      },
    );

    return {
      success: true,
      data: {
        id: tenantAdmin.id,
        tenant_id: tenantAdmin.tenant_id,
        username: tenantAdmin.username,
        is_active: tenantAdmin.is_active,
      },
    };
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }
}
