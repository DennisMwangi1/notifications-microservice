import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';

declare module 'express-serve-static-core' {
  interface Request {
    traceId?: string;
    requestId?: string;
    startedAt?: number;
  }
}

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(
    private readonly appLogger: AppLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const traceId = (req.headers['x-trace-id'] as string) || randomUUID();

    req.requestId = requestId;
    req.traceId = traceId;
    req.startedAt = Date.now();

    this.requestContext.run(
      {
        traceId,
        requestId,
        method: req.method,
        route: req.originalUrl,
      },
      () => {
        this.appLogger.log('HTTP request received');

        res.on('finish', () => {
          const latencyMs = Date.now() - (req.startedAt ?? Date.now());
          this.appLogger.log('HTTP request completed', {
            statusCode: res.statusCode,
            latencyMs,
          });
        });

        next();
      },
    );
  }
}
