# Phase 3: Bounded Contexts

> Solution-space boundaries, decided after the four-role debate ([debates/bc-identification-round1.md](debates/bc-identification-round1.md)). All BCs are **logical** contexts co-deployed in the `apps/api` modular monolith (one Postgres); "autonomy" notes where a real transaction/async seam exists.

## BC List

### BC-1: Booking  *(Core)*
- **Responsibility**: Owns the reservation lifecycle — the state machine `PendingPayment → Confirmed → Completed`, plus `Cancelled`/`Expired`/`NoShow` (no state skipped). Owns the *commitment* a guest has made.
- **Included concepts**: Booking, BookingStatus, DateRange, PartySize, PriceSnapshot, CancellationPolicy, a *reference* to a Hold.
- **Excluded concepts**: the capacity Hold itself (Availability owns it); rate calculation (Inventory/Pricing); payment reconciliation (Payment Confirmation).
- **Owning subdomain**: Core (Booking Lifecycle).
- **Autonomy**: co-deployed; **commits atomically with Availability at the Hold seam** (user decision A).

### BC-2: Availability & Inventory  *(Core; Pricing folded in)*
- **Responsibility**: The supply-side source of truth — the availability calendar and the **no-overlapping-dates / overbooking invariant** — and the canonical Listing definition (capacity, base rate). **Owns the Hold** (a TTL-bound tentative removal of dates from supply). Pricing (rates/discounts/fees) is **folded in for now** with a documented seam to extract later (user decision B).
- **Included concepts**: Listing (canonical/write), Calendar, AvailabilityBlock, Hold, RatePlan, Rate, Fee, Capacity.
- **Excluded concepts**: booking status/lifecycle (Booking); the guest-facing *marketed* listing view (Catalog & Search); who the guest is (Identity).
- **Owning subdomain**: Core (Availability/Overbooking) + Supporting (Pricing, folded).
- **Autonomy**: co-deployed; owns the strong-consistency transaction (Postgres `EXCLUDE` or optimistic `version`). **Documented seam: extract Pricing when rate rules grow.**

### BC-3: Payment Confirmation  *(Core)*
- **Responsibility**: Reconciliation — the domain fact "payment is confirmed for this booking." Owns idempotent webhook state; drives Booking → `Confirmed` via the BookingCheckoutSaga.
- **Included concepts**: PaymentConfirmation, PaymentIntent (our concept), Succeeded/Failed, idempotency key.
- **Excluded concepts**: actually moving money (Money Movement); booking state transitions (Booking owns them, this BC triggers them).
- **Owning subdomain**: Core (Payment Confirmation).
- **Autonomy**: co-deployed; **own transaction**, driven by the **async** Stripe webhook; Customer/Supplier → Booking via Saga.

### BC-4: Money Movement  *(Generic — Stripe ACL)*
- **Responsibility**: Integrate Stripe (test mode) to actually charge; translate Stripe's shape into our confirmation fact through an **Anti-Corruption Layer**.
- **Included concepts**: Stripe PaymentIntent (vendor), client secret, webhook event.
- **Excluded concepts**: our reconciliation semantics (Payment Confirmation).
- **Owning subdomain**: Generic (Money-Movement).
- **Autonomy**: isolated behind the ACL; upstream to Payment Confirmation.

### BC-5: Listing Catalog & Search  *(Supporting — CQRS read side)*
- **Responsibility**: The guest-facing *marketed offer* view — search and detail, served from read-optimized projections. "Listing" here means the searchable presentation, not the consistency root.
- **Included concepts**: ListingSummary, ListingDetail, search filters (location/date/party-size), SearchResult.
- **Excluded concepts**: the canonical write-side Listing + invariant (Inventory).
- **Owning subdomain**: Supporting (Listing Catalog & Search).
- **Autonomy**: co-deployed; CQRS **read model** projected from Inventory (+ Pricing). Downstream/projection of BC-2.

### BC-6: Host Management  *(Supporting — deferred P4)*
- **Responsibility**: The host-facing administrative surface — create/edit listings, manage availability & rates, view incoming bookings. Different actor (host) and change cadence.
- **Included concepts**: host listing edits, availability/rate management commands, host bookings view.
- **Excluded concepts**: the guest booking flow; the overbooking invariant itself (it issues commands into Inventory, which enforces it).
- **Owning subdomain**: Supporting (Host Management).
- **Autonomy**: co-deployed; host-facing command surface over Inventory. Deferred past the cut line (P4).

### BC-7: Identity & Access  *(Generic)*
- **Responsibility**: Users, roles (`guest`/`host`/`admin`), authentication (JWT + refresh).
- **Included concepts**: User, Role, Credentials, Session/Token.
- **Excluded concepts**: party size / headcount (that "Guest" lives in Booking/Availability).
- **Owning subdomain**: Generic.
- **Autonomy**: independent; upstream to all (Generic).

### BC-8: Notifications  *(Generic — Outbox consumer)*
- **Responsibility**: Deliver event-driven email (e.g. booking confirmed). Owns no domain invariant.
- **Included concepts**: notification/email templates, delivery, subscription to domain events.
- **Excluded concepts**: the *decision* to notify (that belongs to Booking, emitted via the Outbox).
- **Owning subdomain**: Generic.
- **Autonomy**: **async** downstream consumer of Published-Language events over the Transactional Outbox; nothing depends on it.

### BC-9: Reviews  *(Supporting — Could / deferred)*
- **Responsibility**: Guest reviews/ratings tied to a completed booking.
- **Included concepts**: Review, Rating, Comment.
- **Owning subdomain**: Supporting.
- **Autonomy**: co-deployed; deferred (stretch).

## BC Split Decision Rationale (written by the user)

> User's own words (2026-07-02), confirming the 9-BC list:

"Availability is a listing of products. Booking is how a user owns the inventory."

Raw debate: [debates/bc-identification-round1.md](debates/bc-identification-round1.md)
