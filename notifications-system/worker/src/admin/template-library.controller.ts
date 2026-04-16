import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CreateTemplateLibraryDto } from '../common/dto/admin.dto';
import { analyzeTemplateVariables, isJsonObject } from './template-analysis';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { AuthenticatedRequest } from '../common/actor-context';

type JsonObject = Record<string, unknown>;

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]): [string, unknown] => [
        key,
        cloneJsonValue(item),
      ]),
    ) as JsonObject;
  }

  return value;
}

function pruneSampleDataToReferencedVariables(
  sampleData: JsonObject,
  referencedVariables: string[],
): JsonObject {
  const pruned: JsonObject = {};

  const readPath = (source: unknown, segments: string[]): unknown => {
    let current: unknown = source;

    for (const segment of segments) {
      if (Array.isArray(current)) {
        const index = Number(segment);

        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          return undefined;
        }

        current = current[index];
        continue;
      }

      if (isJsonObject(current)) {
        if (!(segment in current)) {
          return undefined;
        }

        current = current[segment];
        continue;
      }

      return undefined;
    }

    return current;
  };

  const writePath = (
    target: JsonObject,
    segments: string[],
    value: unknown,
  ) => {
    let current: JsonObject | unknown[] = target;

    segments.forEach((segment, index) => {
      const isLastSegment = index === segments.length - 1;
      const nextSegment = segments[index + 1];
      const nextIsArrayIndex =
        nextSegment !== undefined && /^\d+$/.test(nextSegment);

      if (Array.isArray(current)) {
        const arrayIndex = Number(segment);

        if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
          return;
        }

        if (isLastSegment) {
          current[arrayIndex] = cloneJsonValue(value);
          return;
        }

        const existing = current[arrayIndex];

        if (!(Array.isArray(existing) || isJsonObject(existing))) {
          current[arrayIndex] = nextIsArrayIndex ? [] : {};
        }

        current = current[arrayIndex] as JsonObject | unknown[];
        return;
      }

      if (isLastSegment) {
        current[segment] = cloneJsonValue(value);
        return;
      }

      const existing = current[segment];

      if (!(Array.isArray(existing) || isJsonObject(existing))) {
        current[segment] = nextIsArrayIndex ? [] : {};
      }

      current = current[segment] as JsonObject | unknown[];
    });
  };

  referencedVariables.forEach((variablePath) => {
    const segments = variablePath.split('.').filter(Boolean);

    if (segments.length === 0) {
      return;
    }

    const value = readPath(sampleData, segments);

    if (value === undefined) {
      return;
    }

    writePath(pruned, segments, value);
  });

  return pruned;
}

@Controller('api/v1/admin/template-library')
@UseGuards(AdminAuthGuard)
export class TemplateLibraryController {
  constructor(
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Post()
  async createTemplateLibraryEntry(
    @Body() body: CreateTemplateLibraryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const {
      tenant_id,
      name,
      channel_type,
      subject_line,
      content_body,
      sample_data,
    } = body;

    if (!name?.trim()) {
      throw new BadRequestException('name is required');
    }

    if (!tenant_id?.trim()) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!content_body?.trim()) {
      throw new BadRequestException('content_body is required');
    }

    if (!isJsonObject(sample_data)) {
      throw new BadRequestException('sample_data must be a JSON object');
    }

    const analysis = analyzeTemplateVariables(
      content_body,
      sample_data,
      subject_line,
    );
    const persistedSampleData =
      analysis.syntaxErrors.length > 0
        ? sample_data
        : pruneSampleDataToReferencedVariables(
            sample_data,
            analysis.referencedVariables,
          );

    const entry = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) => {
        const createdEntry = await tx.template_library.create({
          data: {
            tenant_id: tenant_id.trim(),
            name: name.trim(),
            channel_type,
            subject_line: subject_line || null,
            content_body,
            sample_data: persistedSampleData as Prisma.InputJsonValue,
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'template_library.created',
          resourceType: 'template_library',
          resourceId: createdEntry.id,
          tenantId: createdEntry.tenant_id,
          afterState: createdEntry as unknown as Record<string, unknown>,
        });

        return createdEntry;
      },
    );

    return { success: true, data: entry };
  }

  @Get()
  async getTemplateLibrary(
    @Query('channelType') channelType: 'EMAIL' | 'SMS' | 'PUSH' | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const whereClause: Record<string, unknown> = {};
    if (channelType) whereClause.channel_type = channelType;
    if (tenantId) whereClause.tenant_id = tenantId;

    const entries = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.template_library.findMany({
          where: whereClause,
          orderBy: [{ created_at: 'desc' }, { name: 'asc' }],
        }),
    );

    return { success: true, data: entries };
  }

  @Get(':id')
  async getTemplateLibraryEntry(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const entry = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.template_library.findUnique({
          where: { id },
        }),
    );

    if (!entry) {
      throw new NotFoundException('Template library entry not found');
    }

    return { success: true, data: entry };
  }
}
