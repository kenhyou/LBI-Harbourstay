import { randomUUID } from 'node:crypto';

/**
 * KEN'S FILL FILE — stub. The `Payment` aggregate's OWN identity VO (BC-3). An
 * aggregate's own id is a VO (conventions); a foreign reference like `bookingId`
 * stays a plain string. Immutable, compared by value. Your spec is
 * `payment-id.vo.spec.ts`.
 *
 * API to implement:
 * - `generate()` — a fresh random UUID id for a brand-new Payment
 *   (`crypto.randomUUID()` is an allowed runtime primitive).
 * - `create(value)` — wrap an existing id string (reject empty).
 * - `value` getter — the underlying string.
 * - `equals(other)` — value equality.
 */
export class PaymentId {
  private constructor(private readonly _value: string) {}

  /** Generate a new random PaymentId (for `Payment.create`). */
  static generate(): PaymentId {
    return new PaymentId(randomUUID());
  }

  /** Wrap a persisted/known id string (for `reconstitute`). Reject empty. */
  static create(value: string): PaymentId {
    if (!value || value.trim() === '') {
      throw new Error('Payment ID cannot be empty');
    }
    return new PaymentId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: PaymentId): boolean {
    return this._value === other._value;
  }
}
