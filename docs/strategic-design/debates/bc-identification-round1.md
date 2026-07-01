# Phase 3 Debate — Bounded Context Identification (Round 1)

> Raw outputs from the four role agents, invoked concurrently and blind to each other, plus the difference summary and the user's decisions. 2026-07-02.

---

## Raw agent outputs

### Domain Expert (language boundaries)

Boundaries drawn where the same word stops meaning the same thing.
- **Reservation (Core)** — the guest's promise-to-stay lifecycle; Booking status, DateRange, PartySize, PriceSnapshot, CancellationPolicy. "Booking" = the commitment a guest has made.
- **Availability (Core)** — supply-side truth: Calendar, blocked/open dates, no-overlapping-dates invariant. Language is about *what capacity remains*.
- **Payment Confirmation (Core)** — reconciliation: "money has been confirmed for this booking." Distinct from moving money.
- **Money Movement (Generic)** — Stripe behind the ACL; "PaymentIntent" here is Stripe's object.
- **Listing Catalog & Search (Supporting)** — "Listing" = marketed offer (read-oriented), not the consistency root Availability guards.
- **Host Management (Supporting)**, **Identity & Access / Notifications (Generic)**.
- Same-word-different-meaning: **Hold** (Reservation = "payment window open, Pending" vs Availability = "dates tentatively removed, TTL"); **Guest** (person/account vs headcount/party size); **Availability** (bookable supply vs "is this listing shown").
- Verdicts: Hold → Availability owns capacity hold, Reservation owns Pending. Pricing → own BC. Payments → split. Notifications → downstream consumer, not a modeling BC.

### Solution Architect (structure / cohesion / autonomy)

BC candidates: Booking Lifecycle, Availability/Inventory, Pricing/Rates, Listing Catalog & Search, Host Management, Payment Confirmation, Payment Money-Movement, Identity & Access, Notifications.
Dependencies (`A -> B` = B depends on A):
```
Availability      -> Booking          (Customer/Supplier; Booking holds/commits slots)
Pricing           -> Booking          (Booking copies priceSnapshot; Conformist at snapshot)
Payment Money-Mvt -> Payment Confirm  (ACL; vendor shape translated)
Payment Confirm   -> Booking          (Customer/Supplier; drives Confirmed via Saga)
Listing (write)   -> Search (read)    (projection; Open Host)
Identity          -> all              (Generic, upstream)
Booking           -> Notifications    (Published Language via Outbox)
Availability      -> Notifications    (event consumer)
```
Verdicts: **Hold → Availability** (its consistency boundary is the calendar slot; Booking references it). **Pricing → own BC** even if co-deployed (different change cadence; Booking depends via immutable snapshot). **Payments → own BC + ACL**, not a Booking adapter (avoid leaking webhook/idempotency into Booking). **Notifications → consumer**, owns no invariant. Watch-out: the `packages/shared` Shared Kernel is web↔api contract coupling, NOT a BC-to-BC domain kernel.

### Tech Lead (build & operate)

Modular monolith (`apps/api`, one Postgres); logical BCs, not microservices.
- **Booking + Availability = ONE BC, ONE transaction, ONE team.** Overbooking invariant + Hold must commit atomically with Booking; hold-then-book across a network = double-book window. Hold lives in the Availability aggregate; Booking references it. Enforce via Postgres `EXCLUDE` or `version` optimistic lock (DB, not app code).
- **Payments (reconciliation)** = same deployment, own transaction + ACL. Stripe webhook inherently async; handler idempotent (dedupe on `paymentIntentId`); Saga confirms in a separate transaction. Expiry compensation via a **scheduled job**, not webhook-dependent (Hold TTL 15 min is the safety net).
- **Notifications** = async, Outbox-driven, folded into the deploy; a poller gives at-least-once; email failure must never roll back a confirmed booking.
- **Pricing = fold into Availability now** (synchronous read; `priceSnapshot` at Hold time).
- Identity, Listing/Search, Host, Reviews = logical modules, sync REST, same deploy; Search uses CQRS read models.
- Deployment seams that earn independence for MVP: none. Only forced async seams = Stripe webhook (external) and Outbox→Notifications (reliability).

### Product Owner (priority / release)

- **P0 cut line:** Identity & Access, Listing Catalog & Search, Availability/Overbooking, Booking Lifecycle, Payment Confirmation → search → reserve → pay → confirm.
- **P1:** Host Management (seed data covers MVP). **P2:** Reviews.
- Ride-along: **Pricing** with Availability/Catalog (base snapshot suffices; split once discounting moves conversion); **Money-Movement** ships in P3, no standalone value; **Notifications** rides with Booking/Payment (P3 email).
- Strongest point: protect the P0–P3 cut line ruthlessly; the three Core differentiators + funnel + gate are the only non-negotiables.

---

## Difference summary

**Converged (no decision needed):**
- Hold → **Availability** owns it; Booking references (DE, SA, TL).
- **Payments** = Payment Confirmation BC (Core) + Money-Movement behind Stripe ACL (Generic); not a Booking adapter (all).
- **Notifications** = downstream Outbox **consumer**, not a peer BC (all).
- Identity, Catalog & Search, Host Management, Reviews each a distinct context (all).

**Conflicts put to the user:**
- **A. Booking & Availability — two BCs or one?** DE + SA: two (Availability upstream, Customer/Supplier). TL: one BC/one transaction (atomicity). PO: neutral.
- **B. Pricing — own BC or folded?** DE + SA: own BC. TL + PO (+ PRD §5.1): fold now, split later.

---

## User decisions

- **A → Two BCs, one transaction at the Hold seam.** Availability (upstream, owns Hold + overbooking invariant) and Booking (downstream, owns lifecycle) stay as two logical BCs in a Customer/Supplier relationship, but commit atomically at the Hold seam inside the modular monolith. Honors both the language split (DE/SA) and TL's atomicity constraint.
- **B → Fold Pricing into Availability/Inventory now, with a documented seam** to extract as its own BC once rate rules grow (matches TL, PO, and PRD §5.1).
