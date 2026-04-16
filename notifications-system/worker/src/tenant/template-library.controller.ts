import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateTemplateLibraryDto } from '../common/dto/admin.dto';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { analyzeTemplateVariables, isJsonObject } from '../admin/template-analysis';

@Controller('api/v1/tenant/template-library')
@UseGuards(TenantAuthGuard)
export class TenantTemplateLibraryController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  async create(
    @Body() body: CreateTemplateLibraryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    if (!body.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!body.content_body?.trim()) {
      throw new BadRequestException('content_body is required');
    }
    if (!isJsonObject(body.sample_data)) {
      throw new BadRequestException('sample_data must be a JSON object');
    }

    const analysis = analyzeTemplateVariables(
      body.content_body,
      body.sample_data,
      body.subject_line,
    );
    const sampleData =
      analysis.syntaxErrors.length > 0
        ? body.sample_data
        : body.sample_data;

    const entry = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const created = await tx.template_library.create({
          data: {
            tenant_id: tenantId,
            name: body.name.trim(),
            channel_type: body.channel_type,
            subject_line: body.subject_line || null,
            content_body: body.content_body,
            sample_data: sampleData as Prisma.InputJsonValue,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'tenant.template_library.created',
          resourceType: 'template_library',
          resourceId: created.id,
          tenantId: tenantId,
          afterState: created as unknown as Record<string, unknown>,
        });

        return created;
      },
    );

    return { success: true, data: entry };
  }

  @Get()
  async list(
    @Query('channelType') channelType: 'EMAIL' | 'SMS' | 'PUSH' | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const entries = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.template_library.findMany({
          where: {
            tenant_id: tenantId,
            ...(channelType ? { channel_type: channelType } : {}),
          },
          orderBy: [{ created_at: 'desc' }, { name: 'asc' }],
        }),
    );

    return { success: true, data: entries };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const tenantId = req.actorContext.tenantId!;
    const entry = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.template_library.findFirst({
          where: { id, tenant_id: tenantId },
        }),
    );

    return { success: true, data: entry };
  }
}
