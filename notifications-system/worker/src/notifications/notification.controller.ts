import { Controller, Inject, OnModuleInit, Get, Put, Param } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { RenderService } from './render.service';
import prisma from '../config/prisma.config';
import { randomUUID } from 'crypto';

@Controller()
export class NotificationsController implements OnModuleInit {
  private prisma = prisma;

  constructor(private readonly renderService: RenderService, @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka) { }

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
  async handleTenantEvent(@Payload() data: any) {
    const { userId, eventType, tenantId, project_source, ...payloadData } = data;

    console.log(`📩 Received generic event '${eventType}' for Tenant ID: ${tenantId}`);

    // 1. Fetch ALL Templates for this Tenant and Event Type (The Delivery Matrix)
    const templates = await this.prisma.templates.findMany({
      where: {
        tenant_id: tenantId,
        event_type: eventType,
        is_active: true,
      },
      orderBy: { version: 'desc' },
    });

    if (!templates || templates.length === 0) {
      console.error(`❌ No Templates for Event '${eventType}' and Tenant '${tenantId}' found in DB`);
      return;
    }

    // 2. Iterate through the Matrix and conditionally dispatch based on Template type!
    for (const template of templates) {
      // Safely render the text fields without MJML
      const dynamicSubject = this.renderService.renderText(template.subject_line || 'Notification', payloadData).replace(/<[^>]*>?/gm, '');
      const notificationId = randomUUID();

      // -----------------------------
      // 🚀 BRANCH A: EMAIL TEMPLATE
      // -----------------------------
      if (template.channel_type === 'EMAIL') {
        const finalHtml = this.renderService.render(template.content_body, { ...payloadData }); // Pass through heavy MJML Engine

        await this.prisma.$executeRaw`
          INSERT INTO notification_logs (notification_id, user_id, template_id, channel, status, metadata)
          VALUES (${notificationId}::uuid, ${userId}::uuid, ${template.template_id}, 'EMAIL', 'PENDING', ${JSON.stringify(data)}::jsonb)
        `;

        this.kafkaClient.emit('notification.dispatch', {
          actionType: 'EMAIL',
          notificationId: notificationId,
          userId: userId,
          recipient: "user@example.com", // Normally fetch from user profile
          subject: dynamicSubject,
          body: finalHtml,
          provider: "SENDGRID"
        });
      }

      // -----------------------------
      // 🚀 BRANCH B: SMS TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'SMS') {
        const finalSmsText = this.renderService.renderText(template.content_body, { ...payloadData }); // Text engine only

        await this.prisma.$executeRaw`
          INSERT INTO notification_logs (notification_id, user_id, template_id, channel, status, metadata)
          VALUES (${notificationId}::uuid, ${userId}::uuid, ${template.template_id}, 'SMS', 'PENDING', ${JSON.stringify(data)}::jsonb)
        `;

        this.kafkaClient.emit('notification.dispatch', {
          actionType: 'SMS',
          notificationId: notificationId,
          userId: userId,
          recipient: "+1234567890", // Normally fetch from user profile
          subject: dynamicSubject,
          body: finalSmsText,
          provider: "TWILIO"
        });
      }

      // -----------------------------
      // 🚀 BRANCH C: IN-APP (PUSH) TEMPLATE
      // -----------------------------
      else if (template.channel_type === 'PUSH') {
        const finalPushBody = this.renderService.renderText(template.content_body, { ...payloadData }); // Text engine only

        // Dynamically resolve the real-time boundary strictly using the template's DB instruction!
        const wsChannel = template.target_ws_channel ? `${template.target_ws_channel}#${userId}` : `global_system#${userId}`;

        // Save to Persistent Bell Payload History
        await this.prisma.$executeRaw`
          INSERT INTO in_app_notifications (id, user_id, project_source, type, title, body, status)
          VALUES (${notificationId}::uuid, ${userId}::uuid, ${project_source}, ${eventType}, ${dynamicSubject}, ${finalPushBody}, 'UNREAD')
        `;

        // Send strictly to WebSocket Pipe (Do not trigger an email provider)
        this.kafkaClient.emit('notification.dispatch', {
          actionType: 'REALTIME',
          notificationId: notificationId,
          userId: userId,
          subject: dynamicSubject,
          body: finalPushBody,
          wsChannel: wsChannel
        });
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
        project_source: tenantId,
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
        project_source: tenantId,
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
}