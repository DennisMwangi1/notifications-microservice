import { Controller, Post, Body, UnauthorizedException, Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import prisma from '../config/prisma.config';
import { TriggerEventDto, EnrichedKafkaPayload } from '../common/dto/events.dto';

@Controller('api/v1/events')
export class EventsController {
    constructor(
        @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka
    ) { }

    @Post('trigger')
    async triggerEvent(@Body() body: TriggerEventDto) {
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

        // R7: Only forward minimal tenant identity — NEVER include api_key in Kafka messages
        const enrichedPayload: EnrichedKafkaPayload = {
            ...payload,
            tenant: { id: tenant.id, name: tenant.name },
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
