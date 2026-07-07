import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { OutboxPort } from '@/shared/outbox/outbox.port';

/**
 * Prisma impl of `OutboxPort`. Writes the event row via the AMBIENT transactional
 * client (`TransactionHost.tx`), so `enqueue` called inside a
 * `TransactionManagerPort.run` boundary commits atomically with the aggregate
 * change (e.g. the `BookingConfirmed` row lands in the same txn as
 * `booking.confirm()`). This atomic write is the whole point of the pattern —
 * no lost events, no phantom events.
 */
@Injectable()
export class PrismaOutbox extends OutboxPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async enqueue(
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.txHost.tx.outboxEvent.create({
      data: {
        type,
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
