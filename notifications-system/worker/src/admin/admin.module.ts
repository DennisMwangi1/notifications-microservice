import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TenantsController } from './tenants.controller';
import { TemplatesController } from './templates.controller';
import { StatsController } from './stats.controller';
import { LogsController } from './logs.controller';
import { ProvidersController } from './providers.controller';
import { DlqController } from './dlq.controller';

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'GO_GATEWAY_SERVICE',
                transport: Transport.KAFKA,
                options: {
                    client: {
                        clientId: 'admin-dlq-producer',
                        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
                    },
                    producerOnlyMode: true,
                },
            },
        ]),
    ],
    controllers: [TenantsController, TemplatesController, StatsController, LogsController, ProvidersController, DlqController],
})
export class AdminModule { }

