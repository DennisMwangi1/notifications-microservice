import { Controller, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { RenderService } from './render.service';
import prisma from '../config/prisma.config';
import { randomUUID } from 'crypto';

@Controller()
export class NotificationsController implements OnModuleInit {
  private prisma = prisma;

  constructor(private readonly renderService: RenderService, @Inject('GO_GATEWAY_SERVICE') private readonly kafkaClient: ClientKafka) { }

  async onModuleInit() {
    this.kafkaClient.subscribeToResponseOf('notification.dispatch');
    await this.kafkaClient.connect();
    console.log("Kafka Client Connected to Go gateway");
  }
  @MessagePattern('order.created')
  async handleOrderCreated(@Payload() data: any) {
    const { userId, orderId, name, amount } = data;

    console.log(`📩 Received event for Order: ${orderId}`);

    // 1. Fetch User Preferences
    const prefs = await this.prisma.user_preferences.findUnique({
      where: { user_id: userId },
    });

    // 2. Logic: Should we send an email?
    // (If prefs is null, we might default to 'true' or skip)
    const canSendEmail = (prefs?.channels as any)?.email ?? true;

    if (!canSendEmail) {
      console.log(`🚫 User ${userId} has disabled email notifications. Skipping.`);
      return;
    }

    // 3. Fetch the Template we just seeded
    const template = await this.prisma.templates.findFirst({
      where: {
        template_id: 'order_success',
        is_active: true,
      },
      orderBy: { version: 'desc' }, // Get the latest version
    });

    if (!template) {
      console.error('❌ Template ORDER_SUCCESS not found in DB');
      return;
    }

    // 4. Render the MJML to HTML
    const finalHtml = this.renderService.render(template.content_body, {
      name: name || 'Valued Customer',
      orderId: orderId,
      amount: amount,
    });

    // 5. Audit Log (Optional but recommended)
    const notificationId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO notification_logs (notification_id, user_id, template_id, channel, status, metadata)
      VALUES (${notificationId}::uuid, ${userId}::uuid, ${template.template_id}, 'EMAIL', 'PENDING', ${JSON.stringify(data)}::jsonb)
    `;
    const dispatchData = {
      notificationId: notificationId,
      recipient: "user@example.com", // Fetch from Prisma prefs
      subject: template.subject_line?.replace('{{orderId}}', orderId),
      body: finalHtml,
      provider: "SENDGRID"
    };

    this.kafkaClient.emit('notification.dispatch', dispatchData);
  }
}