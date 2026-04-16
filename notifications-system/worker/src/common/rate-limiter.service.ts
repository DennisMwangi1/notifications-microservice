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
  bucketCapacity?: number;
}

export interface TenantRateLimitStats {
  minuteCount: number;
  dailyCount: number;
  burstRemaining: number;
  burstCapacity: number;
}

@Injectable()
export class RateLimiterService {
  /**
   * Checks both per-minute rate limit and daily notification cap for a tenant.
   * Throws HttpException(429) if either limit is exceeded.
   */
  async checkLimit(tenant: TenantRateLimits): Promise<RateLimitResult> {
    // 1. Short-term burst protection
    const burstResult = await this.checkBurstLimit(tenant);
    if (!burstResult.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Burst protection triggered for tenant ${tenant.name}. Reduce request spikes and retry shortly.`,
          retryAfter: burstResult.retryAfterSeconds,
          burstCapacity: burstResult.bucketCapacity,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Per-minute sliding window check
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

    // 3. Daily cap check
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

    return {
      ...minuteResult,
      bucketCapacity: burstResult.bucketCapacity,
    };
  }

  /**
   * Token bucket burst protection to smooth sudden spikes inside the broader
   * minute-based limit. This protects the worker from short traffic floods.
   */
  private async checkBurstLimit(
    tenant: TenantRateLimits,
  ): Promise<RateLimitResult> {
    const capacity = this.getBurstCapacity(tenant.rate_limit_per_minute);
    const refillRatePerSecond = Math.max(
      tenant.rate_limit_per_minute / 60,
      0.1,
    );
    const nowMs = Date.now();
    const key = `burstlimit:${tenant.id}`;

    const result = (await redis.eval(
      `
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local refillRate = tonumber(ARGV[2])
            local nowMs = tonumber(ARGV[3])
            local requested = tonumber(ARGV[4])
            local ttl = tonumber(ARGV[5])

            local bucket = redis.call('HMGET', key, 'tokens', 'lastRefillMs')
            local tokens = tonumber(bucket[1])
            local lastRefillMs = tonumber(bucket[2])

            if tokens == nil then tokens = capacity end
            if lastRefillMs == nil then lastRefillMs = nowMs end

            local elapsedMs = math.max(0, nowMs - lastRefillMs)
            local refill = (elapsedMs / 1000) * refillRate
            tokens = math.min(capacity, tokens + refill)

            local allowed = 0
            local retryAfter = 0

            if tokens >= requested then
                tokens = tokens - requested
                allowed = 1
            else
                local deficit = requested - tokens
                retryAfter = math.ceil(deficit / refillRate)
            end

            redis.call('HMSET', key, 'tokens', tokens, 'lastRefillMs', nowMs)
            redis.call('EXPIRE', key, ttl)

            return {allowed, tokens, retryAfter}
            `,
      1,
      key,
      capacity,
      refillRatePerSecond,
      nowMs,
      1,
      120,
    )) as [number, number, number];

    const [allowed, remainingTokens, retryAfterSeconds] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, Math.floor(remainingTokens)),
      limit: tenant.rate_limit_per_minute,
      retryAfterSeconds,
      reason: allowed === 1 ? undefined : 'burst_limit_exceeded',
      bucketCapacity: capacity,
    };
  }

  /**
   * Sliding window counter for per-minute rate limiting.
   * Uses Redis INCR with a 2-minute TTL for safety margin.
   */
  private async checkMinuteLimit(
    tenant: TenantRateLimits,
  ): Promise<RateLimitResult> {
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
  private async checkDailyCap(
    tenant: TenantRateLimits,
  ): Promise<RateLimitResult> {
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
  async getStats(
    tenantId: string,
    perMinuteLimit?: number,
  ): Promise<TenantRateLimitStats> {
    const minuteBucket = Math.floor(Date.now() / 60000);
    const today = new Date().toISOString().split('T')[0];

    const minuteKey = `ratelimit:${tenantId}:${minuteBucket}`;
    const dailyKey = `dailycap:${tenantId}:${today}`;
    const burstKey = `burstlimit:${tenantId}`;

    const [minuteCount, dailyCount, burstBucket] = await Promise.all([
      redis.get(minuteKey),
      redis.get(dailyKey),
      redis.hmget(burstKey, 'tokens', 'lastRefillMs'),
    ]);

    const burstCapacity = this.getBurstCapacity(perMinuteLimit ?? 100);
    const refillRatePerSecond = Math.max((perMinuteLimit ?? 100) / 60, 0.1);
    const burstRemaining = this.computeBurstRemaining(
      burstBucket[0],
      burstBucket[1],
      burstCapacity,
      refillRatePerSecond,
    );

    return {
      minuteCount: parseInt(minuteCount || '0', 10),
      dailyCount: parseInt(dailyCount || '0', 10),
      burstRemaining,
      burstCapacity,
    };
  }

  private getBurstCapacity(rateLimitPerMinute: number): number {
    const configuredCapacity = parseInt(process.env.BURST_CAPACITY || '0', 10);
    if (configuredCapacity > 0) {
      return configuredCapacity;
    }

    return Math.max(
      10,
      Math.min(rateLimitPerMinute, Math.ceil(rateLimitPerMinute / 4)),
    );
  }

  private computeBurstRemaining(
    storedTokens: string | null,
    storedLastRefillMs: string | null,
    burstCapacity: number,
    refillRatePerSecond: number,
  ): number {
    if (!storedTokens || !storedLastRefillMs) {
      return burstCapacity;
    }

    const nowMs = Date.now();
    const lastRefillMs = parseInt(storedLastRefillMs, 10);
    const tokens = parseFloat(storedTokens);
    const elapsedSeconds = Math.max(0, nowMs - lastRefillMs) / 1000;
    const refilled = tokens + elapsedSeconds * refillRatePerSecond;

    return Math.max(0, Math.min(burstCapacity, Math.floor(refilled)));
  }
}
