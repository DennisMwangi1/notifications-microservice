import { Controller, Get, Post, Delete, Param, Query, Inject, UseGuards } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AppLoggerService } from '../common/app-logger.service';
import prisma from '../config/prisma.config';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Controller('api/v1/admin/dlq')
@UseGuards(AdminAuthGuard)
export class DlqController {
    constructor(
        @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
        private readonly logger: AppLoggerService,
    ) { }

    /**
     * List all failed notifications with optional filters and pagination.
     */
    @Get()
    async listFailedNotifications(
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('tenantId') tenantId?: string,
        @Query('channel') channel?: string,
        @Query('permanentlyFailed') permanentlyFailed?: string,
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

        const [items, total] = await Promise.all([
            prisma.failed_notifications.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.failed_notifications.count({ where }),
        ]);

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
    async getFailedNotification(@Param('id') id: string) {
        const item = await prisma.failed_notifications.findUnique({
            where: { id },
        });

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
    async retryNotification(@Param('id') id: string) {
        const item = await prisma.failed_notifications.findUnique({
            where: { id },
        });

        if (!item) {
            return { success: false, message: 'DLQ entry not found' };
        }

        // Re-publish the original payload to notification.dispatch
        this.kafkaClient.emit('notification.dispatch', item.payload);

        // Update the notification_logs status back to RETRYING
        await prisma.notification_logs.updateMany({
            where: { notification_id: item.notification_id },
            data: { status: 'RETRYING', error_details: null },
        });

        // Mark the DLQ entry as no longer permanently failed (it's being retried)
        await prisma.failed_notifications.update({
            where: { id },
            data: {
                permanently_failed: false,
                retry_count: { increment: 1 },
            },
        });

        this.logger.log(`🔄 DLQ: Manual retry triggered for notification ${item.notification_id}`);

        return {
            success: true,
            message: `Notification ${item.notification_id} re-queued for dispatch`,
        };
    }

    /**
     * Retry all non-permanently-failed DLQ entries.
     */
    @Post('retry-all')
    async retryAll() {
        const items = await prisma.failed_notifications.findMany({
            where: { permanently_failed: true },
            take: 100, // Process in batches to avoid overwhelming the system
        });

        let retried = 0;
        for (const item of items) {
            this.kafkaClient.emit('notification.dispatch', item.payload);

            await prisma.failed_notifications.update({
                where: { id: item.id },
                data: {
                    permanently_failed: false,
                    retry_count: { increment: 1 },
                },
            });
            retried++;
        }

        this.logger.log(`🔄 DLQ: Bulk retry triggered for ${retried} notifications`);

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
    async purgeNotification(@Param('id') id: string) {
        try {
            await prisma.failed_notifications.delete({
                where: { id },
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
    async getDlqStats() {
        const [total, permanentlyFailed, pending] = await Promise.all([
            prisma.failed_notifications.count(),
            prisma.failed_notifications.count({ where: { permanently_failed: true } }),
            prisma.failed_notifications.count({ where: { permanently_failed: false } }),
        ]);

        return {
            success: true,
            data: {
                total,
                permanentlyFailed,
                pendingRetry: pending,
            },
        };
    }
}
