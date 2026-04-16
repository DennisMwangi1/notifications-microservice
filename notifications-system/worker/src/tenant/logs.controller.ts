import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';

@Controller('api/v1/tenant/logs')
@UseGuards(TenantAuthGuard)
export class TenantLogsController {
  constructor(private readonly dbContext: DbContextService) {}

  @Get()
  async list(
    @Query('channel') channel: string | undefined,
    @Query('status') status: string | undefined,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const take = Math.min(parseInt(limit, 10), 100);
    const skip = (Math.max(parseInt(page, 10), 1) - 1) * take;

    const whereClause: Record<string, unknown> = {
      tenant_id: tenantId,
    };
    if (channel) whereClause.channel = channel;
    if (status) whereClause.status = status;

    const [logs, total] = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
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

    return { success: true, data: logs, pagination: { total, page: parseInt(page, 10), limit: take } };
  }
}
