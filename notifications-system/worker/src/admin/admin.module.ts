import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TemplatesController } from './templates.controller';

@Module({
    controllers: [TenantsController, TemplatesController],
})
export class AdminModule { }
