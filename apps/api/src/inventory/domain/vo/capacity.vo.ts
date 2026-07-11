import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';

/**
 * A listing's maximum party size — the number of guests it can host. The
 * invariant `capacity >= 1` (an integer) lives HERE, in the value object, so it
 * is impossible to construct a `Listing` with a nonsensical capacity: the
 * aggregate holds a `Capacity`, not a raw `number`, so every path that sets
 * capacity flows through this guard.
 *
 * Immutable; compared by value. Throws a domain exception (not a plain `Error`)
 * so the HTTP layer can map the failure to a meaningful status (422) instead of
 * a generic 500 — the exception IS part of the API contract.
 */
export class Capacity {
  private constructor(private readonly _value: number) {}

  static create(value: number): Capacity {
    if (!Number.isInteger(value)) {
      throw new InvalidListingDetailsException(
        `capacity must be a whole number, got ${value}`,
      );
    }
    if (value < 1) {
      throw new InvalidListingDetailsException(
        `capacity must be at least 1, got ${value}`,
      );
    }
    return new Capacity(value);
  }

  get value(): number {
    return this._value;
  }

  equals(other: Capacity): boolean {
    return this._value === other._value;
  }
}
