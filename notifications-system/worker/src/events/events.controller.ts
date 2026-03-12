import { Controller, Post, Body, UnauthorizedException, Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import prisma from '../config/prisma.config';

@Controller('api/v1/events')
export class EventsController {
    constructor(
        @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka
    ) { }

    @Post('trigger')
    async triggerEvent(@Body() body: any) {
        const { apiKey, eventType, payload } = body;

        if (!apiKey || !eventType || !payload) {
            throw new UnauthorizedException('Missing apiKey, eventType, or payload');
        }

        const cleanKey = apiKey.trim();
        const tenant = await prisma.tenants.findFirst({
            where: { api_key: cleanKey }
        });

        if (!tenant || !tenant.is_active) {
            console.error(`Webhook Auth Failed. Received Key: ${cleanKey}`);
            throw new UnauthorizedException('Invalid or inactive API key');
        }

        // Inject tenant identity into payload for downstream consumers
        const enrichedPayload = {
            ...payload,
            tenant: tenant,
            eventType: eventType // Pass the original trigger string downstream
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
