import { randomUUID } from 'node:crypto';

/**
 * The `Listing` aggregate's OWN identity, modelled as a value object (hexagon
 * rule: an aggregate's own id is a VO; a reference to a FOREIGN aggregate — e.g.
 * `hostId` — stays a plain `string`). Wrapping the id in a type stops it being
 * accidentally swapped with any other bare `string` in a signature, and gives the
 * aggregate one clear place to mint a new identity.
 *
 * Immutable; compared by value. Note the `Hold` aggregate (older, S3) kept its id
 * as a raw string; `Listing` follows the convention more strictly as a worked
 * example of the "own id is a VO" rule.
 */
export class ListingId {
  private constructor(private readonly _value: string) {}

  /** Mint a brand-new identity for a listing being created. */
  static generate(): ListingId {
    return new ListingId(randomUUID());
  }

  /** Rebuild from a persisted / trusted string (e.g. a DB row, a URL param). */
  static fromString(value: string): ListingId {
    if (!value || value.trim().length === 0) {
      throw new Error('ListingId cannot be empty');
    }
    return new ListingId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ListingId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
