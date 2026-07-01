# Harbourstay Tactical Design

> Maps the Bounded Contexts from [strategic-design/STRATEGIC.md](strategic-design/STRATEGIC.md) to implementation-level Aggregates, Value Objects, Entities, state machines, and use cases. Strategic boundaries are fixed; this document decides the model *inside* each BC.
>
> **Status:** complete through the P0–S4 cut line (2026-07-02). Core BCs (Booking, Availability & Inventory, Payment Confirmation) fully modeled; Money Movement/ACL, Catalog & Search, Identity, Notifications drafted; Host Management and Reviews are deferred stubs (full pass when their slices come up).

## Conventions

- **Aggregate Root** own-id is a VO (`BookingId`); a reference to a *foreign* aggregate is a plain `string` (`guestId`, `listingId`, `holdId`) — no FK, no cross-BC VO import (see [conventions.md](../.claude/skills/fullstack-build/references/conventions.md)).
- `create()` = new (generates id, may record events); `reconstitute()` = rebuild from DB (no events).
- VOs are immutable, validate in `create()`, compare by value.
- Consistency boundary values: **strong** (one transaction), **eventual** (separate txns linked by a Domain Event), **compensation** (Saga undo).

---

## BC-1: Booking  *(Core)*

**Overview:** owns the reservation lifecycle — the guest's *commitment* — and nothing about calendars or money-in-the-bank. It references a Hold (owned by Availability) and is driven to `Confirmed` by Payment Confirmation.

### Aggregate / Entity

- **Aggregate Root: `Booking`** — single-root aggregate (no child entities).
  - Fields: `bookingId: BookingId`, `guestId: string` (→ Identity), `listingId: string` (→ Inventory), `holdId: string` (→ Availability Hold), `dateRange: DateRange`, `partySize: PartySize`, `status: BookingStatus`, `priceSnapshot: Money`, `holdExpiresAt: Date`, `createdAt: Date`.

### Value Objects

| VO | Values | Validation |
|---|---|---|
| `BookingId` | string (UUID) | `generate()` / `create(value)` |
| `DateRange` | checkIn, checkOut | check-in **strictly before** check-out; exposes `overlaps()`, `nights()` |
| `PartySize` | count (int) | ≥ 1 |
| `Money` | amount, currency | amount ≥ 0; used for the frozen `priceSnapshot` |

`CancellationPolicy` is applied *at cancel time* — model it as a VO/policy object passed in (its rules originate from the listing).

### State Transitions

```
PendingPayment ──confirm()──▶ Confirmed ──complete()──▶ Completed
      │                            │
      ├──expire()──▶ Expired       └──markNoShow()──▶ NoShow
      └──cancel()──▶ Cancelled     (Confirmed ──cancel(policy)──▶ Cancelled)
```

No state may be skipped (cannot `complete()` what was never `Confirmed`). Each method: **guard → mutate → (record event)**.

### Use Cases

| Action | Type | Input | Consistency | Notes |
|---|---|---|---|---|
| Create Booking | Command | guestId, listingId, dateRange, partySize | **strong** — Booking + Availability Hold in one txn | the Partnership seam; also snapshots price + checks capacity |
| Confirm Booking | Command | bookingId | **eventual** — driven by Payment Confirmation via Saga | separate txn from payment |
| Cancel Booking | Command | bookingId | strong (Booking) + release Hold | applies CancellationPolicy |
| Expire Booking | Command (scheduled job) | bookingId | strong (Booking) + release Hold | Hold TTL elapsed |
| Get / My Bookings | Query | bookingId / guestId | read model | bypasses domain (CQRS) |

### Expected API Endpoints

`POST /bookings` (create Hold → PendingPayment) · `POST /bookings/:id/cancel` · `GET /me/bookings` · `GET /bookings/:id`. (Confirm is internal, via the Saga/webhook — no public endpoint.)

### Aggregate Decisions

| Aggregate Root | Invariants in one transaction | Why this boundary |
|---|---|---|
| `Booking` | valid `DateRange` (check-in < check-out); status transitions follow the allowed graph; `priceSnapshot` is immutable once set | The reservation lifecycle is self-contained; the Hold and capacity live in Availability, so `Booking` only *references* them and is kept small. |

### Consistency Boundaries per Use Case

| Use Case | Aggregates modified | Boundary | Notes |
|---|---|---|---|
| Create Booking | Booking + Availability (Hold) | **strong** | one transaction at the Hold seam (Partnership); `EXCLUDE` prevents overlap |
| Confirm Booking | Booking | **eventual** | Payment Confirmation drives it via Saga (separate txn) |
| Cancel / Expire | Booking + Availability (release) | strong / compensation | releases the held nights |

### Domain Events

| Event | Publisher | Subscriber | Mechanism | Idempotency key |
|---|---|---|---|---|
| `BookingConfirmed` | Booking | Notifications | Transactional Outbox | bookingId |
| `BookingExpired` | Booking | Availability (release) | in-process / Outbox | bookingId |

### Business Rules
- Can `confirm()` only from `PendingPayment`.
- Cannot `cancel()` after `Completed`.
- `partySize ≤ listing.capacity` — checked at creation (cross-aggregate; the app service loads capacity from Availability).
- `priceSnapshot` is frozen at creation; later rate changes never affect an existing booking.

### Domain Exceptions
`InvalidBookingStateException` · `BookingNotFoundException` · `InvalidDateRangeException` · `PartySizeExceedsCapacityException`

---

## BC-2: Availability & Inventory  *(Core)*

**Overview:** the supply-side source of truth — the canonical Listing, the availability calendar, and the **overbooking invariant**. Owns the **Hold**. Pricing is folded in (rates/discounts/fees), producing the quote that Booking snapshots.

### Aggregates / Entities — *two roots* (the key decision)

- **Aggregate Root: `Listing`** — the canonical bookable unit.
  - Fields: `listingId: ListingId`, `hostId: string` (→ Identity), `title`, `type: ListingType` (stay|tour; **stay** for MVP), `location`, `capacity: Capacity`, `basePrice: Money`, `ratePlan: RatePlan`, `availabilityBlocks: AvailabilityBlock[]`, `status: ListingStatus` (Published|Unpublished).
  - Owns host-set data that changes on the host cadence: definition, price rules, blocked dates.
- **Aggregate Root: `Hold`** — a TTL-bound exclusive claim on a date range.
  - Fields: `holdId: HoldId`, `listingId: string` (→ Listing), `dateRange: DateRange`, `status: HoldStatus` (Active|Committed|Released|Expired), `expiresAt: Date`.
  - `Active` = tentative (TTL); `Committed` = permanent taking (post-payment); `Released`/`Expired` = returned to supply.

> **Why two roots, not `Listing` owning its holds?** The overbooking invariant is **cross-Hold** ("no two overlapping *active/committed* holds on a listing"). Putting all holds under `Listing` would force loading the whole listing + locking its row to place one hold — serializing every booking for that listing. A small `Hold` aggregate + a **DB-level guarantee** lets concurrent holds on *different* dates proceed while the DB rejects only true overlaps.

### The Overbooking Invariant — enforced by the database

The invariant spans multiple `Hold` aggregates, so **no single aggregate can enforce it**. Enforce it in Postgres:

```sql
-- requires btree_gist
ALTER TABLE hold ADD CONSTRAINT no_overlapping_holds
  EXCLUDE USING gist (
    listing_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('active','committed'));
```

A concurrent overlapping insert fails with `23P01`; the repository catches it and raises `OverlappingHoldException`. **This is the single most important line in the system** — worth an ADR (`EXCLUDE` vs optimistic `version`, per the Context Map).

### Value Objects

| VO | Values | Validation |
|---|---|---|
| `ListingId`, `HoldId` | string (UUID) | `generate()` / `create(value)` |
| `DateRange` | checkIn, checkOut | check-in < check-out; `overlaps()`, `nights()` (this BC's own copy) |
| `Capacity` | count (int) | ≥ 1 |
| `Money` | amount, currency | ≥ 0 (this BC's own copy) |
| `Rate` | amount per night | ≥ 0 |
| `Fee` | label, amount | ≥ 0 |
| `RatePlan` | basePrice + rules (weekend uplift, LOS discount) | rules non-contradictory |
| `AvailabilityBlock` | dateRange, reason | valid range |

### Pricing (folded in) — a Domain Service

`PricingService.quote(listing, dateRange, partySize): Money` computes the all-in **quoted total** = rates × nights ± rate rules + fees. Called at Booking-create time; the result is what Booking freezes as `priceSnapshot`. **Documented seam:** when rate rules grow, extract `Pricing` as its own BC — `PricingService` + `RatePlan`/`Rate`/`Fee` move out wholesale.

### State Transitions (`Hold`)

```
Active ──commit()──▶ Committed        (on payment confirmed)
  │                      │
  ├──expire()──▶ Expired └──(stays permanent)
  └──release()──▶ Released            (on cancel)
```

### Use Cases

| Action | Type | Input | Consistency | Notes |
|---|---|---|---|---|
| Place Hold | Command | listingId, dateRange, partySize | **strong** — with Booking create (Partnership) | `EXCLUDE` rejects overlap; also checks no `AvailabilityBlock` overlap |
| Commit Hold | Command | holdId | **strong** — with Booking `confirm()` (Partnership, at confirm time) | Active → Committed |
| Release / Expire Hold | Command (+ scheduled job) | holdId | strong / compensation | returns nights to supply |
| Get Availability | Query | listingId, from, to | read model | free = not blocked, not active/committed hold |
| Upsert Listing / Rates / Blocks | Command | (host) | strong (Listing) | driven by Host Management |

### Expected API Endpoints
`GET /listings/:id/availability` · (host) `POST/PATCH/DELETE /host/listings` · rate/block management. (Search/detail read endpoints belong to Catalog & Search.)

### Aggregate Decisions

| Aggregate Root | Invariants in one transaction | Why this boundary |
|---|---|---|
| `Listing` | capacity ≥ 1; basePrice ≥ 0; blocks/rate rules valid | Host-cadence definition + pricing + blocked dates are cohesive and low-frequency. |
| `Hold` | valid dateRange; valid status transition; TTL | Small + high-write; the **cross-hold** non-overlap invariant is enforced by the DB `EXCLUDE`, not inside the aggregate. |

### Consistency Boundaries per Use Case

| Use Case | Aggregates modified | Boundary | Notes |
|---|---|---|---|
| Place Hold (Create Booking) | Hold (+ Booking) | **strong** | one txn; `EXCLUDE` atomic |
| Commit Hold (Confirm Booking) | Hold (+ Booking) | **strong** | Partnership again at confirm; driven by Saga |
| Release / Expire | Hold | compensation | scheduled job releases expired |

### Domain Events

| Event | Publisher | Subscriber | Mechanism | Idempotency key |
|---|---|---|---|---|
| `HoldPlaced` | Availability | (internal) | in-process | holdId |
| `HoldCommitted` | Availability | (internal) | in-process | holdId |
| `HoldReleased` / `HoldExpired` | Availability | (internal) | in-process / scheduled | holdId |

### Business Rules
- A Hold can be placed only on dates with **no overlapping active/committed hold** (DB) **and no `AvailabilityBlock`** (checked).
- Only an `Active` hold can `commit()` or `expire()`; only `Active`/`Committed` can `release()`.
- Price is computed from the Listing's `RatePlan` at quote time; the Listing never stores a per-booking price.

### Domain Exceptions
`OverlappingHoldException` (from `23P01`) · `DatesNotAvailableException` (blocked) · `ListingNotFoundException` · `InvalidHoldStateException` · `InvalidRateException`

## BC-3: Payment Confirmation  *(Core)*

**Overview:** the financial-truth context. Answers "did the money actually settle?" with authority — reconciled and idempotent — and drives Booking → `Confirmed`. Depends on **Money Movement (BC-4)** via an ACL for the Stripe integration.

### Aggregates / Entities

- **Aggregate Root: `Payment`** — our purified model of an in-flight payment for a booking.
  - Fields: `paymentId: PaymentId`, `bookingId: string` (→ Booking), `amount: Money`, `status: PaymentStatus` (Pending|Succeeded|Failed), `stripePaymentIntentId: string` (opaque ref from the ACL), `createdAt`.
  - Methods: `markSucceeded()`, `markFailed()` — guarded, **idempotent** (re-applying `Succeeded` is a no-op, not an error).
- **Aggregate Root: `ProcessedWebhookEvent`** *(idempotency ledger)* — `eventId: string` (Stripe `event.id`), `processedAt`. A unique constraint on `eventId` makes duplicate webhook delivery safe: if the row exists, the event was already handled → skip.

### Value Objects

| VO | Values | Validation |
|---|---|---|
| `PaymentId` | string (UUID) | `generate()` / `create(value)` |
| `Money` | amount, currency | ≥ 0 (this BC's own copy) |
| `PaymentStatus` | Pending / Succeeded / Failed | enum |

### State Transitions (`Payment`)

```
Pending ──markSucceeded()──▶ Succeeded
   └──────markFailed()──────▶ Failed
```

### Use Cases

| Action | Type | Input | Consistency | Notes |
|---|---|---|---|---|
| Create PaymentIntent | Command | bookingId | strong (Payment) + external | via ACL → Stripe; returns client secret; `Payment` = Pending |
| Handle Stripe Webhook | Command | raw event | strong (dedupe + Payment) | verify signature (ACL), dedupe on `event.id`, translate, mark Succeeded/Failed |
| Get Payment Status | Query | bookingId | read model | — |

### Expected API Endpoints
`POST /bookings/:id/pay` (→ client secret) · `POST /webhooks/stripe` (idempotent).

### Domain Events

| Event | Publisher | Subscriber | Mechanism | Idempotency key |
|---|---|---|---|---|
| `PaymentSucceeded` | Payment Confirmation | BookingCheckoutSaga | in-process | paymentId |
| `PaymentFailed` | Payment Confirmation | BookingCheckoutSaga | in-process | paymentId |

### Aggregate Decisions

| Aggregate Root | Invariants in one transaction | Why this boundary |
|---|---|---|
| `Payment` | valid status transition; amount matches booking's `priceSnapshot` | Reconciliation state is self-contained; Stripe specifics stay in the ACL (BC-4). |
| `ProcessedWebhookEvent` | `eventId` unique | Dedup must be atomic with handling; smallest possible aggregate. |

### Business Rules
- A webhook is processed **at most once** per `event.id` (dedup ledger).
- `markSucceeded()`/`markFailed()` are idempotent — a duplicate provider signal never double-applies.
- Booking becomes `Confirmed` **because** payment was confirmed — never the reverse, never assumed.

### Domain Exceptions
`PaymentNotFoundException` · `InvalidPaymentStateException`. (A duplicate webhook is handled gracefully — skip, not throw.)

---

## Cross-BC: `BookingCheckoutSaga`  *(process manager — application layer)*

Coordinates the three Core BCs across the payment round-trip. Lives in the application layer (not an aggregate); each step has a compensating action.

1. **Start** — Booking `PendingPayment` + `Hold` `Active` placed **atomically** (BC-1 + BC-2, one txn — Partnership). Hold TTL ~15 min.
2. **Pay** — `Create PaymentIntent` (BC-3 via BC-4 ACL); client completes payment with the client secret.
3. **Confirm** — on `PaymentSucceeded`: in **one txn** (Partnership again) `Booking.confirm()` + `Hold.commit()`, and write the `BookingConfirmed` **Outbox** row → Notifications. This txn is **separate** from the payment txn (eventual consistency, by necessity — can't hold a lock across the Stripe round-trip).
4. **Compensate** — on `PaymentFailed` **or** Hold-TTL expiry (scheduled job): `Hold.release()` + `Booking.expire()`.

**Consistency map:** start = strong; pay = external; confirm = strong-within, eventual-across; compensation = Saga undo. The Hold TTL + scheduled job is the safety net that bounds the eventual-consistency window.

## BC-4: Money Movement  *(Generic — Stripe ACL)*

**Overview:** not a domain model — an **Anti-Corruption Layer** over Stripe (test mode). It translates Stripe's shape into BC-3's concepts so no vendor vocabulary leaks inward. No aggregate, no VOs of its own.

- **Application Port (owned by BC-3):** `PaymentGatewayPort`
  - `createIntent(bookingId, amount: Money): { intentId, clientSecret }`
  - `verifyAndParse(rawBody, signature): TranslatedPaymentEvent` (→ `PaymentSucceeded` / `PaymentFailed`, stripped of Stripe fields)
- **Adapter (infra/adapters):** `StripePaymentAdapter implements PaymentGatewayPort` — the only place the Stripe SDK, signature verification, and `Client Secret` exist.
- **Rules:** test mode only; signature must verify before any translation; the adapter never exposes a Stripe object outward.
- **No domain events / aggregates / exceptions** beyond a translation failure surfaced as a rejected webhook.

---

## BC-5: Listing Catalog & Search  *(Supporting — CQRS read side)*

**Overview:** pure **read side** — no write aggregate. Serves the guest-facing "marketed offer" from read models projected off `Listing` + `Availability` (BC-2) over the same Postgres.

- **Read Models:** `ListingSummary` (search card: id, title, location, "from" price, thumbnail), `ListingDetail` (full page + indicative availability).
- **Queries + Ports:** `SearchListings(location, from, to, guests)`, `GetListingDetail(id)` → `ListingQueryPort` returning read-model DTOs. **Never** reconstitutes a domain aggregate.
- **Availability shown is *indicative*** (approximate hint) — re-verified against canonical availability at booking time (BC-2). This gap is intentional (UL §Availability).
- **NFR:** search p95 < 500 ms → dedicated indexes / denormalized read tables.
- **No aggregates, VOs, domain events, or exceptions** — read-only projection.

---

## BC-7: Identity & Access  *(Generic)*

**Overview:** users, roles, JWT. Thin, commodity — invest the minimum.

- **Aggregate Root: `User`** — `userId: UserId`, `email: Email`, `passwordHash: string`, `role: Role` (guest|host|admin), `createdAt`.
- **VOs:** `UserId`, `Email` (format-validated), `Role` (enum).
- **Ports (impl in infra):** `PasswordHasherPort` (bcrypt/argon — hashing never in domain), `AuthTokenPort` (issue/verify JWT access + refresh).
- **Use Cases:** `RegisterUser`, `LoginUser`, `RefreshToken` (commands); `GetCurrentUser` (query). Session in an **httpOnly cookie**; `RolesGuard` + `@Roles()` for RBAC.
- **Business rules:** unique email; password never stored/returned in plaintext.
- **Domain Exceptions:** `EmailAlreadyInUseException` · `InvalidCredentialsException` · `UserNotFoundException`.
- Note: the `guest` **role** here ≠ the Booking `Guest` (booker) ≠ party-size count (UL §Guest).

---

## BC-8: Notifications  *(Generic — Outbox consumer)*

**Overview:** an event consumer with no domain invariant. Reacts to Published-Language events delivered via the **Transactional Outbox**.

- **No aggregate root** (optional `NotificationLog` entity: eventId, type, sentAt).
- **Port (impl in infra):** `MailerPort.send(to, template, data)` — a test mailer adapter for MVP.
- **Consumes:** `BookingConfirmed` (via Outbox relay) → sends the confirmation email. **Idempotent on `event_id`** (a duplicate delivery must not double-send).
- **Domain Exceptions:** none domain-level; a send failure retries and must **never** roll back a confirmed booking.

### Cross-cutting: the Transactional Outbox (infra)
Shared mechanism, not a BC: an `outbox_events` table (`id`, `aggregate_id`, `type`, `payload` json-primitives, `occurred_at`, `published_at?`, `idempotency_key`). The event row is written **in the same transaction** as the aggregate change (e.g. `BookingConfirmed` in the confirm txn); a polling relay (`@Interval`) publishes unsent rows and stamps `published_at`. At-least-once → consumers idempotent.

---

## BC-6: Host Management  *(Supporting — deferred to P4)*

Command surface over `Listing` (BC-2) for the host actor; introduces **no new aggregate** (it issues commands Inventory executes). Use cases: upsert listing, manage rates/blocks, list host bookings. RBAC `@Roles('host')` + **ownership check** (a host edits only their own listings). Endpoints: `POST/PATCH/DELETE /host/listings`, `GET /host/bookings`. _Full pass when the S6 slice comes up._

## BC-9: Reviews  *(Supporting — deferred / Could)*

`Review` aggregate (`reviewId`, `bookingId` ref, `rating`, `comment`) tied to a **Completed** booking. Out of the MVP cut line. _Full pass only if pursued._
