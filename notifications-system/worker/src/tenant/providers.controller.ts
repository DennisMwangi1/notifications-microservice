import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateProviderConfigDto,
  UpdateProviderConfigDto,
} from '../common/dto/admin.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';
import { ProviderCryptoService } from '../common/provider-crypto.service';
import { AuditLogService } from '../common/audit-log.service';

@Controller('api/v1/tenant/providers')
@UseGuards(TenantAuthGuard)
export class TenantProvidersController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly providerCrypto: ProviderCryptoService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() body: CreateProviderConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const provider = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const created = await tx.provider_configs.create({
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
          action: 'tenant.provider_config.created',
          resourceType: 'provider_config',
          resourceId: created.id,
          tenantId: tenantId,
          afterState: {
            id: created.id,
            name: created.name,
            provider: created.provider,
            api_key_last4: created.api_key_last4,
          },
        });

        return created;
      },
    );

    return { success: true, data: provider };
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const tenantId = req.actorContext.tenantId!;
    const providers = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.provider_configs.findMany({
          where: { tenant_id: tenantId },
          select: {
            id: true,
            tenant_id: true,
            name: true,
            provider: true,
            api_key_last4: true,
            key_version: true,
            sender_email: true,
            sender_name: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        }),
    );

    return { success: true, data: providers };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProviderConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const provider = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.provider_configs.findFirst({
          where: { id, tenant_id: tenantId },
        });

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
          action: 'tenant.provider_config.updated',
          resourceType: 'provider_config',
          resourceId: updated.id,
          tenantId: tenantId,
          beforeState: existing as unknown as Record<string, unknown>,
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

    return { success: true, data: provider };
  }
}
