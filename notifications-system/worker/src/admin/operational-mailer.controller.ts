import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import {
  UpsertOperationalEmailTemplateDto,
  UpsertOperationalMailerConfigDto,
} from '../common/dto/admin.dto';
import { AuthenticatedRequest } from '../common/actor-context';
import { ProviderCryptoService } from '../common/provider-crypto.service';
import { OperationalMailerService } from '../common/operational-mailer.service';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

@Controller('api/v1/admin/operational-mailer')
@UseGuards(AdminAuthGuard)
export class OperationalMailerController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
    private readonly providerCrypto: ProviderCryptoService,
    private readonly operationalMailer: OperationalMailerService,
  ) {}

  @Get('config')
  async getConfig(@Req() req: AuthenticatedRequest) {
    const config = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.operational_mailer_configs.findFirst({
          orderBy: { created_at: 'asc' },
        }),
    );

    return {
      success: true,
      data: config
        ? {
            id: config.id,
            name: config.name,
            provider: config.provider,
            api_key_last4: config.api_key_last4,
            key_version: config.key_version,
            rotated_at: config.rotated_at,
            sender_email: config.sender_email,
            sender_name: config.sender_name,
            is_active: config.is_active,
            created_at: config.created_at,
          }
        : null,
    };
  }

  @Put('config')
  async upsertConfig(
    @Body() body: UpsertOperationalMailerConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const saved = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.operational_mailer_configs.findFirst({
          orderBy: { created_at: 'asc' },
        });

        if (!existing && !body.api_key) {
          throw new BadRequestException(
            'api_key is required when creating the operational mailer',
          );
        }

        const baseData = {
          name: body.name,
          provider: body.provider,
          sender_email: body.sender_email,
          sender_name: body.sender_name,
          is_active: body.is_active ?? true,
        };

        const savedConfig = existing
          ? await tx.operational_mailer_configs.update({
              where: { id: existing.id },
              data: {
                ...baseData,
                ...(body.api_key
                  ? {
                      api_key_ciphertext: this.providerCrypto.encrypt(body.api_key),
                      api_key_last4: this.providerCrypto.maskSecret(body.api_key),
                      key_version: { increment: 1 },
                      rotated_at: new Date(),
                    }
                  : {}),
              },
            })
          : await tx.operational_mailer_configs.create({
              data: {
                ...baseData,
                api_key_ciphertext: this.providerCrypto.encrypt(body.api_key!),
                api_key_last4: body.api_key
                  ? this.providerCrypto.maskSecret(body.api_key)
                  : null,
                key_version: 1,
                rotated_at: body.api_key ? new Date() : null,
              },
            });

        await this.auditLog.record(tx, req.actorContext, {
          action: existing
            ? 'operational_mailer.updated'
            : 'operational_mailer.created',
          resourceType: 'operational_mailer',
          resourceId: savedConfig.id,
          beforeState: existing
            ? {
                id: existing.id,
                name: existing.name,
                provider: existing.provider,
                api_key_last4: existing.api_key_last4,
              }
            : undefined,
          afterState: {
            id: savedConfig.id,
            name: savedConfig.name,
            provider: savedConfig.provider,
            api_key_last4: savedConfig.api_key_last4,
          },
        });

        return savedConfig;
      },
    );

    return {
      success: true,
      data: {
        id: saved.id,
        name: saved.name,
        provider: saved.provider,
        api_key_last4: saved.api_key_last4,
        key_version: saved.key_version,
        rotated_at: saved.rotated_at,
        sender_email: saved.sender_email,
        sender_name: saved.sender_name,
        is_active: saved.is_active,
      },
    };
  }

  @Get('template')
  async getTemplate() {
    const template = await this.operationalMailer.getTemplate();
    return { success: true, data: template };
  }

  @Put('template')
  async upsertTemplate(
    @Body() body: UpsertOperationalEmailTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const saved = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.operational_email_templates.findUnique({
          where: { template_key: 'tenant-admin-welcome' },
        });

        const savedTemplate = existing
          ? await tx.operational_email_templates.update({
              where: { id: existing.id },
              data: {
                name: body.name || existing.name,
                subject_line: body.subject_line ?? existing.subject_line,
                content_body: body.content_body,
                sample_data: (body.sample_data ||
                  (existing.sample_data as Record<string, unknown>)) as Prisma.InputJsonValue,
                is_active: body.is_active ?? existing.is_active,
              },
            })
          : await tx.operational_email_templates.create({
              data: {
                template_key: 'tenant-admin-welcome',
                name: body.name || 'Tenant Admin Welcome',
                subject_line: body.subject_line ?? 'Welcome to {{tenantName}} on Nucleus',
                content_body: body.content_body,
                sample_data: (body.sample_data ||
                  this.operationalMailer.defaultSampleData()) as Prisma.InputJsonValue,
                is_active: body.is_active ?? true,
              },
            });

        await this.auditLog.record(tx, req.actorContext, {
          action: existing
            ? 'operational_mailer.template.updated'
            : 'operational_mailer.template.created',
          resourceType: 'operational_email_template',
          resourceId: savedTemplate.id,
        });

        return savedTemplate;
      },
    );

    return { success: true, data: saved };
  }

  @Post('template/preview')
  async previewTemplate(@Body() body: UpsertOperationalEmailTemplateDto) {
    const preview = await this.operationalMailer.previewTemplate({
      content_body: body.content_body,
      subject_line: body.subject_line ?? null,
      sample_data: body.sample_data,
    });

    return {
      success: true,
      data: preview,
    };
  }
}
