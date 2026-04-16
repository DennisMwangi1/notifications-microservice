import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../config/prisma.config';
import { ActorContext } from './actor-context';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class DbContextService {
  async withActorContext<T>(
    actor: ActorContext,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await this.applyContext(tx, actor);
      return callback(tx);
    });
  }

  async applyContext(
    client: PrismaClientLike,
    actor: ActorContext,
  ): Promise<void> {
    await client.$executeRaw`
      SELECT set_config('app.current_actor_type', ${actor.actorType}, true)
    `;
    await client.$executeRaw`
      SELECT set_config('app.current_actor_id', ${actor.actorId}, true)
    `;
    await client.$executeRaw`
      SELECT set_config('app.current_tenant_id', ${actor.tenantId ?? ''}, true)
    `;
  }
}
