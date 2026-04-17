import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Inject,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AppLoggerService } from '../common/app-logger.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';
import { AuthenticatedRequest } from '../common/actor-context';
import { AdminActionReasonDto } from '../common/dto/admin.dto';

@Controller('api/v1/admin/dlq')
@UseGuards(AdminAuthGuard)
export class DlqController {
  constructor(
    @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly logger: AppLoggerService,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * List all failed notifications with optional filters and pagination.
   */
  @Get()
  async listFailedNotifications(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('tenantId') tenantId: string | undefined,
    @Query('channel') channel: string | undefined,
    @Query('permanentlyFailed') permanentlyFailed: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenant_id = tenantId;
    if (channel) where.channel = channel;
    if (permanentlyFailed !== undefined) {
      where.permanently_failed = permanentlyFailed === 'true';
    }
    if (from || to) {
      where.created_at = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await this.dbContext.withActorContext(
      req.actorContext,
      async (tx) =>
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

    return {
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get a single failed notification by ID with full payload details.
   */
  @Get(':id')
  async getFailedNotification(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const item = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.failed_notifications.findUnique({
          where: { id },
        }),
    );

    if (!item) {
      return { success: false, message: 'DLQ entry not found' };
    }

    return { success: true, data: item };
  }

  /**
   * Manually retry a failed notification by re-publishing its original payload
   * to the notification.dispatch topic.
   */
  @Post(':id/retry')
  async retryNotification(
    @Param('id') id: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
    const item = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.failed_notifications.findUnique({
          where: { id },
        }),
    );

    if (!item) {
      return { success: false, message: 'DLQ entry not found' };
    }

    // Re-publish the original payload to notification.dispatch
    this.kafkaClient.emit('notification.dispatch', item.payload);

    // Update the notification_logs status back to RETRYING
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
        action: 'dlq.retry_requested',
        resourceType: 'failed_notification',
        resourceId: item.id,
        tenantId: item.tenant_id,
        afterState: {
          notification_id: item.notification_id,
          retry_count: item.retry_count + 1,
          reason,
        },
      });
    });

    this.logger.log(
      `🔄 DLQ: Manual retry triggered for notification ${item.notification_id}`,
    );

    return {
      success: true,
      message: `Notification ${item.notification_id} re-queued for dispatch`,
    };
  }

  /**
   * Retry all non-permanently-failed DLQ entries.
   */
  @Post('retry-all')
  async retryAll(
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
    const items = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.failed_notifications.findMany({
          where: { permanently_failed: true },
          take: 100,
        }),
    );

    let retried = 0;
    for (const item of items) {
      this.kafkaClient.emit('notification.dispatch', item.payload);

      await this.dbContext.withActorContext(req.actorContext, async (tx) => {
        await tx.failed_notifications.update({
          where: { id: item.id },
          data: {
            permanently_failed: false,
            retry_count: { increment: 1 },
          },
        });

        await this.auditLog.record(tx, req.actorContext, {
          action: 'dlq.bulk_retry_requested',
          resourceType: 'failed_notification',
          resourceId: item.id,
          tenantId: item.tenant_id,
          afterState: {
            notification_id: item.notification_id,
            retry_count: item.retry_count + 1,
            reason,
          },
        });
      });
      retried++;
    }

    this.logger.log(
      `🔄 DLQ: Bulk retry triggered for ${retried} notifications`,
    );

    return {
      success: true,
      message: `${retried} notifications re-queued for dispatch`,
      retriedCount: retried,
    };
  }

  /**
   * Purge a single DLQ entry (permanently remove it).
   */
  @Delete(':id')
  async purgeNotification(
    @Param('id') id: string,
    @Body() body: AdminActionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const reason = this.requireReason(body?.reason);
    try {
      await this.dbContext.withActorContext(req.actorContext, async (tx) => {
        const existing = await tx.failed_notifications.findUnique({
          where: { id },
        });

        await tx.failed_notifications.delete({
          where: { id },
        });

        if (existing) {
          await this.auditLog.record(tx, req.actorContext, {
            action: 'dlq.purged',
            resourceType: 'failed_notification',
            resourceId: existing.id,
            tenantId: existing.tenant_id,
            beforeState: existing as unknown as Record<string, unknown>,
            afterState: { reason },
          });
        }
      });

      return { success: true, message: 'DLQ entry purged' };
    } catch {
      return { success: false, message: 'DLQ entry not found' };
    }
  }

  /**
   * Get DLQ summary stats for the admin dashboard.
   */
  @Get('stats/summary')
  async getDlqStats(@Req() req: AuthenticatedRequest) {
    const [total, permanentlyFailed, pending] = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        Promise.all([
          tx.failed_notifications.count(),
          tx.failed_notifications.count({
            where: { permanently_failed: true },
          }),
          tx.failed_notifications.count({
            where: { permanently_failed: false },
          }),
        ]),
    );

    return {
      success: true,
      data: {
        total,
        permanentlyFailed,
        pendingRetry: pending,
      },
    };
  }

  private requireReason(reason: string | undefined) {
    const normalized = reason?.trim();

    if (!normalized) {
      throw new BadRequestException('reason is required for operator intervention');
    }

    return normalized;
  }
}
