import { Controller, Inject, OnModuleInit, Get, Put, Param } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { RenderService } from './render.service';
import prisma from '../config/prisma.config';
import { randomUUID } from 'crypto';
import { EnrichedKafkaPayload } from '../common/dto/events.dto';
import { EmailDispatchPayload, SmsDispatchPayload, RealtimeDispatchPayload } from '../common/dto/admin.dto';

@Controller()
export class NotificationsController implements OnModuleInit {
  private prisma = prisma;

  constructor(
    private readonly renderService: RenderService,
    @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka
  ) { }

  async onModuleInit() {
    let connected = false;
    while (!connected) {
      try {
        await this.kafkaClient.connect();
        console.log("Kafka Client Connected to Go gateway");
        connected = true;
      } catch (err) {
        console.error("Kafka not ready yet, retrying in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  @MessagePattern('tenant.event.received')
  async handleTenantEvent(@Payload() data: EnrichedKafkaPayload) {
    const { userId, eventType, tenant, ...payloadData } = data;
    console.log(`📩 Received generic event '${eventType}' for Tenant ID: ${tenant.id}`);

    // R5: Fetch only the LATEST active version per channel_type using distinct grouping
    // This prevents processing duplicate channels when multiple versions exist
    const whereClause = eventType.startsWith('global.')
      ? { event_type: eventType, is_active: true }
      : { tenant_id: tenant.id, event_type: eventType, is_active: true };

    const allTemplates = await this.prisma.templates.findMany({
      where: whereClause,
      orderBy: { version: 'desc' },
    });

    // R5: Keep only the latest version per channel_type to avoid duplicate dispatches
    const seenChannels = new Set<string>();
    const templates = allTemplates.filter(tpl => {
      if (seenChannels.has(tpl.channel_type)) return false;
      seenChannels.add(tpl.channel_type);
      return true;
    });

    if (!templates || templates.length === 0) {
      console.error(`❌ No Templates for Event '${eventType}' and Tenant '${tenant.id}' found in DB`);
      return;
    }

    // BYOP: Check for custom provider config
    let providerConfig = null;
    if (tenant.provider_config_id) {
      providerConfig = await this.prisma.provider_configs.findUnique({
        where: { id: tenant.provider_config_id }
      });
    }

    // Iterate through the delivery matrix and dispatch per channel
    for (const template of templates) {
      const dynamicSubject = this.renderService.renderText(template.subject_line || 'Notification', payloadData as Record<string, unknown>).replace(/<[^>]*>?/gm, '');
      const notificationId = randomUUID();

      // -----------------------------
      // 🚀 BRANCH A: EMAIL TEMPLATE (KAFKA -> GO GATEWAY)
      // -----------------------------
      if (template.channel_type === 'EMAIL') {
        const finalHtml = this.renderService.render(template.content_body, payloadData as Record<string, unknown>);

        // Initialize log as PENDING
        await this.prisma.notification_logs.create({
          data: {
            notification_id: notificationId,
            tenant_id: tenant.id,
            user_id: userId,
            template_id: template.template_id,
            channel: 'EMAIL',
            status: 'PENDING',
            metadata: data as object,
          }
        });
        const emailPayload: EmailDispatchPayload = {
          actionType: 'EMAIL',
          notificationId,
          tenantId: tenant.id,
          userId,
          recipient: (payloadData.recipientEmail as string) || "error_no_email_provided@system",
          senderEmail: providerConfig?.sender_email || tenant.sender_email,
          senderName: providerConfig?.sender_name || tenant.sender_name,
          subject: dynamicSubject,
          body: finalHtml,
          provider: providerConfig?.provider || "RESEND",
          apiKey: providerConfig?.api_key,
        };

        this.kafkaClient.emit('notification.dispatch', emailPayload);
      }

      // -----------------------------
      // 🚀 BRANCH B: SMS TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'SMS') {
        const finalSmsText = this.renderService.renderText(template.content_body, payloadData as Record<string, unknown>);

        // R4: Use Prisma typed create() instead of raw SQL
        await this.prisma.notification_logs.create({
          data: {
            notification_id: notificationId,
            tenant_id: tenant.id,
            user_id: userId,
            template_id: template.template_id,
            channel: 'SMS',
            status: 'PENDING',
            metadata: data as object,
          }
        });

        const smsPayload: SmsDispatchPayload = {
          actionType: 'SMS',
          notificationId,
          tenantId: tenant.id,
          userId,
          recipient: (payloadData.recipientPhone as string) || "+10000000000",
          subject: dynamicSubject,
          body: finalSmsText,
          provider: providerConfig?.provider || "TWILIO",
          apiKey: providerConfig?.api_key,
        };
        this.kafkaClient.emit('notification.dispatch', smsPayload);
      }

      // -----------------------------
      // 🚀 BRANCH C: IN-APP (PUSH) TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'PUSH') {
        // You cannot send a targeted real-time push if there is no user
        if (!userId) {
          console.warn(`Skipping PUSH notification for event '${eventType}' because the payload is missing a userId (e.g., Guest invite).`);
          continue;
        }

        const finalPushBody = this.renderService.renderText(template.content_body, payloadData as Record<string, unknown>);
        const wsChannel = template.target_ws_channel ? `${template.target_ws_channel}#${userId}` : `global_system#${userId}`;

        // Derive the visual category from the event type prefix for frontend styling
        const eventParts = eventType.split('.');
        const knownCategories = ['success', 'warning', 'alert', 'error', 'info'];
        const category = knownCategories.includes(eventParts[1]) ? eventParts[1] : 'info';

        // R4: Use Prisma typed create() instead of raw SQL
        await this.prisma.in_app_notifications.create({
          data: {
            id: notificationId,
            user_id: userId,
            tenant_id: tenant.id,
            type: eventType,
            title: dynamicSubject,
            body: finalPushBody,
            status: 'UNREAD',
          }
        });

        const realtimePayload: RealtimeDispatchPayload = {
          actionType: 'REALTIME',
          notificationId,
          tenantId: tenant.id,
          userId,
          subject: dynamicSubject,
          body: finalPushBody,
          category,
          eventType,
          wsChannel
        };
        this.kafkaClient.emit('notification.dispatch', realtimePayload);
      }
    }
  }

  // -------------------------------------------------------------
  // REST API: Phase 5 (Persistence & History Endpoints)
  // -------------------------------------------------------------

  /**
   * Fetch the unread notification history for a specific user within a specific tenant ecosystem.
   */
  @Get('api/v1/notifications/:tenantId/:userId')
  async getNotifications(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string
  ) {
    const notifications = await this.prisma.in_app_notifications.findMany({
      where: {
        user_id: userId,
        tenant_id: tenantId,
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return { success: true, data: notifications };
  }

  /**
   * Mark a specific notification as READ once the user views it.
   */
  @Put('api/v1/notifications/:tenantId/:userId/:notificationId/read')
  async markAsRead(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Param('notificationId') notificationId: string
  ) {
    // using updateMany to apply additional where constraints for strict tenant isolation
    const result = await this.prisma.in_app_notifications.updateMany({
      where: {
        id: notificationId,
        user_id: userId,
        tenant_id: tenantId,
      },
      data: {
        status: 'READ'
      }
    });

    if (result.count === 0) {
      return { success: false, message: 'Notification not found or access denied.' };
    }

    return { success: true, message: 'Notification marked as READ' };
  }

  // -------------------------------------------------------------
  // DLQ Consumer: Persist permanently failed notifications
  // -------------------------------------------------------------

  @MessagePattern('notification.dlq')
  async handleDeadLetter(@Payload() data: {
    originalPayload: Record<string, unknown>;
    retryCount: number;
    maxRetries: number;
    lastError: string;
    notificationId: string;
    tenantId: string;
    channel: string;
  }) {
    console.log(`💀 DLQ: Persisting permanently failed notification ${data.notificationId}`);

    try {
      // Persist to failed_notifications table for admin review
      await this.prisma.failed_notifications.create({
        data: {
          notification_id: data.notificationId,
          tenant_id: data.tenantId,
          channel: data.channel as 'EMAIL' | 'SMS' | 'PUSH',
          payload: data.originalPayload as object,
          error_details: data.lastError,
          retry_count: data.retryCount,
          max_retries: data.maxRetries,
          permanently_failed: true,
        }
      });

      // Update the notification_logs status to FAILED with error context
      await this.prisma.notification_logs.updateMany({
        where: { notification_id: data.notificationId },
        data: {
          status: 'FAILED',
          error_details: `DLQ: ${data.lastError} (after ${data.retryCount} retries)`,
        }
      });

      console.log(`💀 DLQ: Notification ${data.notificationId} persisted to failed_notifications table`);
    } catch (err) {
      console.error(`❌ DLQ: Failed to persist dead letter for ${data.notificationId}:`, err);
    }
  }
}