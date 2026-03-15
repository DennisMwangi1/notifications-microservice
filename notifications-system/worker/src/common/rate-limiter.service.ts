import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import redis from './redis.provider';

interface TenantRateLimits {
    id: string;
    name: string;
    rate_limit_per_minute: number;
    daily_notification_cap: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    retryAfterSeconds?: number;
    reason?: string;
}

@Injectable()
export class RateLimiterService {
    /**
     * Checks both per-minute rate limit and daily notification cap for a tenant.
     * Throws HttpException(429) if either limit is exceeded.
     */
    async checkLimit(tenant: TenantRateLimits): Promise<RateLimitResult> {
        // 1. Per-minute sliding window check
        const minuteResult = await this.checkMinuteLimit(tenant);
        if (!minuteResult.allowed) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.TOO_MANY_REQUESTS,
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded for tenant ${tenant.name}. Limit: ${tenant.rate_limit_per_minute}/min`,
                    retryAfter: minuteResult.retryAfterSeconds,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        // 2. Daily cap check
        const dailyResult = await this.checkDailyCap(tenant);
        if (!dailyResult.allowed) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.TOO_MANY_REQUESTS,
                    error: 'Too Many Requests',
                    message: `Daily notification cap exceeded for tenant ${tenant.name}. Cap: ${tenant.daily_notification_cap}/day`,
                    retryAfter: dailyResult.retryAfterSeconds,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return minuteResult;
    }

    /**
     * Sliding window counter for per-minute rate limiting.
     * Uses Redis INCR with a 2-minute TTL for safety margin.
     */
    private async checkMinuteLimit(tenant: TenantRateLimits): Promise<RateLimitResult> {
        const minuteBucket = Math.floor(Date.now() / 60000);
        const key = `ratelimit:${tenant.id}:${minuteBucket}`;

        const current = await redis.incr(key);

        // Set expiry on first increment (2 min TTL for safety)
        if (current === 1) {
            await redis.expire(key, 120);
        }

        const limit = tenant.rate_limit_per_minute;
        const remaining = Math.max(0, limit - current);

        if (current > limit) {
            // Calculate seconds until next minute bucket
            const currentMs = Date.now();
            const nextMinuteMs = (minuteBucket + 1) * 60000;
            const retryAfterSeconds = Math.ceil((nextMinuteMs - currentMs) / 1000);

            return {
                allowed: false,
                remaining: 0,
                limit,
                retryAfterSeconds,
                reason: 'per_minute_limit_exceeded',
            };
        }

        return { allowed: true, remaining, limit };
    }

    /**
     * Daily notification cap using Redis counter with midnight expiry.
     */
    private async checkDailyCap(tenant: TenantRateLimits): Promise<RateLimitResult> {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const key = `dailycap:${tenant.id}:${today}`;

        const current = await redis.incr(key);

        // Set expiry on first increment — expire at end of day (max 86400s)
        if (current === 1) {
            await redis.expire(key, 86400);
        }

        const limit = tenant.daily_notification_cap;
        const remaining = Math.max(0, limit - current);

        if (current > limit) {
            return {
                allowed: false,
                remaining: 0,
                limit,
                retryAfterSeconds: 3600, // Suggest retry in 1 hour
                reason: 'daily_cap_exceeded',
            };
        }

        return { allowed: true, remaining, limit };
    }

    /**
     * Get current rate limit stats for a tenant (used by Admin Dashboard).
     */
    async getStats(tenantId: string): Promise<{ minuteCount: number; dailyCount: number }> {
        const minuteBucket = Math.floor(Date.now() / 60000);
        const today = new Date().toISOString().split('T')[0];

        const minuteKey = `ratelimit:${tenantId}:${minuteBucket}`;
        const dailyKey = `dailycap:${tenantId}:${today}`;

        const [minuteCount, dailyCount] = await Promise.all([
            redis.get(minuteKey),
            redis.get(dailyKey),
        ]);

        return {
            minuteCount: parseInt(minuteCount || '0', 10),
            dailyCount: parseInt(dailyCount || '0', 10),
        };
    }
}
