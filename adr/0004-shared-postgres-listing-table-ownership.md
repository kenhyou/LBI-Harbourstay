# ADR-0004: Listing/AvailabilityBlock tables physically owned by the catalog read side

- **Status:** Accepted
- **Date:** 2026-07-03
- **Slice:** S1 (Listing Search & Detail)
- **Deciders:** Ken (with Claude Code)

## Context

BC-5 (Listing Catalog & Search) is a **CQRS read side** with no write aggregate — it
projects the "marketed offer" from `Listing` + `Availability` data. In the Strategic Design,
that data is **conceptually owned by BC-2 (Availability & Inventory)**, which holds the
canonical `Listing` aggregate and (from S3) the overbooking invariant on `Hold`. The Context
Map records this as `Availability --OHS/Conformist: CQRS read projection--> Catalog` over the
**same Postgres** (STRATEGIC.md §Context Map, Ubiquitous Language §Listing).

S1 needs those tables to exist and be queryable *now*, but BC-2's write side does not land
until S3. So the question: where do the `Listing`/`AvailabilityBlock` Prisma models and the
first migration physically live, and how do we stop S3 from re-modelling them?

## Decision

Introduce the `Listing` and `AvailabilityBlock` tables in the shared `apps/api/prisma`
schema now (migration `20260703114201_s1_listing_catalog`), read by the `catalog` BC's
`ListingQuery` (a direct Prisma → DTO projection, no aggregate). The tables are **physically
introduced by the read slice but conceptually owned by BC-2**: S3 will add the write-side
`Listing` aggregate, the `Hold` table, and the overbooking `EXCLUDE` constraint **on top of
the same tables**, not new ones. There is one physical Postgres store; the CQRS split is
logical (read handlers bypass the domain), per ADR-0002.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Shared store, tables introduced by S1 (chosen) | one source of truth; matches the "same Postgres" Context Map; no sync | S1 physically owns tables it doesn't logically own — needs this ADR to signpost it | correct per Strategic Design; simplest |
| Separate read database / projection | textbook CQRS isolation | needs a projector + eventual consistency; overkill for MVP (PRD §6 out of scope) | no second store until the Redis stretch (PRD §12) |
| Defer all Listing modelling to S3, stub S1 data | keeps ownership "clean" | S1 could not run against real data — violates "every slice runs" | breaks the core build principle |

## Consequences

- Positive: S1 ships against real seeded data; S3 extends the same tables (adds `Hold` +
  `version`/`EXCLUDE`) instead of duplicating them; no read/write data drift.
- Negative / trade-offs: physical table ownership does not match logical BC ownership — a
  reader must consult this ADR to know that BC-2 owns writes. Cross-BC coupling at the
  schema level is accepted deliberately (single store, MVP).
- Follow-ups: S3 adds the `Listing` write aggregate + mapper, the `Hold` table, and the
  overbooking constraint (its own ADR: `EXCLUDE` vs optimistic `version`). The read
  projection stays as-is; `indicativeAvailable` is re-verified against canonical
  availability at booking time (intentional gap — UL §Availability).
