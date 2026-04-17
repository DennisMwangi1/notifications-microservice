import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import mjml2html from 'mjml';
import * as handlebars from 'handlebars';
import { randomUUID } from 'crypto';
import { CreateTemplateDto } from '../common/dto/admin.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { TemplatePreviewDto } from '../common/dto/admin-auth.dto';
import { analyzeTemplateVariables, isJsonObject } from '../admin/template-analysis';

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

    const template = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const existing = await tx.templates.findFirst({
          where: {
            tenant_id: tenantId,
            event_type: body.event_type,
            channel_type: body.channel_type,
          },
          orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
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
            scope: 'TENANT_CUSTOM',
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

  @Post('preview')
  async previewTemplate(@Body() body: TemplatePreviewDto) {
    const { content_body, channel_type, subject_line, sample_data } = body;

    if (!content_body?.trim()) {
      throw new BadRequestException('content_body is required');
    }

    if (sample_data !== undefined && !isJsonObject(sample_data)) {
      throw new BadRequestException('sample_data must be a JSON object');
    }

    const context = sample_data ?? this.getDefaultSampleData();
    const analysis = analyzeTemplateVariables(
      content_body,
      context,
      subject_line,
    );

    try {
      let renderedBody: string;
      let renderedSubject: string | null = null;
      const warnings: string[] = [...analysis.syntaxErrors];

      if (subject_line) {
        const subjectTemplate = handlebars.compile(subject_line);
        renderedSubject = subjectTemplate(context);
      }

      if (channel_type === 'EMAIL') {
        const hbTemplate = handlebars.compile(content_body);
        const interpolatedMjml = hbTemplate(context);
        const { html, errors } = mjml2html(interpolatedMjml, {
          validationLevel: 'soft',
        });

        if (errors?.length) {
          for (const err of errors) {
            warnings.push(`${err.tagName}: ${err.message}`);
          }
        }

        renderedBody = html;
      } else {
        const hbTemplate = handlebars.compile(content_body, { noEscape: true });
        renderedBody = hbTemplate(context);
      }

      return {
        success: true,
        data: {
          html: renderedBody,
          subject: renderedSubject,
          channel_type,
          warnings,
          available_variables: analysis.availableVariables,
          referenced_variables: analysis.referencedVariables,
          missing_variables: analysis.missingVariables,
          unused_variables: analysis.unusedVariables,
          sampleDataUsed: context,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Template rendering failed: ${message}`,
        data: {
          html: null,
          subject: null,
          channel_type,
          warnings: [...analysis.syntaxErrors, message],
          available_variables: analysis.availableVariables,
          referenced_variables: analysis.referencedVariables,
          missing_variables: analysis.missingVariables,
          unused_variables: analysis.unusedVariables,
          sampleDataUsed: context,
        },
      };
    }
  }

  @Get()
  async listTemplates(@Req() req: AuthenticatedRequest) {
    const tenantId = req.actorContext.tenantId!;
    const templates = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.templates.findMany({
          where: {
            tenant_id: tenantId,
          },
          orderBy: [
            { event_type: 'asc' },
            { channel_type: 'asc' },
            { version: 'desc' },
            { created_at: 'desc' },
          ],
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

  private getDefaultSampleData(): Record<string, unknown> {
    return {
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      userId: 'usr_abc123',
      orderId: 'ORD-2025-0042',
      amount: '$149.99',
      company: 'Acme Corp',
      action_url: 'https://example.com/verify',
      timestamp: new Date().toISOString(),
      support_email: 'support@example.com',
    };
  }
}
