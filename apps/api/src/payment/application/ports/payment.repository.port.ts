import { Payment } from '@/payment/domain/models/payment.model';

/**
 * Write-side persistence port for the `Payment` aggregate (BC-3). Bound to its
 * Prisma impl in exactly one module. Its `save` joins the ambient transaction when
 * called inside `TransactionManagerPort.run` (the webhook mark-succeeded txn).
 */
export abstract class PaymentRepositoryPort {
  /** Insert or update the aggregate. */
  abstract save(payment: Payment): Promise<void>;

  /** Load by our own id, or `null`. */
  abstract findById(id: string): Promise<Payment | null>;

  /**
   * Load by the Stripe PaymentIntent id (the webhook resolves the Payment from the
   * intent reference the ACL translated out of the event). `null` if unknown.
   */
  abstract findByStripeIntentId(intentId: string): Promise<Payment | null>;
}
