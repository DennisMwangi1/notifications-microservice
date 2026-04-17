import { Controller, Get, Inject, OnModuleInit, Param, Put } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { AppLoggerService } from '../common/app-logger.service';
import { RenderService } from './render.service';
import { randomUUID } from 'crypto';
import { EnrichedKafkaPayload } from '../common/dto/events.dto';
import {
  EmailDispatchPayload,
  SmsDispatchPayload,
  RealtimeDispatchPayload,
} from '../common/dto/admin.dto';
import { DbContextService } from '../common/db-context.service';
import { AuditLogService } from '../common/audit-log.service';

/**
 * Message processing controller that listens to enriched tenant events from Kafka
 * and expands them into delivery actions for Email/SMS/PUSH channels.
 *
 * Also exposes REST endpoints for in-app notification history + read tracking.
 */
@Controller()
export class NotificationsController implements OnModuleInit {
  constructor(
    private readonly renderService: RenderService,
    @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly logger: AppLoggerService,
    private readonly dbContext: DbContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Lifecycle hook: forces Kafka connection retry until connected.
   */
  async onModuleInit() {
    let connected = false;
    while (!connected) {
      try {
        await this.kafkaClient.connect();
        this.logger.log('Kafka Client Connected to Go gateway');
        connected = true;
      } catch (err) {
        this.logger.warn('Kafka not ready yet, retrying in 5 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Kafka subscriber for tenant events.
   * - Looks up active templates (global or tenant-specific)
   * - Renders content via MJML/Text template service
   * - Writes PENDING notification logs
   * - Emits dispatch events for email/sms/realtime
   */
  @MessagePattern('tenant.event.received')
  async handleTenantEvent(@Payload() data: EnrichedKafkaPayload) {
    const { userId, eventType, eventId, traceId, tenant, ...payloadData } = data;
    const [templates, providerConfig] = await this.dbContext.withActorContext(
      {
        actorType: 'system',
        actorId: 'notifications-controller',
        tenantId: tenant.id,
      },
      async (tx) => {
        const allTemplates = await tx.templates.findMany({
          where: {
            event_type: eventType,
            is_active: true,
            tenant_id: tenant.id,
          },
          orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
        });

        const resolvedProviderConfig = tenant.provider_config_id
          ? await tx.provider_configs.findFirst({
              where: { id: tenant.provider_config_id, tenant_id: tenant.id },
            })
          : null;

        return [allTemplates, resolvedProviderConfig] as const;
      },
    );

    const seenChannels = new Set<string>();
    const resolvedTemplates = [...templates]
      .filter((tpl) => {
        if (seenChannels.has(tpl.channel_type)) return false;
        seenChannels.add(tpl.channel_type);
        return true;
      });

    if (!resolvedTemplates || resolvedTemplates.length === 0) {
      this.logger.error(
        `❌ No Templates for Event '${eventType}' and Tenant '${tenant.id}' found in DB`,
      );
      return;
    }

    for (const template of resolvedTemplates) {
      const dynamicSubject = this.renderService
        .renderText(
          template.subject_line || 'Notification',
          payloadData as Record<string, unknown>,
        )
        .replace(/<[^>]*>?/gm, '');
      const notificationId = randomUUID();
      if (template.channel_type === 'EMAIL') {
        const finalHtml = this.renderService.render(
          template.content_body,
          payloadData as Record<string, unknown>,
        );

        // Initialize log as PENDING
        await this.dbContext.withActorContext(
          {
            actorType: 'system',
            actorId: 'notifications-controller',
            tenantId: tenant.id,
          },
          async (tx) => {
            await tx.notification_logs.create({
              data: {
                notification_id: notificationId,
                tenant_id: tenant.id,
                user_id: userId,
                template_id: template.template_id,
                channel: 'EMAIL',
                status: 'PENDING',
                metadata: data as object,
              },
            });

            await this.auditLog.record(
              tx,
              {
                actorType: 'system',
                actorId: 'notifications-controller',
                tenantId: tenant.id,
              },
              {
                action: 'notification_log.created',
                resourceType: 'notification_log',
                resourceId: notificationId,
                tenantId: tenant.id,
                afterState: {
                  eventId,
                  traceId,
                  template_id: template.template_id,
                  channel: 'EMAIL',
                },
              },
            );
          },
        );
        const emailPayload: EmailDispatchPayload = {
          actionType: 'EMAIL',
          notificationId,
          tenantId: tenant.id,
          eventId,
          traceId,
          userId,
          recipient:
            (payloadData.recipientEmail as string) ||
            'error_no_email_provided@system',
          senderEmail: providerConfig?.sender_email || tenant.sender_email,
          senderName: providerConfig?.sender_name || tenant.sender_name,
          subject: dynamicSubject,
          body: finalHtml,
          provider: providerConfig?.provider || 'RESEND',
          providerConfigId: providerConfig?.id,
        };

        this.kafkaClient.emit('notification.dispatch', emailPayload);
      }

      // -----------------------------
      // 🚀 BRANCH B: SMS TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'SMS') {
        const finalSmsText = this.renderService.renderText(
          template.content_body,
          payloadData as Record<string, unknown>,
        );

        await this.dbContext.withActorContext(
          {
            actorType: 'system',
            actorId: 'notifications-controller',
            tenantId: tenant.id,
          },
          (tx) =>
            tx.notification_logs.create({
              data: {
                notification_id: notificationId,
                tenant_id: tenant.id,
                user_id: userId,
                template_id: template.template_id,
                channel: 'SMS',
                status: 'PENDING',
                metadata: data as object,
              },
            }),
        );

        const smsPayload: SmsDispatchPayload = {
          actionType: 'SMS',
          notificationId,
          tenantId: tenant.id,
          eventId,
          traceId,
          userId,
          recipient: (payloadData.recipientPhone as string) || '+10000000000',
          subject: dynamicSubject,
          body: finalSmsText,
          provider: providerConfig?.provider || 'TWILIO',
          providerConfigId: providerConfig?.id,
        };
        this.kafkaClient.emit('notification.dispatch', smsPayload);
      }

      // -----------------------------
      // 🚀 BRANCH C: IN-APP (PUSH) TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'PUSH') {
        // You cannot send a targeted real-time push if there is no user
        if (!userId) {
          this.logger.warn(
            `Skipping PUSH notification for event '${eventType}' because the payload is missing a userId (e.g., Guest invite).`,
          );
          continue;
        }

        const finalPushBody = this.renderService.renderText(
          template.content_body,
          payloadData as Record<string, unknown>,
        );
        const wsChannel = template.target_ws_channel
          ? `${template.target_ws_channel}#${userId}`
          : `global_system#${userId}`;

        // Derive the visual category from the event type prefix for frontend styling
        const eventParts = eventType.split('.');
        const knownCategories = [
          'success',
          'warning',
          'alert',
          'error',
          'info',
        ];
        const category = knownCategories.includes(eventParts[1])
          ? eventParts[1]
          : 'info';

        await this.dbContext.withActorContext(
          {
            actorType: 'system',
            actorId: 'notifications-controller',
            tenantId: tenant.id,
          },
          (tx) =>
            tx.in_app_notifications.create({
              data: {
                id: notificationId,
                user_id: userId,
                tenant_id: tenant.id,
                type: eventType,
                title: dynamicSubject,
                body: finalPushBody,
                status: 'UNREAD',
              },
            }),
        );

        const realtimePayload: RealtimeDispatchPayload = {
          actionType: 'REALTIME',
          notificationId,
          tenantId: tenant.id,
          eventId,
          traceId,
          userId,
          subject: dynamicSubject,
          body: finalPushBody,
          category,
          eventType,
          wsChannel,
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
  /**
   * Get unread notification history for a given tenant and user.
   *
   * @param tenantId tenant identifier
   * @param userId user identifier
   */
  @Get('api/v1/notifications/:tenantId/:userId')
  async getNotifications(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    const notifications = await this.dbContext.withActorContext(
      {
        actorType: 'system',
        actorId: 'notifications-controller',
        tenantId,
      },
      (tx) =>
        tx.in_app_notifications.findMany({
          where: {
            user_id: userId,
            tenant_id: tenantId,
          },
          orderBy: { created_at: 'desc' },
          take: 50,
        }),
    );

    return { success: true, data: notifications };
  }

  /**
   * Mark a specific notification as READ once the user views it.
   */
  /**
   * Mark a user notification as READ.
   *
   * @param tenantId tenant identifier
   * @param userId user identifier
   * @param notificationId notification UUID
   */
  @Put('api/v1/notifications/:tenantId/:userId/:notificationId/read')
  async markAsRead(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Param('notificationId') notificationId: string,
  ) {
    // using updateMany to apply additional where constraints for strict tenant isolation
    const result = await this.dbContext.withActorContext(
      {
        actorType: 'system',
        actorId: 'notifications-controller',
        tenantId,
      },
      (tx) =>
        tx.in_app_notifications.updateMany({
          where: {
            id: notificationId,
            user_id: userId,
            tenant_id: tenantId,
          },
          data: {
            status: 'READ',
          },
        }),
    );

    if (result.count === 0) {
      return {
        success: false,
        message: 'Notification not found or access denied.',
      };
    }

    return { success: true, message: 'Notification marked as READ' };
  }

  // -------------------------------------------------------------
  // DLQ Consumer: Persist permanently failed notifications
  // -------------------------------------------------------------

  @MessagePattern('notification.dlq')
  async handleDeadLetter(
    @Payload()
    data: {
      originalPayload: Record<string, unknown>;
      retryCount: number;
      maxRetries: number;
      lastError: string;
      notificationId: string;
      tenantId: string;
      channel: string;
    },
  ) {
    this.logger.warn(
      `💀 DLQ: Persisting permanently failed notification ${data.notificationId}`,
    );

    try {
      // Persist to failed_notifications table for admin review
      await this.dbContext.withActorContext(
        {
          actorType: 'system',
          actorId: 'notifications-controller',
          tenantId: data.tenantId,
        },
        (tx) =>
          tx.failed_notifications.create({
            data: {
              notification_id: data.notificationId,
              tenant_id: data.tenantId,
              channel: data.channel as 'EMAIL' | 'SMS' | 'PUSH',
              payload: data.originalPayload as object,
              error_details: data.lastError,
              retry_count: data.retryCount,
              max_retries: data.maxRetries,
              permanently_failed: true,
            },
          }),
      );

      // Update the notification_logs status to FAILED with error context
      await this.dbContext.withActorContext(
        {
          actorType: 'system',
          actorId: 'notifications-controller',
          tenantId: data.tenantId,
        },
        (tx) =>
          tx.notification_logs.updateMany({
            where: { notification_id: data.notificationId },
            data: {
              status: 'FAILED',
              error_details: `DLQ: ${data.lastError} (after ${data.retryCount} retries)`,
            },
          }),
      );

      this.logger.log(
        `💀 DLQ: Notification ${data.notificationId} persisted to failed_notifications table`,
      );
    } catch (err) {
      this.logger.error(
        `❌ DLQ: Failed to persist dead letter for ${data.notificationId}:`,
        err,
      );
    }
  }

}
