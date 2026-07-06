/**
 * KEN'S FILL FILE — stub. Booking BC's OWN copy of `Money` (BC-2 keeps a separate
 * copy). Amount is in MINOR UNITS (integer cents, ADR-0005), must be ≥ 0;
 * currency is an ISO 4217 code. Immutable; compared by value. Used for the frozen
 * `priceSnapshot`. Your spec is `money.vo.spec.ts`.
 */
export class Money {
  private constructor(
    private readonly _amount: number,
    private readonly _currency: string,
  ) {}

  static create(amount: number, currency = 'USD'): Money {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('Invalid money amount');
    }

    if (!currency) {
      throw new Error('Invalid currency');
    }

    return new Money(amount, currency);
  }

  /** Rebuild from a trusted persisted amount (no re-validation). */
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
