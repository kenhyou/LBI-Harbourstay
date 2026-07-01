# Phase 1: Domain Discovery

> PRD mode — pre-filled by mapping `prd-harbourstay-booking-platform.md`. Confirm or edit before Phase 2.

## One-Line Definition

An OTA where guests reserve short stays/tours and hosts manage availability, differentiated by overbooking prevention and reliable payment confirmation.

## Users (PRD §4)

- **Primary:** Guest (booker) — searches, reserves, pays, manages their bookings.
- **Secondary:** Host / Operator (supplier) — lists properties, manages availability & rates, reviews bookings.
- **Tertiary (stretch):** Admin — approves listings, manages users.

Roles (RBAC): `guest` / `host` / `admin`.

## Core Domain Events (PRD §5.2 state machine + §5.3 Saga)

- `HoldPlaced` — availability hold created with a TTL (~15 min)
- `BookingCreated` — booking enters `PendingPayment`
- `PaymentIntentCreated` — Stripe PaymentIntent opened
- `PaymentSucceeded` / `PaymentFailed`
- `BookingConfirmed` — hold committed into a real reservation
- `BookingExpired` — hold TTL elapsed, booking auto-cancelled
- `BookingCancelled` — guest cancels within policy
- `BookingCompleted` — stay/tour finished
- `ConfirmationEmailRequested` — emitted via the Outbox to Notifications

## Key KPIs (PRD §3 + §9)

- End-to-end booking success (search → reserve → pay in test mode → confirmation email)
- **Zero double-bookings** (hard invariant)
- Search p95 < 500 ms

## Differentiation (PRD §1)

The product centers on a **rich booking domain**. The reservation lifecycle spans inventory, availability, pricing, concurrency, and reliable payment confirmation — the differentiators are **overbooking prevention** (real concurrency control) and **reliable payment confirmation** (Saga + Transactional Outbox), not the CRUD around them.

## Scope

- **In:** identity/roles, listing search & availability, the booking lifecycle, Stripe test-mode payment + webhook, outbox-driven notifications, host management.
- **Out (PRD §2 N1–N4, §6 Won't):** multi-tenancy / production-scale rollout, deep security/auditing/compliance, native mobile / real-time chat / ML recommendations, real payment settlement & refund accounting (Stripe test mode only).
