import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { AdminModule } from './admin/admin.module';

@Module({
    imports: [AuthModule, NotificationsModule, EventsModule, AdminModule],
})
export class AppModule { }
