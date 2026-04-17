import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppLoggerService } from '../common/app-logger.service';
import {
  AdminActionReasonDto,
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
import { TenantAdminCredentialsService } from '../common/tenant-admin-credentials.service';
import { OperationalMailerService } from '../common/operational-mailer.service';
import { RateLimiterService } from '../common/rate-limiter.service';

@Controller('api/v1/admin/tenants')
@UseGuards(AdminAuthGuard)
export class TenantsController {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
    private readonly tenantAdminCredentials: TenantAdminCredentialsService,
    private readonly operationalMailer: OperationalMailerService,
    private readonly rateLimiterService: RateLimiterService,
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
      max_template_count,
      tenantAdmin,
      sendOnboardingEmail = true,
    } = body;

    const apiKey = randomBytes(32).toString('hex');
    const temporaryPassword = tenantAdmin
      ? this.tenantAdminCredentials.generateTemporaryPassword()
      : null;

    const result = await this.dbContext.withActorContext(
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
            max_template_count,
          },
        });

        let createdTenantAdmin: {
          id: string;
          tenant_id: string;
          username: string;
          email: string;
          display_name: string | null;
          must_reset_password: boolean;
          password_set_at: Date | null;
          is_active: boolean;
          welcome_sent_at: Date | null;
          welcome_delivery_status: string | null;
          welcome_delivery_error: string | null;
        } | null = null;

        if (tenantAdmin && temporaryPassword) {
          createdTenantAdmin = await tx.tenant_admins.create({
            data: {
              tenant_id: createdTenant.id,
              username: tenantAdmin.username.trim(),
              email: tenantAdmin.email.trim().toLowerCase(),
              display_name: tenantAdmin.displayName?.trim() || null,
              password_hash:
                this.tenantAdminCredentials.hashPassword(temporaryPassword),
              must_reset_password: true,
            },
          });

          await this.auditLog.record(tx, req.actorContext, {
            action: 'tenant_admin.created',
            resourceType: 'tenant_admin',
            resourceId: createdTenantAdmin.id,
            tenantId: createdTenant.id,
            afterState: {
              id: createdTenantAdmin.id,
              username: createdTenantAdmin.username,
              email: createdTenantAdmin.email,
            },
          });
        }

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.created',
          resourceType: 'tenant',
          resourceId: createdTenant.id,
          afterState: createdTenant as unknown as Record<string, unknown>,
        });

        return {
          tenant: createdTenant,
          tenantAdmin: createdTenantAdmin,
        };
      },
    );

    await cacheTenantIdentity(result.tenant.api_key, {
      id: result.tenant.id,
      name: result.tenant.name,
      is_active: result.tenant.is_active,
      webhook_secret: result.tenant.webhook_secret,
      sender_email: result.tenant.sender_email,
      sender_name: result.tenant.sender_name,
      provider_config_id: result.tenant.provider_config_id,
      rate_limit_per_minute: result.tenant.rate_limit_per_minute,
      daily_notification_cap: result.tenant.daily_notification_cap,
    }).catch((error) =>
      this.logger.error('Failed to warm tenant cache after creation:', error),
    );

    let onboarding = {
      status: 'SKIPPED',
      sentAt: null as Date | null,
      deliveryError: null as string | null,
    };

    if (result.tenantAdmin && temporaryPassword && sendOnboardingEmail) {
      const onboardingResult = await this.sendOnboarding(
        req,
        result.tenant,
        result.tenantAdmin,
        temporaryPassword,
      );
      onboarding = {
        status: onboardingResult.status,
        sentAt: onboardingResult.sentAt ?? null,
        deliveryError: onboardingResult.deliveryError ?? null,
      };
    }

    return {
      success: true,
      data: {
        tenant: result.tenant,
        tenantAdmin: result.tenantAdmin
          ? this.serializeTenantAdmin(result.tenantAdmin)
          : null,
        initialCredentials:
          result.tenantAdmin && temporaryPassword
            ? {
                username: result.tenantAdmin.username,
                temporaryPassword,
              }
            : null,
        onboarding,
      },
    };
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

  @Get(':id/admins')
  async listTenantAdmins(
    @Param('id') tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantAdmins = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({ where: { id: tenantId } });
        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        return tx.tenant_admins.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'asc' },
        });
      },
    );

    return {
      success: true,
      data: tenantAdmins.map((tenantAdmin) => this.serializeTenantAdmin(tenantAdmin)),
    };
  }

  @Get(':id/ops')
  async getTenantOpsSummary(
    @Param('id') tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const summary = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            name: true,
            is_active: true,
            allowed_channels: true,
            sender_email: true,
            sender_name: true,
            rate_limit_per_minute: true,
            daily_notification_cap: true,
            max_template_count: true,
            created_at: true,
          },
        });

        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const [
          tenantAdmins,
          providerCount,
          latestProvider,
          distinctTemplates,
          dlqCount,
          failedLogCount,
          recentActivity,
          recentFailures,
        ] = await Promise.all([
          tx.tenant_admins.findMany({
            where: { tenant_id: tenantId },
            orderBy: { created_at: 'asc' },
            select: {
              id: true,
              username: true,
              email: true,
              must_reset_password: true,
              password_set_at: true,
              is_active: true,
              welcome_sent_at: true,
              welcome_delivery_status: true,
              welcome_delivery_error: true,
            },
          }),
          tx.provider_configs.count({
            where: { tenant_id: tenantId },
          }),
          tx.provider_configs.findFirst({
            where: { tenant_id: tenantId },
            orderBy: [{ rotated_at: 'desc' }, { created_at: 'desc' }],
            select: {
              id: true,
              name: true,
              provider: true,
              api_key_last4: true,
              key_version: true,
              rotated_at: true,
              created_at: true,
            },
          }),
          tx.templates.findMany({
            where: { tenant_id: tenantId },
            distinct: ['template_id'],
            select: {
              template_id: true,
            },
          }),
          tx.failed_notifications.count({
            where: { tenant_id: tenantId },
          }),
          tx.notification_logs.count({
            where: {
              tenant_id: tenantId,
              status: 'FAILED',
            },
          }),
          tx.notification_logs.findMany({
            where: { tenant_id: tenantId },
            orderBy: { sent_at: 'desc' },
            take: 5,
          }),
          tx.notification_logs.findMany({
            where: {
              tenant_id: tenantId,
              status: 'FAILED',
            },
            orderBy: { sent_at: 'desc' },
            take: 5,
          }),
        ]);

        return {
          tenant,
          tenantAdmins,
          providerCount,
          latestProvider,
          distinctTemplates,
          dlqCount,
          failedLogCount,
          recentActivity,
          recentFailures,
        };
      },
    );

    const usage = await this.rateLimiterService.getStats(
      summary.tenant.id,
      summary.tenant.rate_limit_per_minute,
    );

    const templateCounts = {
      totalTenantOwned: summary.distinctTemplates.length,
    };

    const onboarding = {
      totalAdmins: summary.tenantAdmins.length,
      activeAdmins: summary.tenantAdmins.filter((admin) => admin.is_active).length,
      mustResetPassword: summary.tenantAdmins.filter(
        (admin) => admin.must_reset_password,
      ).length,
      welcomeFailed: summary.tenantAdmins.filter(
        (admin) => admin.welcome_delivery_status === 'FAILED',
      ).length,
      welcomePending: summary.tenantAdmins.filter(
        (admin) =>
          !admin.welcome_delivery_status ||
          admin.welcome_delivery_status === 'SKIPPED',
      ).length,
      latestWelcomeSentAt: summary.tenantAdmins
        .map((admin) => admin.welcome_sent_at)
        .filter(Boolean)
        .sort((a, b) => b!.getTime() - a!.getTime())[0] || null,
    };

    return {
      success: true,
      data: {
        tenant: summary.tenant,
        quotas: {
          rate_limit_per_minute: summary.tenant.rate_limit_per_minute,
          daily_notification_cap: summary.tenant.daily_notification_cap,
          max_template_count: summary.tenant.max_template_count,
        },
        usage: {
          minuteCount: usage.minuteCount,
          minuteLimit: summary.tenant.rate_limit_per_minute,
          minuteUsagePct:
            summary.tenant.rate_limit_per_minute > 0
              ? Math.round(
                  (usage.minuteCount / summary.tenant.rate_limit_per_minute) * 100,
                )
              : 0,
          dailyCount: usage.dailyCount,
          dailyLimit: summary.tenant.daily_notification_cap,
          dailyUsagePct:
            summary.tenant.daily_notification_cap > 0
              ? Math.round(
                  (usage.dailyCount / summary.tenant.daily_notification_cap) * 100,
                )
              : 0,
          burstRemaining: usage.burstRemaining,
          burstCapacity: usage.burstCapacity,
          burstUsagePct:
            usage.burstCapacity > 0
              ? Math.round(
                  ((usage.burstCapacity - usage.burstRemaining) /
                    usage.burstCapacity) *
                    100,
                )
              : 0,
          templateCount: templateCounts.totalTenantOwned,
          templateLimit: summary.tenant.max_template_count,
          templateUsagePct:
            summary.tenant.max_template_count > 0
              ? Math.round(
                  (templateCounts.totalTenantOwned /
                    summary.tenant.max_template_count) *
                    100,
                )
              : 0,
        },
        onboarding,
        providers: {
          count: summary.providerCount,
          latest: summary.latestProvider,
        },
        templates: templateCounts,
        failures: {
          failedLogCount: summary.failedLogCount,
          dlqCount: summary.dlqCount,
          recentFailures: summary.recentFailures,
        },
        recentActivity: summary.recentActivity,
      },
    };
  }

  @Put(':id')
  async updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const {
      audit_reason,
      ...updateData
    } = body;
    const isQuotaUpdate =
      updateData.rate_limit_per_minute !== undefined ||
      updateData.daily_notification_cap !== undefined ||
      updateData.max_template_count !== undefined;

    if (isQuotaUpdate && !audit_reason?.trim()) {
      throw new BadRequestException(
        'audit_reason is required when changing tenant limits or quotas',
      );
    }

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
          data: updateData,
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.updated',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: existingTenant as unknown as Record<string, unknown>,
          afterState: {
            ...(updatedTenant as unknown as Record<string, unknown>),
            audit_reason: audit_reason?.trim() || null,
          },
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
  async rotateApiKey(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
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

  @Post(':id/suspend')
  async suspendTenant(
    @Param('id') id: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
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
          action: 'tenant.suspended',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: existingTenant as unknown as Record<string, unknown>,
          afterState: {
            ...(updatedTenant as unknown as Record<string, unknown>),
            reason,
          },
        });

        return {
          previousApiKey: existingTenant.api_key,
          tenant: updatedTenant,
        };
      },
    );

    await invalidateTenantIdentityCache(tenant.previousApiKey).catch((error) =>
      this.logger.error('Failed to invalidate tenant cache after suspension:', error),
    );

    return {
      success: true,
      message: 'Tenant suspended successfully',
      data: tenant.tenant,
    };
  }

  @Post(':id/reactivate')
  async reactivateTenant(
    @Param('id') id: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
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
          data: { is_active: true },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.reactivated',
          resourceType: 'tenant',
          resourceId: updatedTenant.id,
          beforeState: existingTenant as unknown as Record<string, unknown>,
          afterState: {
            ...(updatedTenant as unknown as Record<string, unknown>),
            reason,
          },
        });

        return updatedTenant;
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
      this.logger.error('Failed to warm tenant cache after reactivation:', error),
    );

    return {
      success: true,
      message: 'Tenant reactivated successfully',
      data: tenant,
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
    const temporaryPassword =
      body.password || this.tenantAdminCredentials.generateTemporaryPassword();

    const tenantAdmin = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, allowed_channels: true },
        });

        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const createdAdmin = await tx.tenant_admins.create({
          data: {
            tenant_id: tenantId,
            username: body.username.trim(),
            email: body.email.trim().toLowerCase(),
            display_name: body.display_name?.trim() || null,
            password_hash:
              this.tenantAdminCredentials.hashPassword(temporaryPassword),
            must_reset_password: true,
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
            email: createdAdmin.email,
            tenant_id: createdAdmin.tenant_id,
          },
        });

        return {
          tenant,
          admin: createdAdmin,
        };
      },
    );

    const onboarding = await this.sendOnboarding(
      req,
      tenantAdmin.tenant,
      tenantAdmin.admin,
      temporaryPassword,
    );

    return {
      success: true,
      data: {
        tenantAdmin: this.serializeTenantAdmin(tenantAdmin.admin),
        initialCredentials: {
          username: tenantAdmin.admin.username,
          temporaryPassword,
        },
        onboarding,
      },
    };
  }

  @Post(':tenantId/admins/:adminId/reset-temporary-password')
  async resetTemporaryPassword(
    @Param('tenantId') tenantId: string,
    @Param('adminId') adminId: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
    const temporaryPassword =
      this.tenantAdminCredentials.generateTemporaryPassword();

    const result = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, allowed_channels: true },
        });
        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const existing = await tx.tenant_admins.findFirst({
          where: { id: adminId, tenant_id: tenantId },
        });

        if (!existing) {
          throw new NotFoundException('Tenant admin not found');
        }

        this.assertCredentialInterventionAllowed(existing);

        const updatedAdmin = await tx.tenant_admins.update({
          where: { id: adminId },
          data: {
            password_hash:
              this.tenantAdminCredentials.hashPassword(temporaryPassword),
            must_reset_password: true,
            password_set_at: null,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant_admin.temporary_password_reset',
          resourceType: 'tenant_admin',
          resourceId: updatedAdmin.id,
          tenantId,
          afterState: { reason },
        });

        return { tenant, admin: updatedAdmin };
      },
    );

    const onboarding = await this.sendOnboarding(
      req,
      result.tenant,
      result.admin,
      temporaryPassword,
    );
    const tenantAdmin = await this.getTenantAdminForResponse(req, tenantId, adminId);

    return {
      success: true,
      data: {
        tenantAdmin: this.serializeTenantAdmin(tenantAdmin),
        initialCredentials: {
          username: tenantAdmin.username,
          temporaryPassword,
        },
        onboarding,
      },
    };
  }

  @Post(':tenantId/admins/:adminId/resend-onboarding')
  async resendOnboarding(
    @Param('tenantId') tenantId: string,
    @Param('adminId') adminId: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
    const temporaryPassword =
      this.tenantAdminCredentials.generateTemporaryPassword();
    const result = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const tenant = await tx.tenants.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, allowed_channels: true },
        });
        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const existingAdmin = await tx.tenant_admins.findFirst({
          where: { id: adminId, tenant_id: tenantId },
        });

        if (!existingAdmin) {
          throw new NotFoundException('Tenant admin not found');
        }

        this.assertCredentialInterventionAllowed(existingAdmin);

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant_admin.onboarding_resend_requested',
          resourceType: 'tenant_admin',
          resourceId: adminId,
          tenantId,
          afterState: { reason },
        });

        const updatedAdmin = await tx.tenant_admins.update({
          where: { id: adminId },
          data: {
            password_hash:
              this.tenantAdminCredentials.hashPassword(temporaryPassword),
            must_reset_password: true,
            password_set_at: null,
          },
        });

        return { tenant, admin: updatedAdmin };
      },
    );

    const onboarding = await this.sendOnboarding(
      req,
      result.tenant,
      result.admin,
      temporaryPassword,
    );
    const tenantAdmin = await this.getTenantAdminForResponse(req, tenantId, adminId);

    return {
      success: true,
      data: {
        tenantAdmin: this.serializeTenantAdmin(tenantAdmin),
        initialCredentials: {
          username: tenantAdmin.username,
          temporaryPassword,
        },
        onboarding,
      },
    };
  }

  private async sendOnboarding(
    req: AuthenticatedRequest,
    tenant: {
      id: string;
      name: string;
      allowed_channels: string[];
    },
    tenantAdmin: {
      id: string;
      tenant_id: string;
      username: string;
      email: string;
      display_name: string | null;
      must_reset_password: boolean;
      is_active: boolean;
    },
    temporaryPassword: string,
  ) {
    const onboarding = await this.operationalMailer.sendTenantAdminOnboarding({
      tenantName: tenant.name,
      tenantAdminUsername: tenantAdmin.username,
      tenantAdminEmail: tenantAdmin.email,
      tenantAdminDisplayName: tenantAdmin.display_name,
      temporaryPassword,
      platformLoginUrl:
        process.env.TENANT_ADMIN_LOGIN_URL ||
        'http://localhost:5173/tenant/login',
      supportContact:
        process.env.PLATFORM_SUPPORT_CONTACT || 'support@example.com',
      allowedChannels: tenant.allowed_channels || [],
    });

    await this.dbContext.withActorContext(req.actorContext, async (tx) => {
      const updated = await tx.tenant_admins.update({
        where: { id: tenantAdmin.id },
        data: {
          welcome_delivery_status: onboarding.status,
          welcome_delivery_error: onboarding.error || null,
          welcome_sent_at: onboarding.sentAt || null,
        },
      });

      await this.auditLog.record(tx, req.actorContext, {
        action: 'tenant_admin.onboarding_attempted',
        resourceType: 'tenant_admin',
        resourceId: tenantAdmin.id,
        tenantId: tenant.id,
        afterState: {
          welcome_delivery_status: updated.welcome_delivery_status,
          welcome_delivery_error: updated.welcome_delivery_error,
          welcome_sent_at: updated.welcome_sent_at,
        },
      });
    });

    return {
      status: onboarding.status,
      sentAt: onboarding.sentAt,
      deliveryError: onboarding.error || null,
    };
  }

  private serializeTenantAdmin(tenantAdmin: {
    id: string;
    tenant_id: string;
    username: string;
    email: string;
    display_name: string | null;
    must_reset_password: boolean;
    password_set_at: Date | null;
    is_active: boolean;
    welcome_sent_at: Date | null;
    welcome_delivery_status: string | null;
    welcome_delivery_error: string | null;
  }) {
    const credentialInterventionLocked =
      !tenantAdmin.must_reset_password || !!tenantAdmin.password_set_at;

    return {
      id: tenantAdmin.id,
      tenant_id: tenantAdmin.tenant_id,
      username: tenantAdmin.username,
      email: tenantAdmin.email,
      display_name: tenantAdmin.display_name,
      must_reset_password: tenantAdmin.must_reset_password,
      password_set_at: tenantAdmin.password_set_at,
      is_active: tenantAdmin.is_active,
      welcome_sent_at: tenantAdmin.welcome_sent_at,
      welcome_delivery_status: tenantAdmin.welcome_delivery_status,
      welcome_delivery_error: tenantAdmin.welcome_delivery_error,
      can_reset_temporary_password: !credentialInterventionLocked,
      can_resend_onboarding: !credentialInterventionLocked,
      credential_intervention_locked: credentialInterventionLocked,
      credential_intervention_reason: credentialInterventionLocked
        ? 'Credential intervention is locked after the tenant admin completes the first password reset.'
        : null,
    };
  }

  private requireReason(reason: string | undefined) {
    const normalized = reason?.trim();

    if (!normalized) {
      throw new BadRequestException('reason is required for operator intervention');
    }

    return normalized;
  }

  private assertCredentialInterventionAllowed(tenantAdmin: {
    must_reset_password: boolean;
    password_set_at: Date | null;
  }) {
    if (!tenantAdmin.must_reset_password || tenantAdmin.password_set_at) {
      throw new BadRequestException(
        'Credential intervention is locked after the tenant admin completes the first password reset.',
      );
    }
  }

  private async getTenantAdminForResponse(
    req: AuthenticatedRequest,
    tenantId: string,
    adminId: string,
  ) {
    const tenantAdmin = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.tenant_admins.findFirst({
          where: {
            id: adminId,
            tenant_id: tenantId,
          },
        }),
    );

    if (!tenantAdmin) {
      throw new NotFoundException('Tenant admin not found');
    }

    return tenantAdmin;
  }
}
