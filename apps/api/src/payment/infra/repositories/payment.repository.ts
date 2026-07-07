import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PaymentRepositoryPort } from '@/payment/application/ports/payment.repository.port';
import { PaymentMapper } from '@/payment/infra/mappers/payment.mapper';
import { Payment } from '@/payment/domain/models/payment.model';

/**
 * Prisma-backed write repository for the `Payment` aggregate (BC-3). Reads the
 * transactional client from `TransactionHost`, so a `save` inside the webhook
 * transaction commits atomically with the ProcessedWebhookEvent ledger row.
 * Prisma lives only here.
 */
@Injectable()
export class PaymentRepository extends PaymentRepositoryPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async save(payment: Payment): Promise<void> {
    const data = PaymentMapper.toPersistence(payment);
    await this.txHost.tx.payment.upsert({
      where: { id: data.id },
      create: data,
      // Only the status transitions after creation; amount/intent are immutable.
      update: { status: data.status },
    });
  }

  async findById(id: string): Promise<Payment | null> {
    const row = await this.txHost.tx.payment.findUnique({ where: { id } });
    return row ? PaymentMapper.toDomain(row) : null;
  }

  async findByStripeIntentId(intentId: string): Promise<Payment | null> {
    const row = await this.txHost.tx.payment.findUnique({
      where: { stripePaymentIntentId: intentId },
    });
    return row ? PaymentMapper.toDomain(row) : null;
  }
}
