import { DateRange } from '@/booking/domain/vo/date-range.vo';
import { PartySize } from '@/booking/domain/vo/party-size.vo';
import { Money } from '@/booking/domain/vo/money.vo';
import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';
import { InvalidBookingStateException } from '@/booking/domain/exceptions/invalid-booking-state.exception';
import type { CancellationOutcome } from '@/booking/domain/policies/cancellation-policy';
import { randomUUID } from 'node:crypto';

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
  /** Set only for a cancelled booking; null/absent otherwise (S5). */
  cancelledAt?: Date | null;
  /** Computed refund in minor units; null/absent unless cancelled (S5). */
  refundAmount?: number | null;
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
 * - `cancel(outcome, now)` allowed from PendingPayment or Confirmed, NEVER after
 *   Completed; it must ALSO honour the evaluated `outcome` (S5 — see below).
 * - `priceSnapshot` is set once at creation and never mutated afterwards.
 * On a disallowed transition, throw `InvalidBookingStateException(from, attempted)`.
 *
 * ─── S5 FILL: cancel() widening ───────────────────────────────────────────────
 * The chosen signature is `cancel(outcome: CancellationOutcome, now: Date): void`.
 * The caller (Cancel-Booking handler) evaluates the `CancellationPolicy` and hands
 * the `outcome` in; the aggregate does NOT own the refund tiers, it just records
 * the result alongside its own status guard. YOUR job (stubbed below):
 *   1. keep the status guard — cancel only from PendingPayment | Confirmed, else
 *      throw `InvalidBookingStateException(status, Cancelled)`;
 *   2. if `outcome.allowed` is false, throw `InvalidBookingStateException` too
 *      (the policy forbade it — e.g. inside the 48h window);
 *   3. on success: set status = Cancelled, record `_cancelledAt = now` and
 *      `_refundAmount = outcome.refundAmount` (minor units).
 * The two new getters (`cancelledAt` / `refundAmount`) are mechanical plumbing and
 * are already wired (they expose the private fields, null until cancelled) so the
 * mapper/read side compile; only the cancel() DECISION is yours.
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
    private _cancelledAt: Date | null,
    private _refundAmount: number | null,
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
      null,
      null,
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
      snapshot.cancelledAt ?? null,
      snapshot.refundAmount ?? null,
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

  /**
   * PendingPayment | Confirmed → Cancelled (never after Completed), honouring the
   * evaluated `outcome`. On success, records `cancelledAt`/`refundAmount`.
   *
   * TODO(you): implement per the "S5 FILL" note in the class header and delete the
   * throw. Guard the status, reject when `!outcome.allowed`, then mutate + record.
   * Your spec: the `cancel` cases in `booking.model.spec.ts`.
   */
  cancel(outcome: CancellationOutcome, now: Date): void {
    if (
      this._status !== BookingStatus.PendingPayment &&
      this._status !== BookingStatus.Confirmed
    ) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Cancelled,
      );
    }

    if (!outcome.allowed) {
      throw new InvalidBookingStateException(
        this._status,
        BookingStatus.Cancelled,
      );
    }

    this._status = BookingStatus.Cancelled;
    this._cancelledAt = now;
    this._refundAmount = outcome.refundAmount;
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

  /** The moment cancel() ran, or null if the booking was never cancelled (S5). */
  get cancelledAt(): Date | null {
    return this._cancelledAt ? new Date(this._cancelledAt) : null;
  }

  /** Computed refund in minor units, or null if never cancelled (S5). */
  get refundAmount(): number | null {
    return this._refundAmount;
  }
}
