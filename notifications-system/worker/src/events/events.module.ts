import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EventsController } from './events.controller';
import { SecurityService } from '../common/security.service';
import { RateLimiterService } from '../common/rate-limiter.service';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'GO_GATEWAY_SERVICE',
                transport: Transport.KAFKA,
                options: {
                    client: {
                        clientId: 'webhook-producer',
                        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
                    },
                    producerOnlyMode: true,
                },
            },
        ]),
    ],
    providers: [SecurityService, RateLimiterService],
    controllers: [EventsController],
})
export class EventsModule { }

