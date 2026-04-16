/**
 * Redis cache utilities for tenant and idempotency metadata in worker ingestion flow.
 *
 * This module provides a small in-memory persistence layer to avoid repeated DB
 * queries for tenant identity and to enforce idempotent event processing.
 */
import { Logger } from '@nestjs/common';
import redis from './redis.provider';

const logger = new Logger('IngressCache');
const TENANT_CACHE_TTL_SECONDS = parseInt(
  process.env.TENANT_API_CACHE_TTL_SECONDS || '900',
  10,
);
const IDEMPOTENCY_TTL_HOURS = parseInt(
  process.env.IDEMPOTENCY_TTL_HOURS || '24',
  10,
);

/**
 * Tenant data stored in cache for quick authorization and rate-limit lookup.
 */
export interface CachedTenantIdentity {
  id: string;
  name: string;
  is_active: boolean;
  webhook_secret?: string | null;
  sender_email?: string | null;
  sender_name?: string | null;
  provider_config_id?: string | null;
  rate_limit_per_minute: number;
  daily_notification_cap: number;
}

/**
 * Idempotency entry for a tenant event. Used to coordinate processing and prevent duplicates.
 */
export interface CachedIdempotencyEntry {
  status: 'processing' | 'completed';
  payloadHash: string;
  eventType: string;
  response?: Record<string, unknown>;
  expiresAt: string;
}

/**
 * Generate Redis key for tenant API key cache.
 *
 * @param apiKey tenant API key
 * @returns redis key string
 */
export function getTenantApiKeyCacheKey(apiKey: string): string {
  return `tenant_api_key:${apiKey}`;
}

/**
 * Generate Redis key for idempotency cache entry.
 *
 * @param tenantId tenant identifier
 * @param idempotencyKey idempotency key from request
 * @returns redis key string
 */
export function getIdempotencyCacheKey(
  tenantId: string,
  idempotencyKey: string,
): string {
  return `idempotency:${tenantId}:${idempotencyKey}`;
}

/**
 * Get effective idempotency TTL in seconds (enforces at least 60 seconds).
 *
 * @returns number of seconds to keep idempotency entries in Redis
 */
export function getIdempotencyTtlSeconds(): number {
  return Math.max(60, IDEMPOTENCY_TTL_HOURS * 60 * 60);
}

/**
 * Read a cached tenant identity by API key.
 *
 * @param apiKey tenant API key
 * @returns cached tenant identity or null if not found
 */
export async function getCachedTenantIdentity(
  apiKey: string,
): Promise<CachedTenantIdentity | null> {
  return readJsonValue<CachedTenantIdentity>(getTenantApiKeyCacheKey(apiKey));
}

/**
 * Store tenant identity in Redis cache with expiration.
 *
 * @param apiKey tenant API key
 * @param tenant tenant identity object
 */
export async function cacheTenantIdentity(
  apiKey: string,
  tenant: CachedTenantIdentity,
): Promise<void> {
  await redis.set(
    getTenantApiKeyCacheKey(apiKey),
    JSON.stringify(tenant),
    'EX',
    TENANT_CACHE_TTL_SECONDS,
  );
}

/**
 * Invalidate cached tenant identity by API key.
 *
 * @param apiKey tenant API key
 */
export async function invalidateTenantIdentityCache(
  apiKey: string,
): Promise<void> {
  await redis.del(getTenantApiKeyCacheKey(apiKey));
}

/**
 * Read idempotency entry for a tenant and idempotency key.
 *
 * @param tenantId tenant identifier
 * @param idempotencyKey idempotency key from request
 * @returns idempotency entry or null
 */
export async function getCachedIdempotencyEntry(
  tenantId: string,
  idempotencyKey: string,
): Promise<CachedIdempotencyEntry | null> {
  return readJsonValue<CachedIdempotencyEntry>(
    getIdempotencyCacheKey(tenantId, idempotencyKey),
  );
}

/**
 * Attempt to reserve an idempotency slot for an event.
 *
 * @param tenantId tenant identifier
 * @param idempotencyKey idempotency key from request
 * @param payloadHash hash of event payload to detect modifications
 * @param eventType event type
 * @returns true if reservation succeeded, false if entry already exists
 */
export async function reserveIdempotencyEntry(
  tenantId: string,
  idempotencyKey: string,
  payloadHash: string,
  eventType: string,
): Promise<boolean> {
  const entry: CachedIdempotencyEntry = {
    status: 'processing',
    payloadHash,
    eventType,
    expiresAt: new Date(
      Date.now() + getIdempotencyTtlSeconds() * 1000,
    ).toISOString(),
  };

  const result = await redis.set(
    getIdempotencyCacheKey(tenantId, idempotencyKey),
    JSON.stringify(entry),
    'EX',
    getIdempotencyTtlSeconds(),
    'NX',
  );

  return result === 'OK';
}

/**
 * Mark an idempotency entry as completed and store response data.
 *
 * @param tenantId tenant identifier
 * @param idempotencyKey idempotency key from request
 * @param payloadHash hash of event payload
 * @param eventType event type
 * @param response response payload to persist for replay
 */
export async function markIdempotencyCompleted(
  tenantId: string,
  idempotencyKey: string,
  payloadHash: string,
  eventType: string,
  response: Record<string, unknown>,
): Promise<void> {
  const entry: CachedIdempotencyEntry = {
    status: 'completed',
    payloadHash,
    eventType,
    response,
    expiresAt: new Date(
      Date.now() + getIdempotencyTtlSeconds() * 1000,
    ).toISOString(),
  };

  await redis.set(
    getIdempotencyCacheKey(tenantId, idempotencyKey),
    JSON.stringify(entry),
    'EX',
    getIdempotencyTtlSeconds(),
  );
}

/**
 * Clear idempotency entry from Redis.
 *
 * @param tenantId tenant identifier
 * @param idempotencyKey idempotency key from request
 */
export async function clearIdempotencyEntry(
  tenantId: string,
  idempotencyKey: string,
): Promise<void> {
  await redis.del(getIdempotencyCacheKey(tenantId, idempotencyKey));
}

/**
 * Read a raw JSON value from Redis and parse it.
 *
 * @param key Redis key
 * @returns parsed object or null if missing/invalid
 */
async function readJsonValue<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error(`Failed to parse cached JSON for ${key}:`, error);
    await redis.del(key).catch(() => undefined);
    return null;
  }
}
