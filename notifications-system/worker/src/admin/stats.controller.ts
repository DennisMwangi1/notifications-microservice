import { Controller, Get } from '@nestjs/common';
import prisma from '../config/prisma.config';

@Controller('api/v1/admin/stats')
export class StatsController {

    @Get()
    async getDashboardStats() {
        const [
            totalTenants,
            activeTenants,
            totalTemplates,
            totalNotificationLogs,
            totalInAppNotifications,
            recentLogs,
            channelBreakdown,
            statusBreakdown
        ] = await Promise.all([
            prisma.tenants.count(),
            prisma.tenants.count({ where: { is_active: true } }),
            prisma.templates.count(),
            prisma.notification_logs.count(),
            prisma.in_app_notifications.count(),
            prisma.notification_logs.findMany({
                orderBy: { sent_at: 'desc' },
                take: 20,
            }),
            prisma.notification_logs.groupBy({
                by: ['channel'],
                _count: { channel: true }
            }),
            prisma.notification_logs.groupBy({
                by: ['status'],
                _count: { status: true }
            })
        ]);

        // Unread in-app count
        const unreadInApp = await prisma.in_app_notifications.count({ where: { status: 'UNREAD' } });

        return {
            success: true,
            data: {
                tenants: { total: totalTenants, active: activeTenants },
                templates: { total: totalTemplates },
                notifications: {
                    totalDispatched: totalNotificationLogs,
                    totalInApp: totalInAppNotifications,
                    unreadInApp: unreadInApp,
                },
                channelBreakdown: channelBreakdown.map(c => ({ channel: c.channel, count: c._count.channel })),
                statusBreakdown: statusBreakdown.map(s => ({ status: s.status, count: s._count.status })),
                recentActivity: recentLogs,
            }
        };
    }
}
