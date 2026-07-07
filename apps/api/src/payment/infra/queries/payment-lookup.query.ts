import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import {
  PaymentLookupPort,
  type PaymentLookupResult,
} from '@/payment/application/ports/payment-lookup.port';

/**
 * Read impl of `PaymentLookupPort` (BC-3). Projects `payment ⋈ booking` rows into
 * the ids the saga acts on — no aggregate reconstitution. Reads the transactional
 * client so it observes the saga's own transaction consistently.
 */
@Injectable()
export class PaymentLookupQuery extends PaymentLookupPort {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>,
  ) {
    super();
  }

  async lookup(paymentId: string): Promise<PaymentLookupResult | null> {
    const payment = await this.txHost.tx.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      return null;
    }
    const booking = await this.txHost.tx.booking.findUnique({
      where: { id: payment.bookingId },
    });
    if (!booking) {
      return null;
    }
    return {
      bookingId: booking.id,
      holdId: booking.holdId,
      amount: payment.amount,
    };
  }
}
