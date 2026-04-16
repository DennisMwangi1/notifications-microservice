import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ActorContext } from './actor-context';
import { RequestContextService } from './request-context.service';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export interface AuditLogInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  tenantId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly requestContext: RequestContextService) {}

  async record(
    client: PrismaClientLike,
    actor: ActorContext,
    input: AuditLogInput,
  ): Promise<void> {
    await client.audit_logs.create({
      data: {
        actor_type: this.mapActorType(actor.actorType),
        actor_id: actor.actorId,
        tenant_id: input.tenantId ?? actor.tenantId ?? null,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        trace_id: this.requestContext.getStore()?.traceId ?? null,
        before_state: this.normalizeJson(input.beforeState),
        after_state: this.normalizeJson(input.afterState),
      },
    });
  }

  private mapActorType(actorType: ActorContext['actorType']) {
    switch (actorType) {
      case 'platform_operator':
        return 'PLATFORM_OPERATOR';
      case 'tenant_admin':
        return 'TENANT_ADMIN';
      default:
        return 'SYSTEM';
    }
  }

  private normalizeJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
