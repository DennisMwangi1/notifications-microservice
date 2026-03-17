import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContextService } from './request-context.service';

export type AppLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

export interface AppLogMeta {
    traceId?: string;
    requestId?: string;
    route?: string;
    method?: string;
    [key: string]: unknown;
}

const LEVEL_MAP: Record<AppLogLevel, string> = {
    log: 'INFO',
    error: 'ERROR',
    warn: 'WARN',
    debug: 'DEBUG',
    verbose: 'VERBOSE',
};

function formatMessage(level: AppLogLevel, message: string, context: string, meta?: AppLogMeta) {
    const payload = {
        timestamp: new Date().toISOString(),
        level: LEVEL_MAP[level] ?? level.toUpperCase(),
        context,
        message,
        traceId: meta?.traceId ?? randomUUID(),
        requestId: meta?.requestId,
        method: meta?.method,
        route: meta?.route,
        ...meta,
    };

    return JSON.stringify(payload);
}

@Injectable()
export class AppLoggerService implements NestLoggerService {
    private context = 'App';

    constructor(private readonly requestContext: RequestContextService) {}

    private resolveMeta(meta?: AppLogMeta): AppLogMeta {
        const requestMeta = this.requestContext.getStore() || {};
        return { ...requestMeta, ...meta };
    }

    setContext(context: string): void {
        this.context = context;
    }

    log(message: string, meta?: AppLogMeta): void {
        const out = formatMessage('log', message, this.context, this.resolveMeta(meta));
        process.stdout.write(`${out}\n`);
    }

    error(message: string, trace?: string | unknown, meta?: AppLogMeta): void {
        const traceText = typeof trace === 'string' ? trace : trace instanceof Error ? trace.stack || trace.message : JSON.stringify(trace);
        const out = formatMessage('error', `${message}${traceText ? ` | ${traceText}` : ''}`, this.context, this.resolveMeta(meta));
        process.stderr.write(`${out}\n`);
    }

    warn(message: string, meta?: AppLogMeta): void {
        const out = formatMessage('warn', message, this.context, this.resolveMeta(meta));
        process.stderr.write(`${out}\n`);
    }

    debug?(message: string, meta?: AppLogMeta): void {
        const out = formatMessage('debug', message, this.context, this.resolveMeta(meta));
        process.stdout.write(`${out}\n`);
    }

    verbose?(message: string, meta?: AppLogMeta): void {
        const out = formatMessage('verbose', message, this.context, this.resolveMeta(meta));
        process.stdout.write(`${out}\n`);
    }
}
