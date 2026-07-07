import type {
  Payment as PaymentRow,
  PaymentStatus as PaymentStatusRow,
} from '@prisma/client';
import { Payment } from '@/payment/domain/models/payment.model';
import { Money } from '@/payment/domain/vo/money.vo';
import { PaymentStatus } from '@/payment/domain/enums/payment-status.enum';

/**
 * Translates between the Prisma `payment` row and the `Payment` aggregate. The
 * ONLY place BC-3's write side crosses the Prisma↔domain boundary. Domain enum
 * values match the DB enum (same strings), so status is a straight cast.
 */
export class PaymentMapper {
  static toDomain(row: PaymentRow): Payment {
    return Payment.reconstitute({
      id: row.id,
      bookingId: row.bookingId,
      amount: Money.reconstitute(row.amount, row.currency),
      status: row.status as unknown as PaymentStatus,
      stripePaymentIntentId: row.stripePaymentIntentId,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(payment: Payment): PaymentRow {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status as unknown as PaymentStatusRow,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      createdAt: payment.createdAt,
    };
  }
}
