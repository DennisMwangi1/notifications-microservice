import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { RateLimiterService } from '../common/rate-limiter.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DbContextService } from '../common/db-context.service';
import { AuthenticatedRequest } from '../common/actor-context';

@Controller('api/v1/admin/stats')
@UseGuards(AdminAuthGuard)
export class StatsController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly dbContext: DbContextService,
  ) {}

  @Get()
  async getDashboardStats(@Req() req: AuthenticatedRequest) {
    const [
      totalTenants,
      activeTenants,
      totalTemplates,
      totalNotificationLogs,
      totalInAppNotifications,
      recentLogs,
      channelBreakdown,
      statusBreakdown,
      activeTenantConfigs,
      distinctTenantTemplates,
    ] = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        Promise.all([
          tx.tenants.count(),
          tx.tenants.count({ where: { is_active: true } }),
          tx.templates.count(),
          tx.notification_logs.count(),
          tx.in_app_notifications.count(),
          tx.notification_logs.findMany({
            orderBy: { sent_at: 'desc' },
            take: 20,
          }),
          tx.notification_logs.groupBy({
            by: ['channel'],
            _count: { channel: true },
          }),
          tx.notification_logs.groupBy({
            by: ['status'],
            _count: { status: true },
          }),
          tx.tenants.findMany({
            where: { is_active: true },
            select: {
              id: true,
              name: true,
              rate_limit_per_minute: true,
              daily_notification_cap: true,
              max_template_count: true,
            },
            orderBy: { created_at: 'desc' },
          }),
          tx.templates.findMany({
            where: { tenant_id: { not: null } },
            distinct: ['tenant_id', 'template_id'],
            select: { tenant_id: true, template_id: true },
          }),
        ]),
    );

    const unreadInApp = await this.dbContext.withActorContext(
      req.actorContext,
      (tx) =>
        tx.in_app_notifications.count({
          where: { status: 'UNREAD' },
        }),
    );

    const templateCountByTenant = new Map<string, number>();
    for (const item of distinctTenantTemplates) {
      if (!item.tenant_id) continue;
      templateCountByTenant.set(
        item.tenant_id,
        (templateCountByTenant.get(item.tenant_id) || 0) + 1,
      );
    }

    const tenantRateLimitStats = await Promise.all(
      activeTenantConfigs.map(async (tenant) => {
        const usage = await this.rateLimiterService.getStats(
          tenant.id,
          tenant.rate_limit_per_minute,
        );
        const templateCount = templateCountByTenant.get(tenant.id) || 0;

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          minuteCount: usage.minuteCount,
          minuteLimit: tenant.rate_limit_per_minute,
          minuteUsagePct:
            tenant.rate_limit_per_minute > 0
              ? Math.round(
                  (usage.minuteCount / tenant.rate_limit_per_minute) * 100,
                )
              : 0,
          dailyCount: usage.dailyCount,
          dailyLimit: tenant.daily_notification_cap,
          dailyUsagePct:
            tenant.daily_notification_cap > 0
              ? Math.round(
                  (usage.dailyCount / tenant.daily_notification_cap) * 100,
                )
              : 0,
          burstRemaining: usage.burstRemaining,
          burstCapacity: usage.burstCapacity,
          burstUsagePct:
            usage.burstCapacity > 0
              ? Math.round(
                  ((usage.burstCapacity - usage.burstRemaining) /
                    usage.burstCapacity) *
                    100,
                )
              : 0,
          templateCount,
          templateLimit: tenant.max_template_count,
          templateUsagePct:
            tenant.max_template_count > 0
              ? Math.round((templateCount / tenant.max_template_count) * 100)
              : 0,
        };
      }),
    );

    const watchlist = tenantRateLimitStats
      .filter(
        (tenant) =>
          tenant.minuteUsagePct >= 50 ||
          tenant.dailyUsagePct >= 50 ||
          tenant.templateUsagePct >= 70 ||
          tenant.burstUsagePct >= 50,
      )
      .sort((a, b) => {
        const aScore = Math.max(
          a.minuteUsagePct,
          a.dailyUsagePct,
          a.templateUsagePct,
          a.burstUsagePct,
        );
        const bScore = Math.max(
          b.minuteUsagePct,
          b.dailyUsagePct,
          b.templateUsagePct,
          b.burstUsagePct,
        );
        return bScore - aScore;
      })
      .slice(0, 5);

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
        rateLimits: {
          activeTenantsTracked: activeTenantConfigs.length,
          currentMinuteRequests: tenantRateLimitStats.reduce(
            (sum, tenant) => sum + tenant.minuteCount,
            0,
          ),
          currentDailyRequests: tenantRateLimitStats.reduce(
            (sum, tenant) => sum + tenant.dailyCount,
            0,
          ),
          tenantsNearingLimits: watchlist,
        },
        channelBreakdown: channelBreakdown.map((c) => ({
          channel: c.channel,
          count: c._count.channel,
        })),
        statusBreakdown: statusBreakdown.map((s) => ({
          status: s.status,
          count: s._count.status,
        })),
        recentActivity: recentLogs,
      },
    };
  }
}
