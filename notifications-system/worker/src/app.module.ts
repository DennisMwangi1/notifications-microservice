import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { AdminModule } from './admin/admin.module';
import { AppLoggerService } from './common/app-logger.service';
import { RequestContextService } from './common/request-context.service';
import { LoggerMiddleware } from './common/logger.middleware';

@Global()
@Module({
  imports: [AuthModule, NotificationsModule, EventsModule, AdminModule],
  providers: [AppLoggerService, RequestContextService],
  exports: [AppLoggerService, RequestContextService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
