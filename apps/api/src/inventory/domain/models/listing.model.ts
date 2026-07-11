import { ListingId } from '@/inventory/domain/vo/listing-id.vo';
import { Capacity } from '@/inventory/domain/vo/capacity.vo';
import { Money } from '@/inventory/domain/vo/money.vo';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { AvailabilityBlock } from '@/inventory/domain/models/availability-block.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';
import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';
import { InvalidListingStateException } from '@/inventory/domain/exceptions/invalid-listing-state.exception';
import { OverlappingBlockException } from '@/inventory/domain/exceptions/overlapping-block.exception';
import { BlockNotFoundException } from '@/inventory/domain/exceptions/block-not-found.exception';

/**
 * The mutable, editable part of a listing — everything a host can change via the
 * upsert form. Shared by `create()` (a brand-new listing) and `updateDetails()`
 * (a full-replace edit of an existing one), which is why it excludes identity,
 * ownership, status and timestamps: those are NOT host-editable through this seam.
 *
 * `capacity` / `basePrice` arrive as primitives and are wrapped into their VOs
 * INSIDE the aggregate, so the invariants (`capacity >= 1`, `basePrice >= 0`) are
 * enforced in one place no matter which entry point is used.
 */
export interface ListingDetails {
  title: string;
  description: string;
  type: ListingType;
  location: string;
  capacity: number;
  /** Minor units (integer cents, ADR-0005), ≥ 0. */
  basePrice: number;
  images: string[];
}

/** Props to create a brand-new listing — the editable details plus its owner. */
export interface NewListingProps extends ListingDetails {
  /** The authenticated host who owns this listing (foreign ref → plain string). */
  hostId: string;
}

/** A single persisted block (id + its half-open range) inside a listing snapshot. */
export interface AvailabilityBlockSnapshot {
  id: string;
  checkIn: Date;
  checkOut: Date;
}

/** Full snapshot to restore a Listing from persistence (`reconstitute`). */
export interface ListingSnapshot {
  id: string;
  hostId: string;
  title: string;
  description: string;
  type: ListingType;
  location: string;
  capacity: number;
  basePrice: number;
  images: string[];
  status: ListingStatus;
  createdAt: Date;
  /**
   * The host's currently-set blocks (isBlocked rows). Optional so existing
   * callers that only touch the details/status (create-booking's lightweight
   * loads never reconstitute the full aggregate; publish/update DO, and now load
   * the blocks too) don't have to supply it — absent means "no blocks".
   */
  blocks?: AvailabilityBlockSnapshot[];
}

/**
 * BC-2 `Listing` aggregate root — the canonical, WRITE-side model of a bookable
 * unit. (BC-5 Listing Catalog, S1, only ever *reads* projections off the same
 * physical `listing` table — see ADR-0004. This is the write owner that S1
 * deferred as a stub; S6a fills it in.)
 *
 * What the aggregate OWNS (its invariants, enforced here — never in a handler or
 * a controller):
 *   - a non-empty title;
 *   - a valid `Capacity` (≥ 1) and a valid `Money` base price (≥ 0), delegated to
 *     those VOs so the guards live with the type they protect;
 *   - a publication lifecycle: Unpublished ⇄ Published, transitioned only via
 *     `publish()` / `unpublish()`, each of which guards its precondition.
 *
 * What it deliberately does NOT own:
 *   - `hostId` is a reference to a FOREIGN aggregate (the BC-7 host user), so it
 *     is a plain `string`, not a VO — and it is IMMUTABLE: there is no setter and
 *     `updateDetails()` never touches it. Ownership is assigned once, at creation.
 *   - Ownership *authorization* (may THIS host edit THIS listing?) is not a
 *     listing invariant; it is an application concern enforced in the command
 *     handler (the 404-no-leak gate). The aggregate assumes the caller is allowed.
 *
 * Zero framework/ORM imports — pure domain, unit-testable with no mocks.
 */
export class Listing {
  private constructor(
    private readonly _id: ListingId,
    private readonly _hostId: string,
    private _title: string,
    private _description: string,
    private _type: ListingType,
    private _location: string,
    private _capacity: Capacity,
    private _basePrice: Money,
    private _images: string[],
    private _status: ListingStatus,
    private readonly _createdAt: Date,
    // The host's blocked ranges — child entities the aggregate owns and mutates
    // ONLY through block()/unblock(), so the no-overlap invariant is enforced in
    // one place. Never exposed by reference (the getter copies the array out).
    private readonly _blocks: AvailabilityBlock[],
  ) {}

  /**
   * Create a brand-new listing. The aggregate mints its own `ListingId`, stamps
   * the owning `hostId`, and starts life `Unpublished` — a host writes a draft and
   * then explicitly `publish()`es it; nothing goes live by accident.
   */
  static create(props: NewListingProps): Listing {
    return new Listing(
      ListingId.generate(),
      props.hostId,
      Listing.assertTitle(props.title),
      props.description,
      props.type,
      props.location,
      Capacity.create(props.capacity),
      Money.create(props.basePrice),
      [...props.images], // defensive copy — don't alias the caller's array
      ListingStatus.Unpublished,
      new Date(),
      [], // a brand-new listing has no blocks yet
    );
  }

  /**
   * Restore a Listing from a persisted snapshot. No invariant re-checking beyond
   * the VOs' own guards: a row already in the DB is assumed valid (it passed
   * `create`/`updateDetails` on the way in). `create` vs `reconstitute` is the
   * canonical split — new identity/defaults vs faithful rehydration.
   */
  static reconstitute(snapshot: ListingSnapshot): Listing {
    return new Listing(
      ListingId.fromString(snapshot.id),
      snapshot.hostId,
      snapshot.title,
      snapshot.description,
      snapshot.type,
      snapshot.location,
      Capacity.create(snapshot.capacity),
      Money.create(snapshot.basePrice),
      [...snapshot.images],
      snapshot.status,
      snapshot.createdAt,
      // Rehydrate each persisted block into its child entity via the trusted
      // reconstitute path (no re-validation of already-stored ranges).
      (snapshot.blocks ?? []).map((b) =>
        AvailabilityBlock.reconstitute(
          b.id,
          DateRange.reconstitute(b.checkIn, b.checkOut),
        ),
      ),
    );
  }

  /**
   * Full-replace edit of the host-editable details (PUT-like — the contract sends
   * every field, so we overwrite every field). Identity, owner, status and
   * createdAt are untouched. Re-validates through the same guards/VOs as `create`,
   * so an edit can never sneak past an invariant that creation enforces. Editing
   * is allowed in ANY publication status (a host may fix a typo on a live listing).
   */
  updateDetails(details: ListingDetails): void {
    this._title = Listing.assertTitle(details.title);
    this._description = details.description;
    this._type = details.type;
    this._location = details.location;
    this._capacity = Capacity.create(details.capacity);
    this._basePrice = Money.create(details.basePrice);
    this._images = [...details.images];
  }

  /** Unpublished → Published (make the listing guest-visible). Guarded. */
  publish(): void {
    if (this._status !== ListingStatus.Unpublished) {
      // Already Published → an illegal transition. We throw rather than no-op
      // (see InvalidListingStateException for the rationale).
      throw new InvalidListingStateException(this._status, 'publish');
    }
    this._status = ListingStatus.Published;
  }

  /** Published → Unpublished (hide the listing from guests again). Guarded. */
  unpublish(): void {
    if (this._status !== ListingStatus.Published) {
      throw new InvalidListingStateException(this._status, 'unpublish');
    }
    this._status = ListingStatus.Unpublished;
  }

  // ── Availability blocks (S6b) ────────────────────────────────────────────────
  // The host takes date ranges off the market. The aggregate owns the collection
  // and its ONE cross-block invariant (no two blocks on this listing overlap), so
  // that rule can never be bypassed by editing the child entity directly.

  /**
   * Block a half-open `[checkIn, checkOut)` range on this listing.
   *
   * Guard → mutate → return: reject the block if it OVERLAPS any block the host
   * already set (half-open, so a block ending on the day another begins is fine),
   * otherwise mint a new `AvailabilityBlock` child, append it, and return it so the
   * caller (handler) knows the new id without re-reading the collection.
   *
   * The range itself was already validated by `DateRange.create` (check-in strictly
   * before check-out) at the call site — the aggregate only owns the CROSS-block
   * rule here, not the intra-range one the VO guards.
   */
  block(range: DateRange): AvailabilityBlock {
    const clash = this._blocks.some((existing) =>
      existing.range.overlaps(range),
    );
    if (clash) {
      throw new OverlappingBlockException(this._id.value);
    }
    const block = AvailabilityBlock.create(range);
    this._blocks.push(block);
    return block;
  }

  /**
   * Remove the block with `blockId`. Throws `BlockNotFoundException` (→ 404) if no
   * such block exists on this listing — see that exception for why we fail loud
   * rather than no-op. Mutates the owned array in place (the field is `readonly`
   * as a reference, but its contents are the aggregate's to manage).
   */
  unblock(blockId: string): void {
    const index = this._blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new BlockNotFoundException(blockId);
    }
    this._blocks.splice(index, 1);
  }

  /** Non-empty-title invariant, in one place so create + updateDetails share it. */
  private static assertTitle(title: string): string {
    if (!title || title.trim().length === 0) {
      throw new InvalidListingDetailsException('title must not be empty');
    }
    return title;
  }

  // ── Getters ────────────────────────────────────────────────────────────────
  // Expose primitives (not the VOs) at the read edge so the infra mapper and the
  // application summary-projection can build DTOs without reaching into VO
  // internals. `createdAt` and `images` are copied out so callers can't mutate
  // the aggregate's internals by reference.

  /** The aggregate's own id, as the plain string used across ports/persistence. */
  get id(): string {
    return this._id.value;
  }

  /** The owning host (foreign ref). Read-only — ownership is immutable. */
  get hostId(): string {
    return this._hostId;
  }

  get title(): string {
    return this._title;
  }

  get description(): string {
    return this._description;
  }

  get type(): ListingType {
    return this._type;
  }

  get location(): string {
    return this._location;
  }

  get capacity(): number {
    return this._capacity.value;
  }

  get basePrice(): number {
    return this._basePrice.amount;
  }

  get images(): string[] {
    return [...this._images];
  }

  get status(): ListingStatus {
    return this._status;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  /**
   * The host's current blocks, as a COPY of the array (callers can't add/remove a
   * block by mutating what they get back — only `block()`/`unblock()` can). The
   * child entities themselves are immutable, so a shallow copy is enough.
   */
  get blocks(): AvailabilityBlock[] {
    return [...this._blocks];
  }
}
