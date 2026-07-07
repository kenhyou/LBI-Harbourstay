import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ProcessedWebhookEventRepositoryPort } from '@/payment/application/ports/processed-webhook-event.repository.port';
import { ProcessedWebhookEvent } from '@/payment/domain/models/processed-webhook-event.model';

/**
 * Prisma-backed persistence for the `ProcessedWebhookEvent` idempotency ledger
 * (BC-3). Reads the transactional client so the dedup check + the ledger insert
 * commit atomically with the Payment mutation inside the webhook transaction. The
 * PK on `eventId` is the hard guarantee that a duplicate delivery cannot be
 * recorded twice (a racing insert fails the unique constraint).
 */
@Injectable()
export class ProcessedWebhookEventRepository extends ProcessedWebhookEventRepositoryPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async exists(eventId: string): Promise<boolean> {
    const row = await this.txHost.tx.processedWebhookEvent.findUnique({
      where: { eventId },
    });
    return row !== null;
  }

  async record(event: ProcessedWebhookEvent): Promise<void> {
    await this.txHost.tx.processedWebhookEvent.create({
      data: { eventId: event.eventId, processedAt: event.processedAt },
    });
  }
}
