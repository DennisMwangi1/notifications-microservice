import { Controller, Post, Body, UnauthorizedException, Inject, Headers, Req } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import prisma from '../config/prisma.config';
import { TriggerEventDto, EnrichedKafkaPayload } from '../common/dto/events.dto';
import { SecurityService } from '../common/security.service';
import { Request } from 'express';

@Controller('api/v1/events')
export class EventsController {
    constructor(
        @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
        private readonly securityService: SecurityService
    ) { }

    @Post('trigger')
    async triggerEvent(
        @Body() body: TriggerEventDto,
        @Headers('x-nucleus-signature') signature: string,
        @Req() req: Request & { rawBody: Buffer }
    ) {
        const { apiKey, eventType, payload } = body;

        // 1. Basic validation
        if (!apiKey || !eventType || !payload || !payload.userId) {
            throw new UnauthorizedException('Missing apiKey, eventType, payload, or userId. Guest notifications are not supported.');
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

        // R7: Only forward minimal tenant identity — NEVER include api_key in Kafka messages
        const enrichedPayload: EnrichedKafkaPayload = {
            ...payload,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                sender_email: tenant.sender_email,
                sender_name: tenant.sender_name
            },
            eventType: eventType
        };

        // Forward to Kafka's universal generic topic so the asynchronous stream handles rendering & delivery
        try {
            this.kafkaClient.emit('tenant.event.received', enrichedPayload);
            return { success: true, message: `Event ${eventType} dispatched securely for ${tenant.name}` };
        } catch (error) {
            console.error('Failed to emit to Kafka from webhook', error);
            throw new Error('Internal messaging failure');
        }
    }
}
