import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/logs')
@UseGuards(AdminAuthGuard)
export class LogsController {
  constructor(private readonly dbContext: DbContextService) {}

  @Get()
  async getLogs(
    @Query('channel') channel: string | undefined,
    @Query('status') status: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const take = Math.min(parseInt(limit || '50', 10), 100);
    const skip = (Math.max(parseInt(page || '1', 10), 1) - 1) * take;

    const whereClause: Record<string, unknown> = {};
    if (channel) whereClause.channel = channel;
    if (status) whereClause.status = status;
    if (tenantId) whereClause.tenant_id = tenantId;

    const [logs, total] = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) =>
        Promise.all([
          tx.notification_logs.findMany({
            where: whereClause,
            orderBy: { sent_at: 'desc' },
            take,
            skip,
          }),
          tx.notification_logs.count({ where: whereClause }),
        ]),
    );

    return {
      success: true,
      data: logs,
      pagination: {
        total,
        page: Math.max(parseInt(page || '1', 10), 1),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }
}
