import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import prisma from '../config/prisma.config';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Controller('api/v1/admin/logs')
@UseGuards(AdminAuthGuard)
export class LogsController {

    @Get()
    async getLogs(
        @Query('channel') channel?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        const take = Math.min(parseInt(limit || '50', 10), 100);
        const skip = (Math.max(parseInt(page || '1', 10), 1) - 1) * take;

        const whereClause: Record<string, unknown> = {};
        if (channel) whereClause.channel = channel;
        if (status) whereClause.status = status;

        const [logs, total] = await Promise.all([
            prisma.notification_logs.findMany({
                where: whereClause,
                orderBy: { sent_at: 'desc' },
                take,
                skip,
            }),
            prisma.notification_logs.count({ where: whereClause })
        ]);

        return {
            success: true,
            data: logs,
            pagination: {
                total,
                page: Math.max(parseInt(page || '1', 10), 1),
                limit: take,
                totalPages: Math.ceil(total / take)
            }
        };
    }
}
