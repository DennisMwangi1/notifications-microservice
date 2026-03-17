import { Controller, Post, Body, UnauthorizedException, Inject, Headers, Req } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import prisma from '../config/prisma.config';
import { TriggerEventDto, EnrichedKafkaPayload } from '../common/dto/events.dto';
import { SecurityService } from '../common/security.service';
import { RateLimiterService } from '../common/rate-limiter.service';
import { Request } from 'express';
import { createHash } from 'crypto';

@Controller('api/v1/events')
export class EventsController {
    constructor(
        @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
        private readonly securityService: SecurityService,
        private readonly rateLimiterService: RateLimiterService,
    ) { }

    @Post('trigger')
    async triggerEvent(
        @Body() body: TriggerEventDto,
        @Headers('x-nucleus-signature') signature: string,
        @Headers('x-idempotency-key') idempotencyHeader: string,
        @Headers('x-api-key') headerApiKey: string,
        @Req() req: Request & { rawBody: Buffer }
    ) {
        const { eventType, payload } = body;
        const apiKey = headerApiKey;

        // 1. Basic validation
        if (!apiKey || !eventType || !payload) {
            throw new UnauthorizedException('Missing x-api-key header, eventType, payload. Guest notifications are not supported.');
        }

        const cleanKey = apiKey.trim();
        const tenant = await prisma.tenants.findFirst({
            where: { api_key: cleanKey }
        });

        if (!tenant || !tenant.is_active) {
            console.error(`Webhook Auth Failed. Received Key: ${cleanKey}`);
            throw new UnauthorizedException('Invalid or inactive API key');
        }

        // 2. HMAC Signature Verification (if secret is configured)
        if (tenant.webhook_secret) {
            if (!signature) {
                throw new UnauthorizedException('Missing X-Nucleus-Signature header for secured tenant');
            }

            const isValid = this.securityService.verifySignature(req.rawBody, signature, tenant.webhook_secret);
            if (!isValid) {
                console.error(`Invalid Signature for Tenant: ${tenant.name}`);
                throw new UnauthorizedException('Invalid HMAC signature');
            }
            console.log(`✅ Secure Signature Verified for ${tenant.name}`);
        } else if (signature) {
            console.warn(`Warning: Signature provided but tenant ${tenant.name} has no webhook_secret configured.`);
        }

        // 3. Rate Limiting — check per-minute and daily caps
        await this.rateLimiterService.checkLimit({
            id: tenant.id,
            name: tenant.name,
            rate_limit_per_minute: tenant.rate_limit_per_minute,
            daily_notification_cap: tenant.daily_notification_cap,
        });

        // 4. Idempotency Check — prevent duplicate event processing
        const idempotencyKey = idempotencyHeader || this.generatePayloadHash(tenant.id, eventType, payload);
        const existingEvent = await this.checkIdempotency(tenant.id, idempotencyKey);
        if (existingEvent) {
            console.log(`🔁 Duplicate event detected for tenant ${tenant.name}, key: ${idempotencyKey}`);
            return existingEvent.response || {
                success: true,
                message: `Event ${eventType} already processed (duplicate)`,
                duplicate: true,
            };
        }

        // R7: Only forward minimal tenant identity — NEVER include api_key in Kafka messages
        const enrichedPayload: EnrichedKafkaPayload = {
            ...payload,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                sender_email: tenant.sender_email,
                sender_name: tenant.sender_name,
                provider_config_id: tenant.provider_config_id
            },
            eventType: eventType
        };

        // Forward to Kafka's universal generic topic so the asynchronous stream handles rendering & delivery
        try {
            this.kafkaClient.emit('tenant.event.received', enrichedPayload);

            const response = { success: true, message: `Event ${eventType} dispatched securely for ${tenant.name}` };

            // Store idempotency record
            await this.storeIdempotencyRecord(tenant.id, idempotencyKey, eventType, payload, response);

            return response;
        } catch (error) {
            console.error('Failed to emit to Kafka from webhook', error);
            throw new Error('Internal messaging failure');
        }
    }

    /**
     * Generate a SHA256 hash of the payload as a fallback idempotency key.
     * This catches accidental retries even without explicit SDK integration.
     */
    private generatePayloadHash(tenantId: string, eventType: string, payload: Record<string, unknown>): string {
        const content = JSON.stringify({ tenantId, eventType, payload });
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Check if an event with the same idempotency key was already processed.
     * Only returns a match if the record hasn't expired.
     */
    private async checkIdempotency(tenantId: string, idempotencyKey: string) {
        // Clean up expired records periodically (best-effort)
        await prisma.processed_events.deleteMany({
            where: { expires_at: { lt: new Date() } }
        }).catch(() => { /* Non-critical cleanup */ });

        return prisma.processed_events.findUnique({
            where: {
                tenant_id_idempotency_key: {
                    tenant_id: tenantId,
                    idempotency_key: idempotencyKey,
                }
            }
        });
    }

    /**
     * Store an idempotency record with a 24-hour TTL.
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
        const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

        try {
            await prisma.processed_events.create({
                data: {
                    tenant_id: tenantId,
                    idempotency_key: idempotencyKey,
                    event_type: eventType,
                    payload_hash: payloadHash,
                    response: response as object,
                    expires_at: expiresAt,
                }
            });
        } catch (err: unknown) {
            // Unique constraint violation = concurrent duplicate, safe to ignore
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('Unique constraint')) {
                console.error('Failed to store idempotency record:', msg);
            }
        }
    }
}
