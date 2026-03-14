import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TemplatesController } from './templates.controller';
import { StatsController } from './stats.controller';
import { LogsController } from './logs.controller';
import { ProvidersController } from './providers.controller';

@Module({
    controllers: [TenantsController, TemplatesController, StatsController, LogsController, ProvidersController],
})
export class AdminModule { }
