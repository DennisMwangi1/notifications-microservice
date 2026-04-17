import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AuditLogsController {
  constructor(private readonly dbContext: DbContextService) {}

  @Get()
  async listAuditLogs(
    @Query('tenantId') tenantId: string | undefined,
    @Query('actorType') actorType: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('action') action: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const take = Math.min(Math.max(parseInt(limit || '25', 10), 1), 100);
    const currentPage = Math.max(parseInt(page || '1', 10), 1);
    const skip = (currentPage - 1) * take;

    const whereClause: Record<string, unknown> = {};
    if (tenantId) whereClause.tenant_id = tenantId;
    if (actorType) whereClause.actor_type = actorType;
    if (resourceType?.trim()) whereClause.resource_type = resourceType.trim();
    if (action?.trim()) {
      whereClause.action = {
        contains: action.trim(),
        mode: 'insensitive',
      };
    }
    if (from || to) {
      whereClause.created_at = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [logs, total] = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) =>
        Promise.all([
          tx.audit_logs.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' },
            skip,
            take,
          }),
          tx.audit_logs.count({ where: whereClause }),
        ]),
    );

    return {
      success: true,
      data: logs,
      pagination: {
        total,
        page: currentPage,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }
}
