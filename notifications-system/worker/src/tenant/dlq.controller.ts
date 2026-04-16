import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';
import { AuthenticatedRequest } from '../common/actor-context';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

@Controller('api/v1/tenant/dlq')
@UseGuards(TenantAuthGuard)
export class TenantDlqController {
  constructor(
    @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('channel') channel: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const tenantId = req.actorContext.tenantId!;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };
    if (channel) where.channel = channel;

    const [items, total] = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        Promise.all([
          tx.failed_notifications.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip,
            take: limitNum,
          }),
          tx.failed_notifications.count({ where }),
        ]),
    );

    return { success: true, data: items, pagination: { total, page: pageNum, limit: limitNum } };
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const tenantId = req.actorContext.tenantId!;
    const item = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.failed_notifications.findFirst({
          where: { id, tenant_id: tenantId },
        }),
    );

    if (!item) {
      return { success: false, message: 'DLQ entry not found' };
    }

    this.kafkaClient.emit('notification.dispatch', item.payload);

    await this.dbContext.withActorContext(req.actorContext, async (tx) => {
      await tx.notification_logs.updateMany({
        where: { notification_id: item.notification_id },
        data: { status: 'RETRYING', error_details: null },
      });

      await tx.failed_notifications.update({
        where: { id },
        data: {
          permanently_failed: false,
          retry_count: { increment: 1 },
        },
      });

      await this.auditLog.record(tx, req.actorContext, {
        action: 'tenant.dlq.retry_requested',
        resourceType: 'failed_notification',
        resourceId: item.id,
        tenantId: tenantId,
      });
    });

    return { success: true, message: `Notification ${item.notification_id} re-queued for dispatch` };
  }
}
