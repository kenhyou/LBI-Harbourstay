# ADR-0008: Integrate Stripe behind an Anti-Corruption Layer (BC-4), not inline

- **Status:** Accepted
- **Date:** 2026-07-07
- **Slice:** S4 (Payment Saga + Outbox + Confirmation)
- **Deciders:** Ken (with Claude Code)

## Context

S4 takes money (Stripe **test mode only**, PRD §2 N4). Stripe is an external, Generic
subdomain (STRATEGIC.md): its vocabulary is `PaymentIntent`, `client_secret`, `charge`,
webhook `event` envelopes, SQLSTATE-free opaque ids like `pi_3Tq…`. None of that is *our*
domain language. Our Core Booking/Availability BCs speak `Booking`, `Hold`, `Money` (integer
minor units, ADR-0005). If Stripe's shapes leak inward, a vendor migration or a Stripe API
version bump would ripple through the domain, and our aggregates would be untestable without
the network.

The domain-purity invariant (CLAUDE.md #2) already bans framework/ORM imports from the domain.
The same reasoning applies to a payment vendor SDK: it must not appear in domain or application
code.

## Decision

Wrap Stripe in an **Anti-Corruption Layer** — the dedicated Payment Gateway context (**BC-4**):

- **The Stripe SDK is imported in exactly one file:** `apps/api/src/payment/infra/adapters/stripe-payment.adapter.ts`. It is the only place `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are read. The rest of the app depends on a **port**, not on `Stripe`.
- **We keep our own `Payment` aggregate** (BC-3) — our purified model of an in-flight payment (`Pending → Succeeded | Failed`, own `PaymentId` VO, own `Money`). Stripe's `pi_…` id is stored as an **opaque `stripePaymentIntentId` string** — a foreign reference, never a domain concept. The ACL translates `PaymentIntent` ↔ `Payment` at the boundary.
- **Webhooks are the inbound edge of the ACL.** `POST /webhooks/stripe` reads the **raw body** (`rawBody: true` in `main.ts`) so the adapter can verify the Stripe signature with the webhook secret before anything else runs. The controller translates the verified Stripe `event` into a domain-level intent (`PaymentSucceeded` / `PaymentFailed`) and hands off to the application layer; Stripe types never cross into the saga.
- **Idempotency at the boundary** (Stripe delivers webhooks at-least-once): a `ProcessedWebhookEvent` dedup ledger keyed on Stripe `event.id` (PK/unique) skips a duplicate delivery, **belt-and-braces** with idempotent aggregate transitions (`Payment.markSucceeded()` re-applied is a no-op; a *conflicting* transition throws). See ADR-0009 for what happens *after* a first-time event.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Stripe ACL adapter behind a port (chosen) | domain/app never see Stripe types; one swappable seam; aggregates unit-testable with zero network; vendor/API-version churn contained to one file | one more indirection; the adapter must map both directions | the whole point — keep a Generic vendor out of Core language |
| Call the Stripe SDK directly from command handlers | less code up front | couples the application layer to a vendor; every handler needs the SDK + keys; webhook types leak toward the domain | breaks domain purity (CLAUDE.md #2) and makes handlers untestable offline |
| A thin `stripe` util with no port | trivial | still a hard compile-time dependency from callers; no substitution seam for tests | no ACL boundary; can't fake it in unit tests |

## Consequences

- Positive: Stripe is confined to one adapter; the `Payment` aggregate and the saga are pure and were driven fully by unit + mocked specs (no keys needed); a duplicate webhook is provably harmless (verified live — a resent `payment_intent.succeeded` produced **no** second confirmation or email). Test mode vs live is a key swap, no code change.
- Negative / trade-offs: an extra mapping layer; the webhook path needs raw-body handling (a small Nest wiring wrinkle); the adapter is the one component that genuinely needs the network/keys to run, so its true end-to-end proof is a browser + `stripe listen` step, not a pure unit test.
- Follow-ups: real settlement, refunds, and Stripe Connect payouts are explicitly **out of scope** (PRD §2/§6). If a second gateway is ever added, it implements the same port — the domain does not change.
