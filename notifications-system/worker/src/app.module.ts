import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { AdminModule } from './admin/admin.module';
import { TenantModule } from './tenant/tenant.module';
import { AppLoggerService } from './common/app-logger.service';
import { RequestContextService } from './common/request-context.service';
import { LoggerMiddleware } from './common/logger.middleware';
import { DbContextService } from './common/db-context.service';
import { AuditLogService } from './common/audit-log.service';
import { ProviderCryptoService } from './common/provider-crypto.service';
import { OperationalMailerService } from './common/operational-mailer.service';
import { TenantAdminCredentialsService } from './common/tenant-admin-credentials.service';

@Global()
@Module({
  imports: [AuthModule, NotificationsModule, EventsModule, AdminModule, TenantModule],
  providers: [
    AppLoggerService,
    RequestContextService,
    DbContextService,
    AuditLogService,
    ProviderCryptoService,
    OperationalMailerService,
    TenantAdminCredentialsService,
  ],
  exports: [
    AppLoggerService,
    RequestContextService,
    DbContextService,
    AuditLogService,
    ProviderCryptoService,
    OperationalMailerService,
    TenantAdminCredentialsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
