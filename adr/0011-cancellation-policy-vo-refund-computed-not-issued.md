# ADR-0011: Cancellation policy as a VO evaluated at cancel time; refund computed, not issued

- **Status:** Accepted
- **Date:** 2026-07-11
- **Slice:** S5 (My Bookings + Cancel)
- **Deciders:** Ken (with Claude Code)

## Context

S5 lets a guest cancel a booking. A cancellation has two questions bundled inside it:

1. **May this booking be cancelled at all?** — a state-machine question (you cannot
   cancel a `Completed`, `Expired`, or already-`Cancelled` booking).
2. **What refund does the guest get?** — a *policy* question that depends on time-to-
   check-in and originates from the listing, not the booking (DESIGN.md §34): full
   refund far out, partial closer in, none inside a cutoff.

These must not be conflated. The refund tiers are business rules that will vary per
listing later; the "can it legally transition" rule is the `Booking` aggregate's own
invariant and must hold regardless of what any collaborator says.

The PRD keeps **real settlement out of scope** (§2 N4, §6): Stripe is test-mode only,
no money moves. So a cancellation must *compute and record* a refund, not issue one.

## Decision

**Model the cancellation policy as a domain policy VO, evaluated at cancel time, and
pass its result into the aggregate.**

- `CancellationPolicy.evaluate(status, checkIn, now, priceSnapshot): CancellationOutcome`
  where `CancellationOutcome = { allowed, refundAmount, reason? }`. It is a pure,
  framework-free domain object. `now` is **injected**, never `Date.now()`, so the
  tiers are deterministically testable. Tiers (the MVP `standard()` policy):
  `PendingPayment` → allowed, refund 0 (nothing captured); Confirmed ≥ 7 days out →
  100%; 2–7 days → 50% (floored to whole minor units — never over-refund, ADR-0005);
  < 48 h or on/after check-in → rejected; any terminal status → rejected.
- **The aggregate keeps its own guard.** `Booking.cancel(outcome, now)` allow-lists the
  cancellable source states (`PendingPayment | Confirmed`) and throws
  `InvalidBookingStateException` on anything else — *and* throws when `!outcome.allowed`.
  Two independent gates: the aggregate owns "can this transition happen"; the policy
  owns "what's the refund / is it within the window". The aggregate never delegates its
  state-machine integrity to the policy's boolean.
- **The policy arrives through a port.** `CancellationPolicyProviderPort.forListing(id)`
  returns the policy; today every listing shares `CancellationPolicy.standard()`, but a
  per-listing policy can arrive later without touching the aggregate or the handler.
- **Refund is recorded, not issued.** `cancel()` stores `refundAmount` (minor units) and
  `cancelledAt` on the booking. No Stripe refund call. The number is surfaced in the UI
  and the `BookingCancelled` outbox event; actual settlement is a future concern.
- **Cancel is saga-compensation from the other direction.** The `CancelBooking` command
  handler, in one `TransactionManagerPort.run(...)`: `booking.cancel(outcome, now)` +
  `hold.release()` (guarded to releasable states) + save both + enqueue
  `BookingCancelled` to the Transactional Outbox (ADR-0009) — the same atomic shape as
  the S4 `onPaymentFailed` compensation, triggered by a guest instead of Stripe.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Policy VO evaluated at cancel time (chosen) | separates "can transition" from "what refund"; pure + deterministic; per-listing policy later via the port; refund auditable | two collaborators to coordinate (policy + aggregate) | matches DESIGN.md and keeps the aggregate's invariant its own |
| Rules stored on the `Booking` | self-contained | freezes a listing's policy onto every booking; rules can't evolve; bloats the aggregate | rules originate from the listing, not the booking (DESIGN.md §34) |
| A `CancellationService` (domain service) owning cancel | one place for the flow | pulls the transition decision out of the aggregate — the anemic-domain smell | the transition guard belongs *in* the aggregate |
| Issue the refund via Stripe now | "real" | out of scope (PRD §2/§6); test-mode only; adds a failure mode + a second saga | deferred; compute-and-record is the correct MVP |

## Consequences

- Positive: the refund logic is pure and boundary-tested (exact 7-day / 48-h edges, the
  floor, terminal-status rejection); the aggregate rejects an illegal cancel even when
  handed an `allowed: true` outcome (regression-tested); `InvalidBookingStateException`
  maps to **409**, so a too-late or wrong-state cancel is a clean client error, not a 500;
  the hold is released and the guest notified atomically. Verified end-to-end: a
  PendingPayment cancel drove `Cancelled` + `refundAmount 0` + `hold released` + exactly
  one relayed `BookingCancelled` event, in the browser.
- Negative / trade-offs: the recorded `refundAmount` is a *promise* with no money behind
  it yet — a real integration (Stripe Refunds) must reconcile it later, and until then the
  number is advisory. The single `standard()` policy is hard-wired behind the port.
- Follow-ups: per-listing policies loaded through `CancellationPolicyProviderPort`; a real
  refund saga when settlement enters scope; host-initiated cancellation (different tiers).

## Learning-build note

Ken wrote the policy VO (`evaluate`) and `Booking.cancel()` (the two domain pieces). The
`CancelBooking` command handler and the React cancel dialog were written by Claude at
Ken's request (first command handler; no React experience yet) — recorded as a fill-file
opt-out in `docs/build/PROGRESS.md`. The next slice defaults back to Ken writing the
handlers.
