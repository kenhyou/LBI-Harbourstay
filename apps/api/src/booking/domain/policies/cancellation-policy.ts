import { BookingStatus } from '@/booking/domain/enums/booking-status.enum';

/**
 * KEN'S FILL FILE — stub. `CancellationPolicy` domain policy (BC-1). The refund
 * rules a Booking consults when a guest cancels. This RICHER policy SUPERSEDES the
 * trivial `CancellationPolicy` interface that used to live inside `booking.model.ts`
 * (only `canCancel(status)`) — the model's `cancel()` now takes a
 * `CancellationOutcome` produced here.
 *
 * `CancellationOutcome` is a declarative shape (like an enum) — it is FULLY defined
 * for you. The work is the `evaluate(...)` body: the tiered refund decision.
 *
 * ─── Target tiers `evaluate` must implement (refundAmount in MINOR UNITS) ───
 *   • status === PendingPayment          → allowed, refund 0
 *       (no money captured yet — nothing to refund, but cancel is permitted)
 *   • Confirmed, ≥ 7 days before checkIn  → allowed, 100% refund (priceSnapshot)
 *   • Confirmed, 2–7 days before checkIn  → allowed, 50% refund
 *       (Math.floor to stay in whole minor units — never over-refund)
 *   • Confirmed, < 48h before checkIn, OR now on/after checkIn
 *                                         → REJECTED (allowed:false, refund 0,
 *                                            reason explaining why)
 *   • any other status (Completed/Cancelled/Expired/NoShow)
 *                                         → REJECTED (not cancellable)
 *
 * Boundaries (pin them — the spec asserts the edges):
 *   • "≥ 7 days" is inclusive: exactly 7×24h before checkIn → 100%.
 *   • "< 48h" is the rejection edge: 47h before checkIn → rejected;
 *     the 2-day tier starts at ≥ 48h.
 * Compute the gap from the passed-in `now` and `checkIn` — DO NOT call
 * `Date.now()`/`new Date()` inside `evaluate` (determinism; the spec injects `now`).
 *
 * Keep this file framework/ORM-free (pure domain).
 *
 * Your spec is `cancellation-policy.spec.ts` — implement `evaluate` to make it
 * green; do not weaken the spec.
 */

/**
 * The declarative result of consulting the policy. `refundAmount` is in MINOR
 * UNITS (cents); it is 0 when `allowed` is false. `reason` is a human-readable
 * explanation, set on a rejection (and optional otherwise).
 */
export interface CancellationOutcome {
  allowed: boolean;
  refundAmount: number;
  reason?: string;
}

export class CancellationPolicy {
  private constructor() {}

  /**
   * The MVP single standard policy (same rules for every listing). The provider
   * seam (`CancellationPolicyProviderPort`) hands this back for now; a per-listing
   * policy can arrive later without touching callers.
   */
  static standard(): CancellationPolicy {
    return new CancellationPolicy();
  }

  /**
   * Evaluate whether a booking in `status` may be cancelled at `now`, and how much
   * is refundable. See the tier table in the file header. `priceSnapshot` is the
   * frozen all-in total in minor units.
   *
   * TODO(you): implement the tiered decision and delete the throw. Return a
   * `CancellationOutcome`. No `Date.now()` — use the `now` argument.
   */
  evaluate(
    status: BookingStatus,
    checkIn: Date,
    now: Date,
    priceSnapshot: number,
  ): CancellationOutcome {
    if (
      status !== BookingStatus.Confirmed &&
      status !== BookingStatus.PendingPayment
    ) {
      return {
        allowed: false,
        refundAmount: 0,
        reason: 'Booking is not in a cancellable state',
      };
    }

    if (status === BookingStatus.PendingPayment) {
      return {
        allowed: true,
        refundAmount: 0,
      };
    }

    const timeUntilCheckIn = checkIn.getTime() - now.getTime();
    const timeUntilCheckInDays = timeUntilCheckIn / (1000 * 60 * 60 * 24);

    if (timeUntilCheckInDays >= 7) {
      return {
        allowed: true,
        refundAmount: priceSnapshot,
      };
    }

    if (timeUntilCheckInDays >= 2 && timeUntilCheckInDays < 7) {
      return {
        allowed: true,
        refundAmount: Math.floor(priceSnapshot / 2),
      };
    }

    return {
      allowed: false,
      refundAmount: 0,
      reason: 'Booking is too close to check-in date',
    };
  }
}
