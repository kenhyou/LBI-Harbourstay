# Phase 5: Ubiquitous Language

> Per-BC glossary + the critical same-word-different-meaning section. From `domain-expert`. The point of the context split is that everyday words ("hold", "guest", "listing", "availability") hide several distinct business realities; this glossary keeps them separate.

---

## 1. Booking (Core) — the reservation lifecycle

| Term | Definition (inside Booking) |
|---|---|
| **Booking** | A guest's committed intent to occupy a specific listing for a date range and party size; the aggregate with a lifecycle. |
| **Reservation** | Field-synonym for Booking, guest-facing ("my reservations"). |
| **PendingPayment** | Claimed but unpaid; a revocable, time-boxed promise. |
| **Confirmed** | The reservation is *secured* / will happen. Says nothing by itself about money settling. |
| **Completed** | The stay has been consumed (checked in, period elapsed). |
| **Cancelled** | A party deliberately withdrew, subject to cancellation policy. |
| **Expired** | A PendingPayment booking that ran out of time — a passive death by clock. |
| **NoShow** | A confirmed booking the guest never honoured. |
| **Cancellation Policy** | Rule set deciding entitlement/penalty at cancel time. |
| **Party Size / Guests (count)** | Number of occupants; must fit capacity. |
| **Date Range** | Check-in → check-out span; invariant: check-in < check-out. |
| **Price Snapshot** | The frozen agreed price captured at booking time — "what we shook hands on." |
| **Guest (the person)** | The *booker*: holds the reservation and its obligations. |
| **Hold (referenced)** | A precondition *pointer* — "a calendar claim exists behind this booking." Booking doesn't own it. |

## 2. Availability & Inventory (Core) — the calendar & anti-overbooking invariant

| Term | Definition (inside Availability) |
|---|---|
| **Listing (canonical)** | The authoritative bookable unit: capacity + sellable calendar; source of truth. |
| **Availability** | Whether exact nights are *claimable right now* — a live, contested, decrementable truth. |
| **Availability Calendar** | Day-by-day open/closed map per listing. |
| **AvailabilityBlock** | Nights the host deliberately closed (maintenance, personal use). |
| **Hold (canonical)** | A temporary exclusive TTL-bound claim on nights that removes them from availability so a checkout can complete. The *real* Hold — lives and dies here. |
| **Overbooking Invariant** | Overlapping date ranges on one listing cannot both be claimed. The reason this context exists. |
| **Reservation (committed)** | When a Hold converts into a *permanent* taking of the nights (calendar counterpart to Booking→Confirmed). |
| **Release** | Returning held nights to availability on expiry/failed checkout. |
| **Rate** | Per-night price before discounts/fees. |
| **Base Price** | Host's default nightly rate before rules. |
| **Rate Plan / Rate Rule** | A rule adjusting the rate (weekend uplift, LOS discount). |
| **Fee** | A charge on top of nightly rates (e.g. cleaning). |
| **Price (quoted total)** | All-in computed amount for a date range + party size; snapshotted into Booking. |
| **Capacity** | Max party size the listing accommodates. |

## 3. Payment Confirmation (Core) — "truly paid" reconciliation

| Term | Definition (inside Payment Confirmation) |
|---|---|
| **Payment** | Record of whether/how much money was actually received for a booking. |
| **Payment Confirmation** | Authoritative determination that funds truly settled (not merely initiated). |
| **PaymentIntent (our sense)** | *Our* translated model of an in-flight payment attempt, stripped of vendor specifics. |
| **Reconciliation** | Cross-checking the provider's account against our expectation so "paid" means paid. |
| **payment_succeeded** | Confirmed settled signal; lets the booking proceed to Confirmed. |
| **Payment Failure** | Determination it won't settle; drives compensation (release hold, expire booking). |
| **Idempotent Handling** | Treating a repeated "succeeded" notice as the same single fact. |
| **Confirmation (payment sense)** | "The money is real" — a stricter, different claim than Booking's "secured". |

## 4. Money Movement (Generic) — Stripe behind the ACL

| Term | Definition |
|---|---|
| **PaymentIntent (provider sense)** | Stripe's own payment-lifecycle object — the foreign concept the ACL translates. |
| **Charge / Settlement** | The provider's notion of money actually moving. |
| **Webhook** | The provider's outbound notification of a payment change. |
| **Client Secret** | Provider token the guest's checkout uses to complete payment. |
| **Test Mode** | Provider mode where no real money moves — the mode this product runs in. |

## 5. Listing Catalog & Search (Supporting) — the marketed offer

| Term | Definition |
|---|---|
| **Listing (marketed offer)** | The searchable/browsable presentation — a read-optimized *view*, not the truth. |
| **Search Result** | A listing surfaced for location/date/party-size criteria; a candidate. |
| **Indicative Availability** | Approximate "looks free" hint; must be re-checked at booking time. |
| **"From" Price** | Headline lowest-plausible teaser; not the quoted total. |
| **Detail Page** | Full presentation of one listing. |
| **Listing Type** | Stay (date range) vs tour (time slot) — the open modelling fork. |

## 6. Host Management (Supporting) — the supplier's command surface

| Term | Definition |
|---|---|
| **Host / Operator** | Supplier who owns listings and controls calendar/rates. |
| **Listing (host's editable draft)** | The property as the host maintains/publishes it. |
| **Publish / Unpublish** | Making a listing visible for sale or withdrawing it. |
| **Rate Management** | Host setting base price and rate rules. |
| **Availability Management** | Host opening/blocking dates. |
| **Host Bookings List** | Host's view of reservations against their listings. |

## 7. Identity & Access (Generic)

| Term | Definition |
|---|---|
| **User** | An authenticated person. |
| **Role** | guest / host / admin; determines permissions. |
| **Guest (as role)** | Authorization meaning: a user permitted to search and book. |
| **Host (as role)** | A user permitted to manage listings. |
| **Admin** | A user permitted to approve listings and manage users. |

## 8. Notifications (Generic)

| Term | Definition |
|---|---|
| **Notification** | Outbound message triggered by a domain event. |
| **Confirmation Email** | The message telling a guest their booking is Confirmed — their felt proof. |
| **Domain Event (as consumed)** | A business fact (e.g. BookingConfirmed) this context reacts to. |

## 9. Reviews (Supporting, deferred)

| Term | Definition |
|---|---|
| **Review** | A guest's post-stay rating + comment on a completed booking. |
| **Rating** | The numeric score within a review. |

---

# Same Word, Different Meaning — the critical section

### Hold *(most overloaded, most dangerous)*
- **Availability (owner):** a temporary exclusive TTL-bound claim on specific nights that removes them from availability. The real thing — lives, expires, is released here.
- **Booking (referrer):** merely a pointer — "a claim backs this pending booking." Never manipulated here.
- **vs Reservation:** a Hold is the revocable *right to book*; a committed Reservation is the *permanent* taking of nights. *"A hold protects; a reservation commits."*

### Guest *(three meanings)*
- **Booking:** the *booker* — responsible party (singular, role-bearer).
- **Availability/Booking (count):** *party size* — a number checked against capacity.
- **Identity:** the authorization role `guest` — a user allowed to book (maybe not even the occupant).
- Trap: "guests ≤ capacity" (count) vs "the guest cancelled" (booker) — never let them drift.

### Availability *(two meanings)*
- **Inventory (canonical):** live, contested, decrementable — "claimable right now?" Governed by the overbooking invariant.
- **Catalog & Search (indicative):** an approximate marketing hint, stale-tolerant, re-verified at booking time.
- Trap: a night can be *shown* available yet *not* available because someone holds it. Accepted on the shop window, **never** on the calendar.

### Listing *(four faces)*
- **Inventory (canonical):** authoritative bookable unit — capacity, calendar, truth.
- **Catalog & Search (marketed offer):** read-optimized shop-window view — a projection.
- **Host Management (editable draft):** the supplier's working copy of intent.
- **Booking (referenced identity):** just *which unit* the reservation is for.
- *The catalog listing sells, the inventory listing guarantees, the host listing is edited.*

### PaymentIntent *(two meanings — the reason the ACL exists)*
- **Money Movement (provider):** Stripe's own object with its states/fields — foreign.
- **Payment Confirmation (our sense):** our purified model; its status means what *we* decided, not a passthrough.

### Confirmed / Confirmation *(the "confirmed but not paid" trap)*
- **Booking:** a lifecycle state — "the reservation is secured / will happen." Not about money.
- **Payment Confirmation:** the funds truly settled — a fact about money.
- **Notifications:** the guest's felt proof (the email).
- Essence: payment confirmation is the *cause*, Booking Confirmed the *effect*, the email the *announcement*. Never collapse them.

### Reservation *(two truths)*
- **Booking:** the guest's committed paperwork (aggregate + lifecycle).
- **Inventory:** the permanent taking of the nights (a calendar/scarcity fact).
- "Reserve" the verb spans both — paperwork and nights — kept in separate contexts.

### Price / Rate *(kept apart by the field)*
- **Rate** (Inventory): per-night number before discounts/fees.
- **Price / quoted total** (Inventory): all-in computed amount for dates + party size.
- **Price Snapshot** (Booking): frozen agreed total — the only truth of what the guest owes once booked.
- **"From" Price** (Catalog): non-binding headline teaser.

### Booking / "Book" *(verb vs noun)*
- **Booking (noun):** the reservation aggregate + lifecycle.
- **"Book" (verb, guest-facing):** the *entire saga* — hold, settle, confirm.
- Trap: "the booking failed" — pin down which step (hold, payment, or state transition).

### Confirmed vs Completed
- **Confirmed:** secured, *before* the stay.
- **Completed:** consumed, *after* check-out. The state machine forbids skipping — cannot Complete what was never Confirmed.

---

## Reviewer notes (two tensions named, not papered over)

1. **The Availability gap is intentional.** Search-side availability is fast-and-approximate; inventory-side is slow-and-truthful. Merging them sacrifices either shop-window responsiveness or the overbooking guarantee. Keep two words, two meanings.
2. **"Confirmed" must never be defined as "paid."** They travel together but assert different things (the stay vs the funds). Keeping Payment Confirmation a separate core context is what keeps that distinction honest.
