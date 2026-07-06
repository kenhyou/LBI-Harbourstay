# ADR-0007: Prevent overbooking with a Postgres EXCLUDE constraint (not optimistic locking)

- **Status:** Accepted
- **Date:** 2026-07-05
- **Slice:** S3 (Availability + Booking Hold)
- **Deciders:** Ken (with Claude Code)

## Context

The system's most important invariant (PRD §9, STRATEGIC.md Context Map): **no two
overlapping *active/committed* holds may exist on the same listing** — otherwise two guests
double-book the same nights. This invariant is **cross-aggregate**: it spans multiple `Hold`
rows, so no single `Hold` aggregate can see its siblings to enforce it, and it must hold
under concurrency (two guests reserving the same dates at the same instant).

`Hold` is deliberately a small, high-write aggregate (S3 / DESIGN.md BC-2). We need a
mechanism that lets concurrent holds on *different* dates proceed while rejecting only true
overlaps, atomically.

## Decision

Enforce the invariant in **Postgres** with an exclusion constraint on the `hold` table
(requires the `btree_gist` extension):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "hold" ADD CONSTRAINT no_overlapping_holds
  EXCLUDE USING gist ("listingId" WITH =, daterange("checkIn","checkOut",'[)') WITH &&)
  WHERE (status IN ('active','committed'));
```

A concurrent overlapping insert fails with SQLSTATE `23P01`; the `HoldRepository` (infra)
catches it and raises `OverlappingHoldException`, which the presenter maps to **409**. The
range is **half-open `[checkIn, checkOut)`**, so a hold ending on day D and another starting
on day D do **not** conflict (guest checks out and another checks in the same day). Prisma
cannot express `EXCLUDE`, so the migration SQL is **hand-edited**.

The `Booking` + `Hold` writes commit in **one transaction** (the Partnership seam) via the
transaction-manager port (`@nestjs-cls/transactional`), so a rejected hold rolls back the
whole booking — no orphaned `Booking`.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| DB `EXCLUDE` on `hold` (chosen) | atomic + correct under concurrency; concurrent non-overlapping holds proceed; the DB is the single arbiter | needs `btree_gist` + hand-edited migration; a raw `23P01` catch in infra | the invariant is cross-row and concurrent — the DB is the only place it can be enforced without serializing |
| Optimistic `version` on `Hold` | pure-Prisma; no extension | a `version` is per-row — it cannot see *other* holds, so it cannot express a cross-row overlap rule at all | doesn't model the invariant |
| Optimistic `version` on `Listing` | expresses "serialize changes to this listing" | must load + lock the whole listing row to place any hold → serializes *every* booking for a popular listing; a hot-listing bottleneck | kills concurrency for exactly the listings that need it most |
| App-level "check then insert" | simple to read | a classic TOCTOU race — two requests both check "free" then both insert | not correct under concurrency (the whole point) |

## Consequences

- Positive: double-booking is impossible even under real parallelism (proven by an
  integration race test + a live two-request race — exactly one wins); non-overlapping
  concurrent bookings are unaffected; the guarantee lives in one declarative constraint.
- Negative / trade-offs: requires the `btree_gist` extension (fine on Postgres, a portability
  cost if the DB ever changed); one migration is hand-authored (Prisma can't emit `EXCLUDE`);
  infra must translate a driver-specific error code (`23P01`).
- Follow-ups: S4 commits the Hold (`Active → Committed`) on payment success and releases it on
  failure/expiry — both keep the same constraint honored. Referenced from `docs/DESIGN.md`
  BC-2. This is the invariant the PRD calls the heart of the system.
