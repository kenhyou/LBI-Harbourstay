# ADR-<NNNN>: <short decision title>

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** <YYYY-MM-DD>
- **Slice:** <P0 / S1 / … that forced this decision>
- **Deciders:** <who>

## Context

What is the problem or force at play? What in the PRD / STRATEGIC.md / DESIGN.md makes this decision necessary? (e.g. "Booking must never double-book overlapping date ranges under concurrency — PRD §9.")

## Decision

The choice made, stated plainly. (e.g. "Prevent overbooking with a Postgres `EXCLUDE` constraint on `(listing_id, daterange)` using a gist index, rather than application-level optimistic locking.")

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| <A> | | | |
| <B> | | | |

## Consequences

- Positive: <what this buys>
- Negative / trade-offs: <what it costs>
- Follow-ups: <migrations, tests, docs this obliges>

> Harbourstay's PRD §3 requires **≥3 ADRs**. Strong candidates: why CQRS, why Prisma-behind-a-repository-port, why this overbooking mechanism, why the Transactional Outbox, why a Stripe ACL.
