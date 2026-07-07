/**
 * KEN'S FILL FILE — stub. Payment BC's OWN copy of `Money` (each BC keeps its own;
 * no shared domain VO across contexts). Amount is in MINOR UNITS (integer cents,
 * ADR-0005) and must be ≥ 0; currency is an ISO 4217 code. Immutable; compared by
 * value. Your spec is `money.vo.spec.ts`.
 *
 * API to implement:
 * - `create(amount, currency='USD')` — reject non-integer or negative amounts and
 *   empty currency.
 * - `reconstitute(amount, currency='USD')` — rebuild a trusted persisted amount
 *   (no re-validation).
 * - `amount` / `currency` getters.
 * - `equals(other)` — value equality on amount AND currency.
 */
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string,
  ) {}

  static create(amount: number, currency = 'USD'): Money {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('amount must be non-negative integer.');
    }
    if (!currency || currency.trim() === '') {
      throw new Error('currency cannot be empty.');
    }

    return new Money(amount, currency);
  }

  static reconstitute(amount: number, currency = 'USD'): Money {
    return new Money(amount, currency);
  }

  get amount(): number {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }
}
