import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { Kafka } from 'kafkajs';

const logger = new Logger('Bootstrap');
const DEFAULT_CORS_METHODS = 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS';
const DEFAULT_CORS_HEADERS = [
  'Accept',
  'Authorization',
  'Content-Type',
  'Origin',
  'X-Requested-With',
  'X-Request-Id',
  'X-Trace-Id',
].join(', ');

function parseAllowedOrigins(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (/^http?:\/\/([a-z0-9-]+\.)*traefik\.me$/i.test(origin)) {
    return true;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true;
  }

  return false;
}

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
      logger.log('Admin connected to Kafka successfully');

      await admin.createTopics({
        topics: [
          { topic: 'tenant.event.received' },
          { topic: 'notification.dispatch' },
          { topic: 'notification.retry' },
          { topic: 'notification.dlq' },
        ],
      });
      logger.log('Ensured system topics exist (including retry + DLQ)');

      await admin.disconnect();
      adminConnected = true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error(
        'Kafka broker not quite ready, retrying admin connection in 5 seconds...',
        errMsg,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Create standard HTTP API
  const logLevels: Array<'log' | 'error' | 'warn' | 'debug' | 'verbose'> =
    process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'];

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: logLevels,
  });

  app.useLogger(logger);
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

  const resolveCorsOrigin = (origin?: string): string | undefined => {
    if (!origin) {
      return undefined;
    }

    if (isAllowedOrigin(origin, allowedOrigins)) {
      return origin;
    }

    logger.warn(`Blocked CORS request from origin: ${origin}`);
    return undefined;
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const corsOrigin = process.env.CORS_ALLOWED_ORIGINS;

    if (corsOrigin) {
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Origin', corsOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', DEFAULT_CORS_METHODS);
      res.header(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] || DEFAULT_CORS_HEADERS,
      );
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  // Enable CORS so external projects' frontends can fetch tokens
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean | string) => void,
    ) => {
      const allowedOrigin = resolveCorsOrigin(origin);
      callback(null, allowedOrigin ? allowedOrigin : false);
    },
    methods: DEFAULT_CORS_METHODS,
    allowedHeaders: DEFAULT_CORS_HEADERS,
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  // Attach Kafka Microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: {
        groupId: 'notification-worker-group',
      },
    },
  });

  // Start the Kafka listener
  await app.startAllMicroservices();
  logger.log('Notification Microservice connected to Kafka.');

  // Open HTTP Port for Project Integration (Auth, Webhooks)
  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`Notification API HTTP Server is running on port ${port}`);
}
bootstrap();
