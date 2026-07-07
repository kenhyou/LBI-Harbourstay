# ADR-0009: Deliver cross-context events with a Transactional Outbox

- **Status:** Accepted
- **Date:** 2026-07-07
- **Slice:** S4 (Payment Saga + Outbox + Confirmation)
- **Deciders:** Ken (with Claude Code)

## Context

When a payment succeeds, the `BookingCheckoutSaga` must do two things: (1) change **local**
state — `booking.confirm()` + `hold.commit()`, one transaction, ADR-0007's constraint still
honored — and (2) **notify** the guest (a `BookingConfirmed` email, sent by the Notifications
context, BC-5).

These are a **dual write**: our database and an external mailer. The two cannot share one
transaction, so the naïve "confirm, then send the email" ordering has two failure modes:

- Confirm commits, then the mailer call throws or the process crashes → **booking Confirmed
  but the guest is never told.**
- The email sends, then the DB transaction rolls back → **guest told of a booking that does
  not exist.**

Notifications is deliberately decoupled from Booking (STRATEGIC.md Context Map — asynchronous,
so a slow/broken mailer never blocks or fails a confirmation). We need an atomic hand-off from
"state changed" to "notification will happen" that survives a crash between the two.

## Decision

Use the **Transactional Outbox** pattern:

- In the **same transaction** as `booking.confirm()` / `hold.commit()`, the saga writes a
  `BookingConfirmed` row into an `outbox_event` table (`this.outbox.enqueue(...)` **inside**
  `this.tx.run(...)`). The event row and the state change commit or roll back **together** —
  it is now impossible to confirm-without-enqueue or enqueue-without-confirm.
- A separate **relay** (`shared/outbox/outbox-relay.ts`, `@Interval`) polls unpublished rows,
  dispatches each to the in-process handler that calls Notifications, and stamps `publishedAt`.
  The payload is **primitives only** (it serializes into the row and crosses a BC boundary — no
  VOs).
- Delivery is **at-least-once**, so consumers are **idempotent**: the notification handler
  writes a `notification_log` row keyed on the event id, so a redelivered event does not send a
  second email. (This mirrors ADR-0008's inbound `ProcessedWebhookEvent` ledger — idempotency
  on both edges.)

The two transactions — (a) the webhook marking the `Payment` + recording the processed event,
and (b) the saga confirming the booking — are intentionally **separate** (eventual
consistency): we never hold a DB lock across the Stripe round-trip, and the hold-expiry job
(`@Interval`) bounds the window as a safety net (`onHoldExpired` compensation).

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Transactional Outbox + polling relay (chosen) | atomic state-change + event write; survives a crash between them; mailer outages never fail a confirmation; at-least-once + idempotent consumer | a polling relay (small latency + a background tick); an extra table; consumers must dedup | the only option that makes the dual write crash-safe without new infra |
| Synchronous send inside the transaction | simplest to read | an external HTTP call inside a DB transaction — holds the txn open on network latency, and a mailer error rolls back a *paid* booking | couples confirmation durability to a third party; wrong failure semantics |
| In-memory event emitter (fire-and-forget after commit) | no table, low latency | the event is lost if the process dies between commit and emit — the exact gap we must close | not crash-safe (loses the notification) |
| Message broker (Kafka/SQS) with CDC | scales; durable | new infrastructure to run/deploy for a single-DB teaching app; overkill at this scope | disproportionate; a Postgres table + `@Interval` meets the guarantee here |

## Consequences

- Positive: `BookingConfirmed` is never lost and never fabricated — proven live (payment →
  Confirmed booking → a `notification_log` row + `[test-mailer] booking-confirmed` ~2s later
  on the relay's own tick; a **resent** identical event produced **no** second notification).
  The mailer can be down and confirmations still succeed (they queue).
- Negative / trade-offs: eventual (not immediate) notification — bounded by the relay interval;
  an `outbox_event` table to keep tidy (a future prune/retention job); consumers carry a dedup
  responsibility; a poll-based relay is simple but not the lowest-latency option.
- Follow-ups: retention/cleanup of published rows and a dead-letter path for a poison event are
  future hardening (S7). The same outbox is the natural channel for later cross-context events
  (e.g. cancellation in S5).
