import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TenantAuthController } from './tenant-auth.controller';
import { TenantTemplatesController } from './templates.controller';
import { TenantTemplateLibraryController } from './template-library.controller';
import { TenantProvidersController } from './providers.controller';
import { TenantLogsController } from './logs.controller';
import { TenantDlqController } from './dlq.controller';
import { TenantAuthGuard } from '../common/guards/tenant-auth.guard';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'GO_GATEWAY_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'tenant-dlq-producer',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          producerOnlyMode: true,
        },
      },
    ]),
  ],
  providers: [TenantAuthGuard],
  controllers: [
    TenantAuthController,
    TenantTemplatesController,
    TenantTemplateLibraryController,
    TenantProvidersController,
    TenantLogsController,
    TenantDlqController,
  ],
})
export class TenantModule {}
