import { DateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money } from '@/booking/domain/vo/money.vo';
import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';
import { InvalidBookingStateException } from '@/booking/domain/exceptions/invalid-booking-state.exception';
import { randomUUID } from 'node:crypto';

/**
 * Cancellation policy applied at cancel time (its rules originate from the
 * listing). Passed in to `cancel()` — the Booking does not own the rules, it just
 * consults them alongside its own status guard.
 */
export interface CancellationPolicy {
  /** True if a booking in `status` may still be cancelled under this policy. */
  canCancel(status: BookingStatus): boolean;
}

/** Props to create a brand-new Booking (id/status/createdAt derived here). */
export interface NewBookingProps {
  guestId: string;
  listingId: string;
  holdId: string;
  dateRange: DateRange;
  partySize: PartySize;
  priceSnapshot: Money;
  holdExpiresAt: Date;
}

/** Full snapshot to restore a Booking from persistence. */
export interface BookingSnapshot {
  id: string;
  guestId: string;
  listingId: string;
  holdId: string;
  dateRange: DateRange;
  partySize: PartySize;
  status: BookingStatus;
  priceSnapshot: Money;
  holdExpiresAt: Date;
  createdAt: Date;
}

/**
 * KEN'S FILL FILE — stub. `Booking` aggregate root (BC-1). The reservation
 * lifecycle: a single-root aggregate that only *references* the Hold, listing,
 * and guest by id (plain strings). It owns the state machine and the frozen
 * `priceSnapshot`. Your spec is `booking.model.spec.ts` — implement to make it
 * green; do not weaken the spec.
 *
 * State graph (no state may be skipped; each method: guard → mutate):
 *   PendingPayment --confirm()--> Confirmed --complete()--> Completed
 *        |                            |
 *        |--expire()--> Expired       |--markNoShow()--> NoShow
 *        |--cancel()--> Cancelled     (Confirmed --cancel(policy)--> Cancelled)
 *
 * Invariants to enforce:
 * - `confirm()` only from PendingPayment.
 * - `complete()` / `markNoShow()` only from Confirmed.
 * - `expire()` only from PendingPayment (the hold TTL elapsed pre-payment).
 * - `cancel()` allowed from PendingPayment or Confirmed, NEVER after Completed;
 *   if a `policy` is passed, it must also permit cancellation from the status.
 * - `priceSnapshot` is set once at creation and never mutated afterwards.
 * On a disallowed transition, throw `InvalidBookingStateException(from, attempted)`.
 */
export class Booking {
  private constructor(
    private readonly _id: string,
    private readonly _guestId: string,
    private readonly _listingId: string,
    private readonly _holdId: string,
    private readonly _dateRange: DateRange,
    private readonly _partySize: PartySize,
    private _status: BookingStatus,
    private readonly _priceSnapshot: Money,
    private readonly _holdExpiresAt: Date,
    private readonly _createdAt: Date,
  ) {}

  /**
   * Create a new booking in `PendingPayment`. Generate a fresh uuid id
   * (`crypto.randomUUID()` is allowed — a runtime primitive) and stamp
   * `createdAt = new Date()`.
   */
  static create(props: NewBookingProps): Booking {
    const id = randomUUID();
    const createdAt = new Date();
    return new Booking(
      id,
      props.guestId,
      props.listingId,
      props.holdId,
      props.dateRange,
      props.partySize,
      BookingStatus.PendingPayment,
      props.priceSnapshot,
      props.holdExpiresAt,
      createdAt,
    );
  }

  /** Restore from a persisted snapshot (no id generation, no events). */
  static reconstitute(snapshot: BookingSnapshot): Booking {
    return new Booking(
      snapshot.id,
      snapshot.guestId,
      snapshot.listingId,
      snapshot.holdId,
      snapshot.dateRange,
      snapshot.partySize,
      snapshot.status,
      snapshot.priceSnapshot,
      snapshot.holdExpiresAt,
      snapshot.createdAt,
    );
  }

  /** PendingPayment → Confirmed (driven by Payment Confirmation). */
  confirm(): void {
    if (this._status !== BookingStatus.PendingPayment) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Confirmed,
      );
    }

    this._status = BookingStatus.Confirmed;
  }

  /** Confirmed → Completed (stay finished). */
  complete(): void {
    if (this._status !== BookingStatus.Confirmed) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Completed,
      );
    }

    this._status = BookingStatus.Completed;
  }

  /** PendingPayment | Confirmed → Cancelled (never after Completed). */
  cancel(policy?: CancellationPolicy): void {
    if (
      this._status !== BookingStatus.PendingPayment &&
      this._status !== BookingStatus.Confirmed
    ) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Cancelled,
      );
    }

    if (policy && !policy.canCancel(this._status)) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Cancelled,
      );
    }

    this._status = BookingStatus.Cancelled;
  }

  /** PendingPayment → Expired (hold TTL elapsed before payment). */
  expire(): void {
    if (this._status !== BookingStatus.PendingPayment) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Expired,
      );
    }

    this._status = BookingStatus.Expired;
  }

  /** Confirmed → NoShow (guest never arrived). */
  markNoShow(): void {
    if (this._status !== BookingStatus.Confirmed) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.NoShow,
      );
    }
    this._status = BookingStatus.NoShow;
  }

  get id(): string {
    return this._id;
  }

  get guestId(): string {
    return this._guestId;
  }

  get listingId(): string {
    return this._listingId;
  }

  get holdId(): string {
    return this._holdId;
  }

  get dateRange(): DateRange {
    return this._dateRange;
  }

  get partySize(): PartySize {
    return this._partySize;
  }

  get status(): BookingStatus {
    return this._status;
  }

  get priceSnapshot(): Money {
    return this._priceSnapshot;
  }

  get holdExpiresAt(): Date {
    return new Date(this._holdExpiresAt);
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }
}
