import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ForbiddenException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateTemplateDto } from '../common/dto/admin.dto';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/templates')
@UseGuards(AdminAuthGuard)
export class TemplatesController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  // 1. Create a new iteration/version of a template (Content Editing)
  @Post()
  async createTemplate(
    @Body() body: CreateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const {
      tenant_id,
      event_type,
      channel_type,
      subject_line,
      content_body,
      target_ws_channel,
      scope,
    } = body;

    const effectiveScope =
      scope || (tenant_id ? 'TENANT_CUSTOM' : 'PLATFORM_DEFAULT');
    const effectiveTenantId =
      effectiveScope === 'PLATFORM_DEFAULT' ? null : tenant_id || null;

    const template = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.templates.findFirst({
          where: {
            tenant_id: effectiveTenantId,
            event_type,
            channel_type,
            scope: effectiveScope,
          },
          orderBy: { version: 'desc' },
        });

        if (effectiveTenantId && !existing) {
          const tenant = await tx.tenants.findUnique({
            where: { id: effectiveTenantId },
            select: { id: true, name: true, max_template_count: true },
          });

          if (!tenant) {
            throw new ForbiddenException('Tenant not found for template creation');
          }

          const currentTemplateCount = await tx.templates.findMany({
            where: { tenant_id: effectiveTenantId },
            distinct: ['template_id'],
            select: { template_id: true },
          });

          if (currentTemplateCount.length >= tenant.max_template_count) {
            throw new ForbiddenException(
              `Template quota exceeded for tenant ${tenant.name}. Limit: ${tenant.max_template_count}`,
            );
          }
        }

        const newVersion = existing ? existing.version + 1 : 1;
        const templateId = existing ? existing.template_id : randomUUID();

        const createdTemplate = await tx.templates.create({
          data: {
            template_id: templateId,
            version: newVersion,
            tenant_id: effectiveTenantId,
            event_type,
            channel_type,
            subject_line,
            content_body,
            target_ws_channel,
            scope: effectiveScope,
            is_active: true,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'template.created',
          resourceType: 'template',
          resourceId: createdTemplate.template_id,
          tenantId: createdTemplate.tenant_id,
          afterState: createdTemplate as unknown as Record<string, unknown>,
        });

        return createdTemplate;
      },
    );

    return { success: true, data: template };
  }

  // 2. Fetch all templates for the Content Dashboard (Optional tenant filtering)
  @Get()
  async getTemplates(
    @Query('tenantId') tenantId: string,
    @Query('scope')
    scope: 'PLATFORM_DEFAULT' | 'TENANT_OVERRIDE' | 'TENANT_CUSTOM' | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const whereClause: Record<string, unknown> = {};
    if (tenantId) whereClause.tenant_id = tenantId;
    if (scope) whereClause.scope = scope;

    const templates = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.templates.findMany({
          where: whereClause,
          orderBy: [
            { tenant_id: 'asc' },
            { event_type: 'asc' },
            { version: 'desc' },
          ],
        }),
    );

    return { success: true, data: templates };
  }

  // 3. Deactivate a bad template version (E.g. Rollback due to a broken MJML deploy)
  @Put(':template_id/version/:version/deactivate')
  async deactivateTemplate(
    @Param('template_id') templateId: string,
    @Param('version') version: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const template = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.templates.findUnique({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
        });

        const updated = await tx.templates.update({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
          data: { is_active: false },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'template.deactivated',
          resourceType: 'template',
          resourceId: templateId,
          tenantId: updated.tenant_id,
          beforeState: existing as unknown as Record<string, unknown>,
          afterState: updated as unknown as Record<string, unknown>,
        });

        return updated;
      },
    );

    return {
      success: true,
      message: 'Template version deactivated successfully',
      data: template,
    };
  }

  // 4. Reactivate a previously deactivated version (Rollback)
  @Put(':template_id/version/:version/reactivate')
  async reactivateTemplate(
    @Param('template_id') templateId: string,
    @Param('version') version: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const template = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.templates.findUnique({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
        });

        const updated = await tx.templates.update({
          where: {
            template_id_version: {
              template_id: templateId,
              version: parseInt(version, 10),
            },
          },
          data: { is_active: true },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'template.reactivated',
          resourceType: 'template',
          resourceId: templateId,
          tenantId: updated.tenant_id,
          beforeState: existing as unknown as Record<string, unknown>,
          afterState: updated as unknown as Record<string, unknown>,
        });

        return updated;
      },
    );

    return {
      success: true,
      message: 'Template version reactivated successfully',
      data: template,
    };
  }

  // 5. Fetch the entire version history for a specific template
  @Get(':template_id/versions')
  async getTemplateVersions(
    @Param('template_id') templateId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const versions = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.templates.findMany({
          where: { template_id: templateId },
          orderBy: { version: 'desc' },
        }),
    );

    return { success: true, data: versions };
  }
}
