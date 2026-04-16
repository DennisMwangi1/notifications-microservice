import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TenantsController } from './tenants.controller';
import { TemplatesController } from './templates.controller';
import { StatsController } from './stats.controller';
import { LogsController } from './logs.controller';
import { ProvidersController } from './providers.controller';
import { DlqController } from './dlq.controller';
import { AdminAuthController } from './admin-auth.controller';
import { TemplatePreviewController } from './template-preview.controller';
import { TemplateLibraryController } from './template-library.controller';
import { RateLimiterService } from '../common/rate-limiter.service';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Global()
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
  providers: [RateLimiterService, AdminAuthGuard],
  controllers: [
    AdminAuthController,
    TenantsController,
    TemplatesController,
    TemplatePreviewController,
    TemplateLibraryController,
    StatsController,
    LogsController,
    ProvidersController,
    DlqController,
  ],
})
export class AdminModule {}
