import { randomUUID } from 'node:crypto';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';

/**
 * A host-set "these dates are off the market" block on a listing — a CHILD ENTITY
 * of the `Listing` aggregate (S6b), NOT an aggregate root of its own. Two reasons
 * it lives inside `Listing` rather than standing alone:
 *
 *   1. It has NO lifecycle or invariants independent of its listing: a block is
 *      just an id + a half-open `[checkIn, checkOut)` range that the host adds or
 *      removes. All the interesting rules (no valid range may overlap another
 *      block on the SAME listing) are cross-block, so they belong to the thing
 *      that owns the whole set — the `Listing` aggregate — which is exactly why
 *      DESIGN.md §BC-2 keeps blocked dates inside the Listing.
 *   2. It is only ever created/deleted through `Listing.block()` / `unblock()`,
 *      so the aggregate root stays the single consistency boundary.
 *
 * It DOES carry identity (the `id`), which is what makes it an entity and not a
 * pure value object: two blocks with the same range are still distinct rows the
 * host can remove independently. Equality is therefore by id, not by range.
 *
 * The range itself is delegated to BC-2's own `DateRange` VO (half-open, UTC
 * midnight) — the same VO the `Hold` uses — so block overlap and hold overlap
 * share one definition of "touching ranges don't conflict". Framework/ORM-free.
 */
export class AvailabilityBlock {
  private constructor(
    private readonly _id: string,
    private readonly _range: DateRange,
  ) {}

  /**
   * Mint a brand-new block over `range`. The aggregate calls this after it has
   * checked the no-overlap invariant, so this factory itself is unconditional —
   * it only assigns identity. `create` (new id) vs `reconstitute` (persisted id)
   * is the same split the aggregates use.
   */
  static create(range: DateRange): AvailabilityBlock {
    return new AvailabilityBlock(randomUUID(), range);
  }

  /** Restore a persisted block (its stored id + range) — no re-validation. */
  static reconstitute(id: string, range: DateRange): AvailabilityBlock {
    return new AvailabilityBlock(id, range);
  }

  get id(): string {
    return this._id;
  }

  /** The block's half-open `[checkIn, checkOut)` range (the VO, immutable). */
  get range(): DateRange {
    return this._range;
  }
}
