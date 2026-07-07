import { PaymentId } from '@/payment/domain/vo/payment-id.vo';
import { Money } from '@/payment/domain/vo/money.vo';
import { PaymentStatus } from '@/payment/domain/enums/payment-status.enum';
import { InvalidPaymentStateException } from '@/payment/domain/exceptions/invalid-payment-state.exception';

/** Props to create a brand-new Payment (id/status/createdAt derived here). */
export interface NewPaymentProps {
  bookingId: string;
  amount: Money;
  /** The opaque Stripe PaymentIntent id from the ACL (BC-4). */
  stripePaymentIntentId: string;
}

/** Full snapshot to restore a Payment from persistence. */
export interface PaymentSnapshot {
  id: string;
  bookingId: string;
  amount: Money;
  status: PaymentStatus;
  stripePaymentIntentId: string;
  createdAt: Date;
}

/**
 * KEN'S FILL FILE — stub. `Payment` aggregate root (BC-3) — our purified model of
 * an in-flight payment for a booking. References the booking by plain string id.
 * Owns the payment state machine; Stripe specifics stay in the ACL (BC-4). Your
 * spec is `payment.model.spec.ts` — implement to make it green; do not weaken it.
 *
 * State machine (each terminal transition guard → mutate):
 *   Pending --markSucceeded()--> Succeeded
 *   Pending --markFailed()-----> Failed
 *
 * Invariants to enforce:
 * - IDEMPOTENT terminal transitions: calling `markSucceeded()` on an
 *   already-Succeeded payment is a NO-OP (no throw, stays Succeeded); likewise
 *   `markFailed()` on an already-Failed payment.
 * - CONFLICTING transitions throw `InvalidPaymentStateException(from, attempted)`:
 *   `markSucceeded()` on a Failed payment, `markFailed()` on a Succeeded payment.
 * - The `amount` is frozen at creation and never mutated.
 *
 * The idempotency here is what makes a duplicate Stripe webhook safe at the
 * aggregate level (belt-and-braces with the ProcessedWebhookEvent dedup ledger).
 */
export class Payment {
  private constructor(
    private readonly _id: PaymentId,
    private readonly _bookingId: string,
    private readonly _amount: Money,
    private _status: PaymentStatus,
    private readonly _stripePaymentIntentId: string,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Create a new payment in `Pending`. Generate a fresh `PaymentId`
   * (`PaymentId.generate()`) and stamp `createdAt = new Date()`.
   */
  static create(props: NewPaymentProps): Payment {
    const createdAt = new Date();
    return new Payment(
      PaymentId.generate(),
      props.bookingId,
      props.amount,
      PaymentStatus.Pending,
      props.stripePaymentIntentId,
      createdAt,
    );
  }

  /** Restore from a persisted snapshot (no id generation). */
  static reconstitute(snapshot: PaymentSnapshot): Payment {
    return new Payment(
      PaymentId.create(snapshot.id),
      snapshot.bookingId,
      snapshot.amount,
      snapshot.status,
      snapshot.stripePaymentIntentId,
      new Date(snapshot.createdAt),
    );
  }

  /** Pending → Succeeded. Idempotent if already Succeeded; conflict if Failed. */
  markSucceeded(): void {
    if (this._status === PaymentStatus.Failed) {
      throw new InvalidPaymentStateException(
        this._status,
        PaymentStatus.Succeeded,
      );
    }
    this._status = PaymentStatus.Succeeded;
  }

  /** Pending → Failed. Idempotent if already Failed; conflict if Succeeded. */
  markFailed(): void {
    if (this._status === PaymentStatus.Succeeded) {
      throw new InvalidPaymentStateException(
        this._status,
        PaymentStatus.Failed,
      );
    }
    this._status = PaymentStatus.Failed;
  }

  get id(): string {
    return this._id.value;
  }

  get bookingId(): string {
    return this._bookingId;
  }

  get amount(): Money {
    return this._amount;
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get stripePaymentIntentId(): string {
    return this._stripePaymentIntentId;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }
}
