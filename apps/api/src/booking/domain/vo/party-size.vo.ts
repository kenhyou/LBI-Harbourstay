/**
 * KEN'S FILL FILE — stub. `PartySize` value object: the number of guests on a
 * booking, guaranteed ≥ 1. Immutable; compared by value. Your spec is
 * `party-size.vo.spec.ts`.
 *
 * Note (UL §Guest): this count is distinct from the Identity `guest` role and
 * from the booker. The capacity check (`partySize ≤ listing.capacity`) is NOT
 * here — it lives in the application handler (cross-aggregate).
 */
export class PartySize {
  private constructor(private readonly _value: number) {}

  static create(value: number): PartySize {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error('Invalid party size: must be an integer and >= 1');
    }

    return new PartySize(value);
  }

  get value(): number {
    return this._value;
  }

  equals(other: PartySize): boolean {
    return this._value === other._value;
  }
}
