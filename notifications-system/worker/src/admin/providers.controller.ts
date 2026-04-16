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
import {
  CreateProviderConfigDto,
  UpdateProviderConfigDto,
} from '../common/dto/admin.dto';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { ProviderCryptoService } from '../common/provider-crypto.service';
import { AuditLogService } from '../common/audit-log.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/providers')
@UseGuards(AdminAuthGuard)
export class ProvidersController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly providerCrypto: ProviderCryptoService,
    private readonly auditLog: AuditLogService,
  ) {}

  // 1. Create a brand new provider configuration
  @Post()
  async createProvider(
    @Body() body: CreateProviderConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body.tenant_id) {
      throw new NotFoundException('tenant_id is required');
    }
    const tenantId = body.tenant_id;

    const providerConfig = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const createdProvider = await tx.provider_configs.create({
          data: {
            tenant_id: tenantId,
            name: body.name,
            provider: body.provider,
            api_key_ciphertext: this.providerCrypto.encrypt(body.api_key),
            api_key_last4: this.providerCrypto.maskSecret(body.api_key),
            sender_email: body.sender_email,
            sender_name: body.sender_name,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'provider_config.created',
          resourceType: 'provider_config',
          resourceId: createdProvider.id,
          tenantId: createdProvider.tenant_id,
          afterState: {
            id: createdProvider.id,
            name: createdProvider.name,
            provider: createdProvider.provider,
            tenant_id: createdProvider.tenant_id,
            api_key_last4: createdProvider.api_key_last4,
          },
        });

        return createdProvider;
      },
    );

    return { success: true, data: providerConfig };
  }

  // 2. Fetch all provider configurations
  @Get()
  async getProviders(@Req() req: AuthenticatedRequest) {
    // Exclude the raw api_key from the list view for security
    const providers = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.provider_configs.findMany({
          select: {
            id: true,
            tenant_id: true,
            name: true,
            provider: true,
            api_key_last4: true,
            sender_email: true,
            sender_name: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        }),
    );
    return { success: true, data: providers };
  }

  // 3. Fetch specific provider details
  @Get(':id')
  async getProvider(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const providerConfig = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.provider_configs.findUnique({
          where: { id },
        }),
    );

    if (!providerConfig) {
      throw new NotFoundException('Provider configuration not found');
    }

    return {
      success: true,
      data: {
        id: providerConfig.id,
        tenant_id: providerConfig.tenant_id,
        name: providerConfig.name,
        provider: providerConfig.provider,
        api_key_last4: providerConfig.api_key_last4,
        key_version: providerConfig.key_version,
        rotated_at: providerConfig.rotated_at,
        sender_email: providerConfig.sender_email,
        sender_name: providerConfig.sender_name,
        created_at: providerConfig.created_at,
      },
    };
  }

  // 4. Update provider configuration
  @Put(':id')
  async updateProvider(
    @Param('id') id: string,
    @Body() body: UpdateProviderConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const providerConfig = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.provider_configs.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new NotFoundException('Provider configuration not found');
        }

        const updated = await tx.provider_configs.update({
          where: { id },
          data: {
            name: body.name,
            provider: body.provider,
            sender_email: body.sender_email,
            sender_name: body.sender_name,
            ...(body.api_key
              ? {
                  api_key_ciphertext: this.providerCrypto.encrypt(body.api_key),
                  api_key_last4: this.providerCrypto.maskSecret(body.api_key),
                  key_version: { increment: 1 },
                  rotated_at: new Date(),
                }
              : {}),
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'provider_config.updated',
          resourceType: 'provider_config',
          resourceId: updated.id,
          tenantId: updated.tenant_id,
          beforeState: {
            id: existing.id,
            name: existing.name,
            provider: existing.provider,
            api_key_last4: existing.api_key_last4,
          },
          afterState: {
            id: updated.id,
            name: updated.name,
            provider: updated.provider,
            api_key_last4: updated.api_key_last4,
            key_version: updated.key_version,
          },
        });

        return updated;
      },
    );
    return { success: true, data: providerConfig };
  }

  // 5. Delete provider configuration
  @Delete(':id')
  async deleteProvider(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.dbContext.withActorContext(req.actorContext, async (tx) => {
      const existing = await tx.provider_configs.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('Provider configuration not found');
      }

      await tx.provider_configs.delete({
        where: { id },
      });

      await this.auditLog.record(tx, req.actorContext, {
        action: 'provider_config.deleted',
        resourceType: 'provider_config',
        resourceId: id,
        tenantId: existing.tenant_id,
        beforeState: {
          id: existing.id,
          name: existing.name,
          provider: existing.provider,
          api_key_last4: existing.api_key_last4,
        },
      });
    });

    return {
      success: true,
      message: 'Provider configuration deleted successfully',
    };
  }
}
