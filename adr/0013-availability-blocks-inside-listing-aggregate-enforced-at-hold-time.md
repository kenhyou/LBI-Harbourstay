# ADR-0013: Availability blocks live inside the Listing aggregate; enforced at hold time

- **Status:** Accepted
- **Date:** 2026-07-11
- **Slice:** S6b (Availability blocks + host bookings)
- **Deciders:** Ken (with Claude Code)

## Context

S6b lets a host mark date ranges on their listing as **unavailable** (maintenance, personal
use, off-season). Two modelling questions fall out:

1. **Where do blocked ranges belong?** A blocked range is host-set supply data. It could be its
   own aggregate (like `Hold`), a child of `Listing`, or a loose table the query side reads.
2. **What makes a block actually *do* something?** A row in a table is inert. A block must
   prevent a guest from booking the range — and that decision happens in a *different* place
   (the booking/hold path, BC-1 ↔ BC-2 Partnership) from where the block is authored.

The `Hold` precedent pulls one way: S3 deliberately made `Hold` its **own** small aggregate,
*not* a child of `Listing`, because the overbooking invariant is **cross-hold** and high-write —
putting holds under `Listing` would serialize every booking on that listing behind a
whole-listing load+lock (see ADR-0007). It would be easy to copy that reasoning to blocks. But
blocks are not holds.

## Decision

**Blocks are a child collection *inside* the `Listing` aggregate; the no-overlap-between-blocks
invariant is the aggregate's; a blocked range is enforced against guests at hold-placement time
via the existing S3 seam.**

### 1. Blocks belong to the `Listing` aggregate (unlike `Hold`)
`Listing` owns an `AvailabilityBlock` child collection (each = an id + a `DateRange`). The host
edits them through `listing.block(range)` / `listing.unblock(blockId)`, and the aggregate enforces
its own invariant: a new block may **not overlap an existing block** on the same listing
(`OverlappingBlockException` → 409), and `unblock` of an unknown id throws
`BlockNotFoundException` → 404. This is the *opposite* of the `Hold` decision, and deliberately:
- Blocks change on the **host cadence** — low frequency, human-driven — so the "load the whole
  listing to touch one" cost that damns holds is irrelevant here (DESIGN.md §BC-2 says exactly
  this: the Listing owns "host-set data that changes on the host cadence: definition, price
  rules, blocked dates").
- The block invariant is **within one listing** (no two of *its* blocks overlap), so a single
  aggregate root *can* own it — whereas the hold invariant spans holds and needs the DB.

The repository persists the child collection by an **id-keyed diff inside the write transaction**
(insert new blocks, delete removed ones); `reconstitute` loads the listing's `isBlocked=true`
rows back into the aggregate. The `availability_block` table already existed (S1, for the
read-side hint), so no migration was needed — only the write path is new.

### 2. Enforcement is at hold time, through the seam S3 already built
A block only matters if a guest can't book over it. That check lives in the **booking/hold path**,
not the block-authoring path: `CreateBookingHandler` calls
`ListingInventoryQuery.hasBlockingBlock(listingId, range)` and throws `DatesNotAvailableException`
(→ 409) on a half-open overlap with an `isBlocked=true` range. **This seam was designed in S3**
(DESIGN.md §BC-2: "a Hold can be placed only on dates with no overlapping active/committed hold
AND no `AvailabilityBlock`") but was never exercisable — nothing could *create* a block until
S6b. S6b makes it real and proves it, rather than inventing a second enforcement path.

## Alternatives considered

| Option | Why not |
|---|---|
| **Block as its own aggregate** (mirror `Hold`) | The reasons `Hold` is separate (cross-hold invariant, high write frequency, lock-contention) do not apply to blocks (single-listing invariant, host-cadence writes). A separate aggregate would add a root and a repository for no invariant benefit. |
| **Blocks as a loose table the read side owns** | Then the no-overlap invariant has no owner and drifts; and the aggregate that *is* the supply authority wouldn't know its own blocked dates. |
| **Enforce blocks with a second check at booking creation (app-service `if`)** | S3 already put the check behind `hasBlockingBlock` at the hold seam; a parallel check would be a second source of truth to keep in sync. Reuse the seam. |
| **`unblock` unknown id → no-op (200)** | Hides stale-id / concurrent-edit bugs. The caller already passed the ownership gate, so "no such block on your listing" is honest, non-leaking information → 404. |

## Consequences

- **Positive:** the block set has a real owner and a real invariant (no self-overlap), unit-tested;
  the aggregate stays framework/ORM-free (the child collection is plain domain objects, persisted by
  the mapper's diff). Enforcement reuses one seam, so "blocked" means one thing everywhere. **Proven
  at the storage layer** (integration + live verify): a guest booking overlapping a block is rejected
  409 with **zero `booking`/`hold` rows written** (transaction rolled back), while a non-overlapping
  range and a half-open boundary stay (check-in == block-end books fine).
- **Trade-offs:** block/unblock loads the whole `Listing` + its blocks and rewrites the collection —
  fine at host-cadence write rates, but not a path to run hot; if block editing ever became
  high-frequency this boundary would need revisiting (the `Hold` reasoning would start to bite). A
  new block does **not** retro-cancel an already-confirmed booking on those dates — blocks gate
  *future* holds only; reconciling a block against existing bookings is out of MVP scope.
- **Follow-ups:** per-range `price` overrides and a block `reason` (the table already has a `price`
  column; deferred with the rate-rules cut); host-facing warning when a block overlaps an existing
  booking; surfacing blocked ranges in the guest-side availability calendar.

## Learning-build note

Built in the S6 **learn-by-reading** mode (Ken opted out of scaffold-and-fill for S6; recorded in
`docs/build/PROGRESS.md`) — the aggregate collection, handlers, queries, and the
`availability-manager` frontend were Claude-written as commented teaching artifacts. Unlike S6a
(where the verifier caught a stuck-button bug), S6b passed verification first try. The
`availability-manager` deliberately applies the S6a lesson: it resets its in-flight flags on the
success path, because client state persists across a re-render — the exact bug S6a shipped. Mode to
be reconfirmed at S7.
