import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTemplateDto } from '../common/dto/admin.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

@Controller('api/v1/tenant/templates')
@UseGuards(TenantAuthGuard)
export class TenantTemplatesController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  async createTemplate(
    @Body() body: CreateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const scope = body.scope || 'TENANT_CUSTOM';

    const template = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.templates.findFirst({
          where: {
            tenant_id: tenantId,
            event_type: body.event_type,
            channel_type: body.channel_type,
            scope,
          },
          orderBy: { version: 'desc' },
        });

        const version = existing ? existing.version + 1 : 1;
        const templateId = existing ? existing.template_id : randomUUID();

        const created = await tx.templates.create({
          data: {
            template_id: templateId,
            version,
            tenant_id: tenantId,
            event_type: body.event_type,
            channel_type: body.channel_type,
            subject_line: body.subject_line,
            content_body: body.content_body,
            target_ws_channel: body.target_ws_channel,
            scope,
            is_active: true,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.template.created',
          resourceType: 'template',
          resourceId: created.template_id,
          tenantId,
          afterState: created as unknown as Record<string, unknown>,
        });

        return created;
      },
    );

    return { success: true, data: template };
  }

  @Get()
  async listTemplates(
    @Query('scope') scope: 'TENANT_OVERRIDE' | 'TENANT_CUSTOM' | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const templates = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.templates.findMany({
          where: {
            tenant_id: tenantId,
            ...(scope ? { scope } : {}),
          },
          orderBy: [{ event_type: 'asc' }, { version: 'desc' }],
        }),
    );

    return { success: true, data: templates };
  }

  @Get(':templateId/versions')
  async getVersions(
    @Param('templateId') templateId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const templates = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.templates.findMany({
          where: {
            template_id: templateId,
            tenant_id: tenantId,
          },
          orderBy: { version: 'desc' },
        }),
    );

    return { success: true, data: templates };
  }

  @Put(':templateId/version/:version/deactivate')
  async deactivate(
    @Param('templateId') templateId: string,
    @Param('version') version: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const updated = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const current = await tx.templates.findUnique({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
        });

        const template = await tx.templates.update({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
          data: { is_active: false },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.template.deactivated',
          resourceType: 'template',
          resourceId: templateId,
          tenantId: tenantId,
          beforeState: current as unknown as Record<string, unknown>,
          afterState: template as unknown as Record<string, unknown>,
        });

        return template;
      },
    );

    return { success: true, data: updated };
  }
}
