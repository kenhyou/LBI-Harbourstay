/**
 * BC-2's OWN copy of `Money` (Booking BC keeps a separate copy). Amount is in
 * MINOR UNITS (integer cents, ADR-0005) and must be ≥ 0; currency is an ISO
 * 4217 code. Immutable; compared by value. Arithmetic that could produce a
 * non-integer is guarded — money never carries a fraction of a cent.
 */
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string,
  ) {}

  static create(amount: number, currency = 'USD'): Money {
    if (!Number.isInteger(amount)) {
      throw new Error(`Money amount must be an integer (minor units): ${amount}`);
    }
    if (amount < 0) {
      throw new Error(`Money amount must be >= 0: ${amount}`);
    }
    return new Money(amount, currency);
  }

  get amount(): number {
    return this._amount;
  }

  get currency(): string {
    return this._currency;
  }

  /** Add another Money of the SAME currency. */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.create(this._amount + other._amount, this._currency);
  }

  /** Multiply by a non-negative integer factor (e.g. nights). */
  times(factor: number): Money {
    return Money.create(this._amount * factor, this._currency);
  }

  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency === other._currency;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: ${this._currency} vs ${other._currency}`,
      );
    }
  }
}
