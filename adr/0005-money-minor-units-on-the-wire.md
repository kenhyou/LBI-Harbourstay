# ADR-0005: Money is transported as integer minor units (cents) on the wire

- **Status:** Accepted
- **Date:** 2026-07-03
- **Slice:** S1 (Listing Search & Detail)
- **Deciders:** Ken (with Claude Code)

## Context

S1's `listingSummary`/`listingDetail` contracts carry `basePrice: number`, deliberately
left unit-agnostic by the contract. During integration the seed stored `basePrice: 18000`
(intending $180.00) while the frontend `formatPrice` assumed major units and rendered
"$18,000". Money crosses several boundaries later — `Booking.priceSnapshot` (S3) and Stripe
`PaymentIntent` amounts (S4) — and **Stripe's API is denominated in the currency's smallest
unit (cents)**. A single, explicit convention is needed before the amount is copied across
those boundaries.

## Decision

All monetary amounts are **integers in the currency's minor unit (cents)** everywhere they
cross a boundary: the Prisma columns, the `packages/shared` contract DTOs, and the HTTP
responses. Formatting to a human-readable major-unit string (e.g. `18000` → "$180") happens
**only at the display edge** — `apps/web/lib/format.ts#formatPrice` divides by 100. No
floating-point currency math; no major-unit values on the wire.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Integer minor units on the wire (chosen) | no float rounding; 1:1 with Stripe (S4); one convention end-to-end | every display site must divide by 100 | standard for money; smallest surprise at the Stripe boundary |
| Major units as `number` (dollars) | naive formatting "just works" | float rounding errors; a conversion layer needed before Stripe | reintroduces the exact bug this ADR closes |
| Decimal string / money library | exact, currency-aware | serialization + dependency weight; overkill for a single-currency MVP | not justified at this scope (PRD §6) |

## Consequences

- Positive: `basePrice`, future `priceSnapshot`, and Stripe amounts share one representation;
  no rounding drift; the S4 Stripe adapter passes the amount through unchanged.
- Negative / trade-offs: any new price display must remember to format via `formatPrice`
  (divide by 100) — a raw render shows a 100×-inflated number.
- Follow-ups: reuse `formatPrice` for every price surface; S3 stores `priceSnapshot` in
  minor units; S4's Stripe ACL treats our amount as the Stripe amount directly. Currency is
  single (USD) for the MVP — a `currency` field can join the DTO if multi-currency is ever
  in scope (out of scope, PRD §6).
