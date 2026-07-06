import { randomUUID } from 'node:crypto';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';
import { InvalidHoldStateException } from '@/inventory/domain/exceptions/invalid-hold-state.exception';

/** Props to place a brand-new Hold (id/status/expiry derived here). */
export interface NewHoldProps {
  listingId: string;
  dateRange: DateRange;
  /** TTL from now in minutes; the tentative claim expires after this. */
  ttlMinutes: number;
}

/** Full snapshot to restore a Hold from persistence. */
export interface HoldSnapshot {
  id: string;
  listingId: string;
  dateRange: DateRange;
  status: HoldStatus;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * BC-2 `Hold` aggregate root — a TTL-bound exclusive claim on a listing's date
 * range. Small and high-write by design: the cross-hold non-overlap invariant is
 * NOT enforced here (it spans aggregates) but by the DB `EXCLUDE` constraint. The
 * aggregate only owns its own lifecycle: Active → Committed / Released / Expired.
 *
 * State machine (each method guard → mutate):
 *   Active   --commit()-->  Committed
 *   Active   --expire()-->  Expired
 *   Active|Committed --release()--> Released
 */
export class Hold {
  private constructor(
    private readonly _id: string,
    private readonly _listingId: string,
    private readonly _dateRange: DateRange,
    private _status: HoldStatus,
    private readonly _expiresAt: Date,
    private readonly _createdAt: Date,
  ) {}

  static create(props: NewHoldProps): Hold {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + props.ttlMinutes * 60_000);
    return new Hold(
      randomUUID(),
      props.listingId,
      props.dateRange,
      HoldStatus.Active,
      expiresAt,
      now,
    );
  }

  static reconstitute(snapshot: HoldSnapshot): Hold {
    return new Hold(
      snapshot.id,
      snapshot.listingId,
      snapshot.dateRange,
      snapshot.status,
      snapshot.expiresAt,
      snapshot.createdAt,
    );
  }

  /** Active → Committed (on payment confirmed). Permanent taking. */
  commit(): void {
    if (this._status !== HoldStatus.Active) {
      throw new InvalidHoldStateException(this._status, 'commit');
    }
    this._status = HoldStatus.Committed;
  }

  /** Active|Committed → Released (on cancel). Returns nights to supply. */
  release(): void {
    if (
      this._status !== HoldStatus.Active &&
      this._status !== HoldStatus.Committed
    ) {
      throw new InvalidHoldStateException(this._status, 'release');
    }
    this._status = HoldStatus.Released;
  }

  /** Active → Expired (TTL elapsed, scheduled job). */
  expire(): void {
    if (this._status !== HoldStatus.Active) {
      throw new InvalidHoldStateException(this._status, 'expire');
    }
    this._status = HoldStatus.Expired;
  }

  get id(): string {
    return this._id;
  }

  get listingId(): string {
    return this._listingId;
  }

  get dateRange(): DateRange {
    return this._dateRange;
  }

  get status(): HoldStatus {
    return this._status;
  }

  get expiresAt(): Date {
    return new Date(this._expiresAt);
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }
}
