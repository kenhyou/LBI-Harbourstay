# Phase 2: Subdomain Classification

> Problem-space classification (Core / Supporting / Generic). Inputs: `01-discovery.md`, plus the `domain-expert` and `product-owner` debate. Final classification decided by the user.

## Classification Table

| Subdomain | Type | Business-Value Rationale | Differentiator |
|---|---|---|---|
| **Booking Lifecycle** | **Core** | The reservation state machine (hold → confirm → complete/cancel/expire, no state skipped) is *the* product; drives the top KPI (end-to-end booking success). | **yes** |
| **Availability / Overbooking Prevention** | **Core** | "The same night is never sold twice" — a domain invariant over overlapping date ranges; the strongest differentiator vs cheaper clones. | **yes (strongest)** |
| **Payment Confirmation (reconciliation)** | **Core** | The domain-meaningful line "when is a booking *truly paid*, and how does that reconcile to confirmation?" — Harbourstay's second promise: reliable confirmation. | **yes** |
| **Payment Money-Movement (Stripe)** | **Generic** | Actual charge/settlement is commodity, owned by Stripe (test mode), isolated behind an ACL. Bought, not built. | no |
| **Pricing / Rate Rules** | Supporting | Nightly rates, LOS discounts, fees lift booking value but *serve* booking; MVP survives on a flat price snapshot. | no |
| **Listing Catalog & Search** | Supporting | Guests can't book what they can't find — table-stakes; competitors do it equally well. | no |
| **Host Management** | Supporting | Supply-side entry; enables real inventory but delivers no guest-visible edge; deferrable past the cut line. | no |
| **Reviews** | Supporting (Could) | Drives retention/trust over time; irrelevant to first booking success. | no |
| **Identity & Access** | Generic | Login gates booking but is commodity; invest the minimum. | no |
| **Notifications** | Generic | Confirmation email is the closing UX signal but universal; the *decision* to notify belongs to Booking. | no |

## Final Classification Rationale (user decision)

The user adopted the two roles' convergent view: the **Core, differentiating trio is Booking Lifecycle, Availability/Overbooking Prevention, and Payment Confirmation**. Both roles independently split the initial "Inventory" guess into a Supporting *catalog* and a Core *availability/overbooking* invariant — the user accepted that split. On the single point of disagreement, the user chose the **Domain Expert's finer split of Payments**: the Stripe money-movement is **Generic** (isolated behind an ACL), while the payment↔booking **reconciliation** is **Core**, because "reliable confirmation" is a stated differentiator and the semantic line between *payment attempted* and *booking confirmed* is one users care about. Pricing, Listing/Search, Host Management, and Reviews are **Supporting**; Identity & Access and Notifications are **Generic**.

## Note for Phase 6 reflection

The initial guess (`initial-bc-guess.md`) had **Inventory: listings** as one lump. Phase 2 already pulled *availability/overbooking* out of it as a separate Core concern — the first shift from the user's intuition. Whether that becomes a separate **Bounded Context** is Phase 3's question.
