import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Inject,
  Headers,
  Req,
  HttpException,
  Res,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AppLoggerService } from '../common/app-logger.service';
import prisma from '../config/prisma.config';
import {
  TriggerEventDto,
  EnrichedKafkaPayload,
} from '../common/dto/events.dto';
import { SecurityService } from '../common/security.service';
import { RateLimiterService } from '../common/rate-limiter.service';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import {
  cacheTenantIdentity,
  CachedTenantIdentity,
  clearIdempotencyEntry,
  getCachedIdempotencyEntry,
  getCachedTenantIdentity,
  markIdempotencyCompleted,
  reserveIdempotencyEntry,
} from '../common/ingress-cache';
import { DbContextService } from '../common/db-context.service';
import { AuthenticatedRequest } from '../common/actor-context';

interface IdempotencyCheckResult {
  duplicate: boolean;
  response?: Record<string, unknown>;
  reservedInRedis: boolean;
}

/**
 * Event ingestion API controller. Handles webhook trigger endpoint and any idempotency/
 * authorization/rate-limiting coordination required before emitting events to internal Kafka.
 */
@Controller('api/v1/events')
export class EventsController {
  constructor(
    @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly securityService: SecurityService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly logger: AppLoggerService,
    private readonly dbContext: DbContextService,
  ) {}

  /**
   * Webhook entrypoint for tenant events.
   *
   * Steps:
   * 1. Validate request headers and payload
   * 2. Resolve tenant metadata with cache + DB fallback
   * 3. Authenticate optional webhook signature
   * 4. Enforce rate limiting (burst, per-minute, daily)
   * 5. Enforce idempotency via Redis + Postgres fallback
   * 6. Emit enriched event to Kafka and persist idempotency record
   *
   * @param body incoming TriggerEventDto
   * @param signature x-nucleus-signature header
   * @param idempotencyHeader x-idempotency-key header
   * @param headerApiKey x-api-key header
   * @param req inbound request with rawBody for signature verification
   * @param res response object for Retry-After header injection on 429
   */
  @Post('trigger')
  async triggerEvent(
    @Body() body: TriggerEventDto,
    @Headers('x-nucleus-signature') signature: string,
    @Headers('x-idempotency-key') idempotencyHeader: string,
    @Headers('x-api-key') headerApiKey: string,
    @Req() req: Request & { rawBody: Buffer; traceId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { eventType, payload } = body;

    if (!headerApiKey || !eventType || !payload) {
      throw new UnauthorizedException(
        'Missing x-api-key header, eventType, payload. Guest notifications are not supported.',
      );
    }

    const cleanKey = headerApiKey.trim();
    const tenant = await this.resolveTenant(cleanKey);

    if (!tenant || !tenant.is_active) {
      this.logger.error(`Webhook Auth Failed. Received Key: ${cleanKey}`);
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    if (tenant.webhook_secret) {
      if (!signature) {
        throw new UnauthorizedException(
          'Missing X-Nucleus-Signature header for secured tenant',
        );
      }

      const isValid = this.securityService.verifySignature(
        req.rawBody,
        signature,
        tenant.webhook_secret,
      );
      if (!isValid) {
        this.logger.error(`Invalid Signature for Tenant: ${tenant.name}`);
        throw new UnauthorizedException('Invalid HMAC signature');
      }
      this.logger.log(`✅ Secure Signature Verified for ${tenant.name}`);
    } else if (signature) {
      this.logger.warn(
        `Warning: Signature provided but tenant ${tenant.name} has no webhook_secret configured.`,
      );
    }

    try {
      await this.rateLimiterService.checkLimit({
        id: tenant.id,
        name: tenant.name,
        rate_limit_per_minute: tenant.rate_limit_per_minute,
        daily_notification_cap: tenant.daily_notification_cap,
      });
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const responseBody = error.getResponse();
        const retryAfter =
          typeof responseBody === 'object' && responseBody !== null
            ? (responseBody as { retryAfter?: number }).retryAfter
            : undefined;

        if (retryAfter !== undefined) {
          res.setHeader('Retry-After', String(retryAfter));
        }
      }

      throw error;
    }

    const payloadHash = this.hashPayload(payload);
    const traceId =
      req.traceId ||
      req.headers['x-trace-id']?.toString() ||
      this.generateOpaqueId('trace');
    const eventId = body.eventId || this.generatePayloadHash(tenant.id, eventType, payload);
    const idempotencyKey =
      idempotencyHeader ||
      eventId;
    const idempotencyState = await this.checkIdempotency(
      tenant.id,
      idempotencyKey,
      payloadHash,
      eventType,
    );

    if (idempotencyState.duplicate) {
      this.logger.warn(
        `🔁 Duplicate event detected for tenant ${tenant.name}, key: ${idempotencyKey}`,
      );
      return (
        idempotencyState.response || {
          success: true,
          message: `Event ${eventType} already processed (duplicate)`,
          duplicate: true,
        }
      );
    }

    const enrichedPayload: EnrichedKafkaPayload = {
      ...payload,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        sender_email: tenant.sender_email,
        sender_name: tenant.sender_name,
        provider_config_id: tenant.provider_config_id,
      },
      eventType,
      eventId,
      traceId,
    };

    try {
      this.kafkaClient.emit('tenant.event.received', enrichedPayload);

      const response = {
        success: true,
        message: `Event ${eventType} dispatched securely for ${tenant.name}`,
      };

      if (idempotencyState.reservedInRedis) {
        await markIdempotencyCompleted(
          tenant.id,
          idempotencyKey,
          payloadHash,
          eventType,
          response,
        ).catch((error) =>
          this.logger.error('Failed to update Redis idempotency cache:', error),
        );
      }

      await this.storeIdempotencyRecord(
        tenant.id,
        idempotencyKey,
        eventType,
        payload,
        response,
      ).catch((error) =>
        this.logger.error('Failed to persist idempotency audit record:', error),
      );

      return response;
    } catch (error) {
      if (idempotencyState.reservedInRedis) {
        await clearIdempotencyEntry(tenant.id, idempotencyKey).catch(
          (clearError) =>
            this.logger.error(
              'Failed to clear Redis idempotency reservation:',
              clearError,
            ),
        );
      }

      this.logger.error('Failed to emit to Kafka from webhook', error);
      throw new Error('Internal messaging failure');
    }
  }

  /**
   * Resolve tenant identity from API key.
   * Tries cache first, then PostgreSQL, and warms cache on miss.
   *
   * @param apiKey tenant API key
   * @returns cached tenant metadata or null when invalid
   */
  private async resolveTenant(
    apiKey: string,
  ): Promise<CachedTenantIdentity | null> {
    try {
      const cachedTenant = await getCachedTenantIdentity(apiKey);
      if (cachedTenant) {
        return cachedTenant;
      }
    } catch (error) {
      this.logger.error(
        'Tenant cache lookup failed, falling back to PostgreSQL:',
        error,
      );
    }

    const tenant = await prisma.tenants.findFirst({
      where: { api_key: apiKey },
      select: {
        id: true,
        name: true,
        is_active: true,
        webhook_secret: true,
        sender_email: true,
        sender_name: true,
        provider_config_id: true,
        rate_limit_per_minute: true,
        daily_notification_cap: true,
      },
    });

    if (!tenant) {
      return null;
    }

    try {
      await cacheTenantIdentity(apiKey, tenant);
    } catch (error) {
      this.logger.error('Failed to warm tenant API-key cache:', error);
    }

    return tenant;
  }

  /**
   * Idempotency orchestration for event processing.
   *
   * Priority order:
   * 1. Redis cache entry (fast path)
   * 2. Reservation attempt (processing state)
   * 3. PostgreSQL audit fallback (completed state persistence)
   *
   * @param tenantId tenant ID
   * @param idempotencyKey request idempotency key
   * @param payloadHash SHA256 hash of incoming payload
   * @param eventType event type
   */
  private async checkIdempotency(
    tenantId: string,
    idempotencyKey: string,
    payloadHash: string,
    eventType: string,
  ): Promise<IdempotencyCheckResult> {
    try {
      const cached = await getCachedIdempotencyEntry(tenantId, idempotencyKey);
      if (!cached) {
        const reserved = await reserveIdempotencyEntry(
          tenantId,
          idempotencyKey,
          payloadHash,
          eventType,
        );
        if (reserved) {
          return { duplicate: false, reservedInRedis: true };
        }
      }

      const latestCached =
        cached || (await getCachedIdempotencyEntry(tenantId, idempotencyKey));
      if (latestCached) {
        return this.resolveCachedIdempotency(
          latestCached,
          tenantId,
          idempotencyKey,
          payloadHash,
          eventType,
        );
      }
    } catch (error) {
      this.logger.error(
        'Redis idempotency check failed, falling back to PostgreSQL:',
        error,
      );
    }

    const existingEvent = await this.checkPostgresIdempotency(
      tenantId,
      idempotencyKey,
    );
    if (existingEvent?.response) {
      await markIdempotencyCompleted(
        tenantId,
        idempotencyKey,
        payloadHash,
        eventType,
        existingEvent.response as Record<string, unknown>,
      ).catch(() => undefined);
    }

    return existingEvent
      ? {
          duplicate: true,
          response: (existingEvent.response as Record<string, unknown>) || {
            success: true,
            message: `Event ${eventType} already processed (duplicate)`,
            duplicate: true,
          },
          reservedInRedis: false,
        }
      : { duplicate: false, reservedInRedis: false };
  }

  /**
   * Interpret a cached idempotency record from Redis and return the workflow result.
   *
   * @param cached cached idempotency record
   * @param tenantId tenant ID
   * @param idempotencyKey idempotency key
   * @param payloadHash current payload hash
   * @param eventType event type
   */
  private async resolveCachedIdempotency(
    cached: {
      status: 'processing' | 'completed';
      payloadHash: string;
      response?: Record<string, unknown>;
    },
    tenantId: string,
    idempotencyKey: string,
    payloadHash: string,
    eventType: string,
  ): Promise<IdempotencyCheckResult> {
    if (cached.payloadHash !== payloadHash) {
      this.logger.warn(
        `Idempotency cache hash mismatch for ${tenantId}:${idempotencyKey}. Falling back to PostgreSQL audit.`,
      );

      const existingEvent = await this.checkPostgresIdempotency(
        tenantId,
        idempotencyKey,
      );
      if (existingEvent) {
        return {
          duplicate: true,
          response: (existingEvent.response as Record<string, unknown>) || {
            success: true,
            message: `Event ${eventType} already processed (duplicate)`,
            duplicate: true,
          },
          reservedInRedis: false,
        };
      }

      return {
        duplicate: true,
        response: {
          success: true,
          message: `Event ${eventType} is already being processed`,
          duplicate: true,
        },
        reservedInRedis: false,
      };
    }

    if (cached.status === 'completed') {
      return {
        duplicate: true,
        response: cached.response || {
          success: true,
          message: `Event ${eventType} already processed (duplicate)`,
          duplicate: true,
        },
        reservedInRedis: false,
      };
    }

    return {
      duplicate: true,
      response: {
        success: true,
        message: `Event ${eventType} is already being processed`,
        duplicate: true,
      },
      reservedInRedis: false,
    };
  }

  /**
   * Generate SHA256 hash for a payload object (for idempotency compare).
   *
   * @param payload event payload
   * @returns hex hash string
   */
  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Canonical idempotency signature for tenant+event+payload.
   *
   * @param tenantId tenant ID
   * @param eventType event type
   * @param payload event payload
   * @returns idempotency key hash string
   */
  private generatePayloadHash(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): string {
    const content = JSON.stringify({ tenantId, eventType, payload });
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Verify idempotency in PostgreSQL fallback chain (for entries that survived Redis or when Redis is down).
   * Also garbage-collects expired processed_events rows.
   *
   * @param tenantId tenant ID
   * @param idempotencyKey idempotency key
   */
  private async checkPostgresIdempotency(
    tenantId: string,
    idempotencyKey: string,
  ) {
    return this.dbContext.withActorContext(
      {
        actorType: 'system',
        actorId: 'events-controller',
        tenantId,
      },
      async (tx) => {
        await tx.processed_events
          .deleteMany({
            where: { expires_at: { lt: new Date() } },
          })
          .catch(() => undefined);

        return tx.processed_events.findUnique({
          where: {
            tenant_id_idempotency_key: {
              tenant_id: tenantId,
              idempotency_key: idempotencyKey,
            },
          },
        });
      },
    );
  }

  /**
   * Persist an idempotency audit record to PostgreSQL.
   * On unique constraint collision (duplicate processing race) the error is swallowed.
   *
   * @param tenantId tenant ID
   * @param idempotencyKey idempotency key
   * @param eventType event type
   * @param payload original event payload
   * @param response output response object
   */
  private async storeIdempotencyRecord(
    tenantId: string,
    idempotencyKey: string,
    eventType: string,
    payload: Record<string, unknown>,
    response: Record<string, unknown>,
  ) {
    const ttlHours = parseInt(process.env.IDEMPOTENCY_TTL_HOURS || '24', 10);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const payloadHash = this.hashPayload(payload);

    try {
      await this.dbContext.withActorContext(
        {
          actorType: 'system',
          actorId: 'events-controller',
          tenantId,
        },
        (tx) =>
          tx.processed_events.create({
            data: {
              tenant_id: tenantId,
              idempotency_key: idempotencyKey,
              event_type: eventType,
              payload_hash: payloadHash,
              response: response as object,
              expires_at: expiresAt,
            },
          }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Unique constraint')) {
        throw err;
      }
    }
  }

  private generateOpaqueId(prefix: string): string {
    return `${prefix}_${createHash('sha256')
      .update(`${prefix}:${Date.now()}:${Math.random()}`)
      .digest('hex')}`;
  }
}
