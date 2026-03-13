
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Kafka } from 'kafkajs';

async function bootstrap() {
  const kafka = new Kafka({
    clientId: 'admin',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  });

  const admin = kafka.admin();
  let adminConnected = false;

  while (!adminConnected) {
    try {
      await admin.connect();
      console.log('Admin connected to Kafka successfully');

      await admin.createTopics({
        topics: [
          { topic: 'tenant.event.received' },
          { topic: 'notification.dispatch' }
        ],
      });
      console.log('Ensured system topics exist');

      await admin.disconnect();
      adminConnected = true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('Kafka broker not quite ready, retrying admin connection in 5 seconds...', errMsg);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Create standard HTTP API
  const app = await NestFactory.create(AppModule);

  // Enable CORS so external projects' frontends can fetch tokens
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Attach Kafka Microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: {
        groupId: 'notification-worker-group'
      },
    },
  });

  // Start the Kafka listener
  await app.startAllMicroservices();
  console.log('Notification Microservice connected to Kafka.');

  // Open HTTP Port for Project Integration (Auth, Webhooks)
  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Notification API HTTP Server is running on port ${port}`);
}
bootstrap();
