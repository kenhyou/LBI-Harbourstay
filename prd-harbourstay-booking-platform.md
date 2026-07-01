---
type: project
note_kind: deliverable
linkable: false
status: active
created: 2026-07-01
updated: 2026-07-01
language: en
authorship: mixed
privacy: personal
related_to:
  - [[ota-booking-architecture]]
  - [[nextjs-app-router-rsc]]
  - [[domain-driven-design]]
  - [[cqrs]]
  - [[saga-process-manager]]
  - [[transactional-outbox]]
  - [[dora-metrics]]
  - [[test-pyramid]]
  - [[owasp-top-10]]
---

# PRD — Harbourstay (OTA Stay & Tour Booking Platform)

> **Type:** Product requirements for a full-stack booking application.
> **Working title:** Harbourstay (rename freely).
> **Key decisions:** Domain = short-stay accommodation & tour booking (OTA). Codebase = a fresh repo built on proven DDD/CQRS patterns. Security = solid baseline only; deep security/audit/compliance is out of scope so the product can go deep on domain modeling and architecture.

---

## 1. Background & Purpose

- **Harbourstay is a short-stay accommodation and tour booking platform (OTA).** Guests search availability, reserve, pay, and receive confirmation; hosts list properties and manage availability and rates.
- **The product centers on a rich booking domain.** The reservation lifecycle (search → reserve → confirm → pay → cancel) spans inventory, availability, pricing, concurrency, and reliable payment confirmation, and maps cleanly onto an order-management-style domain model.
- **The system deliberately exercises the harder full-stack concerns:** a modern Next.js front end, a layered Domain-Driven Design back end, and a real test pyramid.

## 2. Goals & Non-goals

**Goals**
- G1. A **deployed** full-stack booking app — the reservation flow actually runs at a public URL.
- G2. Implement **DDD + CQRS + Saga + Transactional Outbox** against a real problem (overbooking prevention and reliable payment confirmation). This is the core of the system.
- G3. A real **test pyramid**: domain unit tests → integration tests (with ephemeral containers) → a few end-to-end tests.
- G4. **CI/CD with delivery-metrics visibility**: `main` is always green, deploys are automated, and deployment frequency / lead time are tracked.
- G5. **Complete documentation**: a README carrying problem statement, architecture diagram, technology rationale, run instructions, API docs, and a live link — plus Architecture Decision Records (ADRs).

**Non-goals (explicitly out of scope — scope defense)**
- N1. Multi-tenancy or production-scale rollout (mention in design only).
- N2. Deep security, auditing, governance, or regulatory compliance.
- N3. Native mobile app, real-time chat, ML recommendations.
- N4. Real payment settlement / refunds accounting. **Stripe test mode only** — no real money movement.

## 3. Success Criteria

- [ ] Front end, back end, and database are **deployed to public URLs**, and one guest booking succeeds end-to-end (search → reserve → pay in test mode → confirmation email).
- [ ] README top shows a green CI badge, a test-coverage badge, and the live deployment links.
- [ ] Domain unit tests + integration tests + at least one end-to-end scenario all pass.
- [ ] An architecture diagram plus **three or more ADRs** (e.g., why CQRS, why Outbox, why Prisma-behind-a-repository).

## 4. Users & Personas

| Persona | Goal | Key screens |
|---|---|---|
| **Guest** (booker) | Search stays/tours → choose dates & party size → reserve & pay | Search, detail, checkout, my bookings |
| **Host / Operator** (supplier) | List a property, manage availability & rates, review bookings | Dashboard, listing editor, bookings list |
| **Admin** (optional / stretch) | Approve listings, manage users | Admin console |

Role-based access control (RBAC): `guest` / `host` / `admin`.

## 5. Domain Model (DDD — the core of this app)

This project uses **Domain-Driven Design**: the business rules live in a pure `domain` layer with no framework or ORM dependencies, and everything else (HTTP, persistence, external services) is an adapter around it.

### 5.1 Bounded Contexts
A *bounded context* is a boundary within which a model and its terms have one precise meaning.

- **Booking** (core domain) — the reservation lifecycle and its policies. The heart of the app.
- **Inventory / Availability** — listings, availability calendars, and the overbooking-prevention invariant.
- **Pricing** — nightly rates, length-of-stay discounts, fees (initially folded into Inventory; split out if it grows).
- **Payments** — Stripe PaymentIntent integration and payment-state reconciliation. Stripe is isolated behind an **Anti-Corruption Layer (ACL)** — an adapter that translates Stripe's shape into our own model so vendor concepts don't leak into the domain.
- **Identity & Access** — users, roles, authentication.
- **Notifications** — event-driven email (e.g., booking confirmed).

### 5.2 Aggregates & Invariants
An *aggregate* is a cluster of objects treated as a single consistency boundary; all changes go through its root and must keep the root's invariants true.

- **Booking** (aggregate root): `{ guestId, listingId, dateRange, guests, status, priceSnapshot }`
  - State machine: `PendingPayment → Confirmed → Completed`, or `Cancelled` / `Expired` / `NoShow`. **No state may be skipped** (cannot `Complete` without first `Confirm`).
  - Invariants: valid date range (check-in < check-out), guests ≤ capacity, cancellation policy applied.
- **Listing / Availability** (aggregate root): the key invariant is **no double-booking of overlapping date ranges**, which forces real **concurrency control** — optimistic locking via a `version` column, or a database exclusion constraint.
- **Payment**: the PaymentIntent and its status, with **idempotent webhook handling** (defends against duplicate provider events).

### 5.3 Saga (process manager)
A **Saga** coordinates a multi-step, long-running process across aggregates/contexts and defines a **compensating action** for each step so a partial failure can be unwound.

**BookingCheckoutSaga:**
1. Create the Booking (`PendingPayment`) and place an **availability Hold** with a TTL (e.g., 15 minutes).
2. Create a Stripe PaymentIntent; the client completes payment.
3. On webhook `payment_succeeded` → move Booking to `Confirmed`, commit the Hold into a real reservation, and emit a `BookingConfirmed` domain event.
4. **Compensation:** on payment failure or timeout → release the Hold and set Booking to `Expired`.

### 5.4 Reliability — Transactional Outbox
The **Transactional Outbox** pattern writes domain events (e.g., `BookingConfirmed`) into an `outbox` table **in the same database transaction** as the state change. A separate publisher polls the table and delivers them (to Notifications, etc.). This guarantees that a side effect (like a confirmation email) is never lost even if the process crashes right after commit, giving **at-least-once** delivery.

### 5.5 CQRS (Command Query Responsibility Segregation)
**CQRS** separates the write model from the read model:
- **Command side**: writes go through the aggregates above, which enforce invariants.
- **Query side**: search, the availability calendar, and booking lists are served from **read models** (denormalized views or dedicated read tables) optimized for reading, separate from the write model. (Initially plain SQL views / dedicated queries; a Redis projection is a stretch goal.)

## 6. Functional Requirements (MoSCoW)

**Must (MVP — the minimum deployable/demoable slice)**
- M1. Sign-up / login (email + password, JWT with refresh), roles.
- M2. Listing search & browse (location / date / party-size filters) and detail pages.
- M3. Availability lookup (calendar) with double-booking prevention.
- M4. Create booking (Hold) → Stripe test-mode payment → confirmation → confirmation email (via Outbox).
- M5. My-bookings list & detail; cancel booking (respecting policy).
- M6. Host: listing CRUD + availability/rate management + bookings list.

**Should**
- S1. Rate rules (length-of-stay discount, weekend pricing) and fee display.
- S2. Reviews / ratings (simple).
- S3. Search pagination & sorting; image upload (object storage).

**Could (stretch)**
- C1. Redis read-model projection / caching.
- C2. A real message broker (RabbitMQ or Redis Streams) to publish outbox events.
- C3. iCal availability sync, i18n (en/ko), admin console.

**Won't (this iteration)** — deep security/audit/compliance, settlement/refund accounting, mobile app.

## 7. Architecture

```
             ┌──────────────────────────────┐
 Browser ───▶│  apps/web  (Next.js App Router)│  Server + Client Components
             │  Tailwind + shadcn/ui         │  React Hook Form + Zod
             └───────────────┬──────────────┘
                             │ REST (typed, OpenAPI) + shared contracts (packages/shared)
             ┌───────────────▼──────────────┐
             │  apps/api  (NestJS, DDD)      │
             │  ┌────────────────────────┐  │
             │  │ interface (controllers)│  │
             │  │ application (CQRS       │  │  Commands / Queries / Sagas
             │  │   handlers, ports)     │  │
             │  │ domain (aggregates,    │  │  pure, no framework
             │  │   value objects, events)│ │
             │  │ infrastructure         │  │  Prisma repos, Stripe ACL,
             │  │   (adapters)           │  │  Outbox publisher, mailer
             │  └────────────────────────┘  │
             └──────┬─────────────┬─────────┘
                    │             │
              ┌─────▼────┐   ┌────▼─────┐   ┌──────────────┐
              │PostgreSQL│   │ Outbox   │──▶│ Notifications│──▶ email (test)
              │ (+Redis  │   │ publisher│   │ worker       │
              │  stretch)│   └──────────┘   └──────────────┘
              └──────────┘        ▲
                             Stripe (test) webhooks
```

- **Hexagonal (ports & adapters):** the domain knows nothing about the framework or ORM; `infrastructure` implements the ports with Prisma, Stripe, and mailer adapters.
- **Monorepo (Turborepo + pnpm):** `apps/web`, `apps/api`, and `packages/shared` (contract types / DTOs / Zod schemas). The front end and back end **share the same contract types**, giving **end-to-end type safety** — a mismatch in the API contract fails at compile time rather than at runtime. This is a **Shared Kernel**: a small, deliberately shared model both sides depend on.

## 8. Technology Stack (concrete)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | **Next.js (App Router, React Server Components)** + TypeScript, Tailwind, shadcn/ui, TanStack Query (client state), React Hook Form + Zod | Market-consensus stack; RSC renders on the server by default and ships less JS to the browser |
| Backend | **NestJS** + TypeScript, `@nestjs/cqrs` (or a light custom bus) | Enterprise structure, dependency injection, first-class CQRS support |
| ORM / DB | **Prisma** + **PostgreSQL** | Type-safe migrations and queries; kept **behind repository ports** so the domain stays decoupled (recorded in an ADR) |
| Cache / read model | Redis (stretch) | Projections, locks, caching |
| Auth | JWT (access + refresh), role-based; the front end stores the session in an httpOnly cookie | Baseline security |
| Payments | **Stripe (test mode)** + webhooks | Real external integration; exercises async reliability and the Saga |
| Testing | Jest (unit), Supertest + **Testcontainers** (integration against a real Postgres), **Playwright** (end-to-end) | A genuine three-layer test pyramid |
| DevOps | Docker + docker-compose, **GitHub Actions** (lint / test / build / deploy) | CI/CD and delivery metrics |
| Deploy | web → **Vercel**, api → **Render / Fly.io / Railway**, DB → **Neon / Supabase** | Free/low-cost tiers, but genuinely deployed |
| Observability | Structured logging (pino), health checks; (stretch) OpenTelemetry / Sentry | Signals of operability |
| API docs | NestJS Swagger (OpenAPI) | A documented API is a maintainability plus |

> **Alternative note:** TypeORM (Data Mapper) is a common choice in enterprise/public-sector back ends; the design is identical if the ORM is swapped.

## 9. Non-Functional Requirements (NFR)

- **Performance:** search p95 < 500 ms (read models + indexes); paginated lists.
- **Concurrency:** zero double-bookings — guaranteed by optimistic locking or a Postgres `EXCLUDE` / unique constraint, proven with a test (stretch: a k6 load test).
- **Security (baseline):** OWASP Top 10 fundamentals — the standard list of the most critical web-app security risks (injection, broken access control, etc.). Concretely: input validation (Zod), parameterized queries (Prisma), authorization checks per role, rate limiting, secrets kept in env/secret manager, CORS + secure headers (helmet). (Depth is out of scope.)
- **Reliability:** idempotent webhooks, at-least-once events via the Outbox, health checks.
- **Accessibility / UX:** responsive, basic a11y (labels/focus), explicit loading and error states.

## 10. Data Model (key entities, summary)

- `User(id, email, passwordHash, role, createdAt)`
- `Listing(id, hostId, title, type[stay|tour], location, capacity, basePrice, images[], status)`
- `AvailabilityBlock / RatePlan(listingId, dateRange, price, isBlocked)`
- `Booking(id, guestId, listingId, dateRange, guests, status, priceSnapshot, holdExpiresAt)`
- `Payment(id, bookingId, stripePaymentIntentId, amount, status)`
- `OutboxEvent(id, type, payload, occurredAt, publishedAt?)`
- `Review(id, bookingId, rating, comment)` (Should)

## 11. API Surface (representative endpoints)

```
POST /auth/register | /auth/login | /auth/refresh
GET  /listings?location&from&to&guests          (search; read model)
GET  /listings/:id
GET  /listings/:id/availability?from&to
POST /bookings           (create Hold → PendingPayment)
POST /bookings/:id/pay   (returns Stripe PaymentIntent client secret)
POST /webhooks/stripe    (idempotent; payment_succeeded → Saga confirm)
GET  /me/bookings | GET /bookings/:id
POST /bookings/:id/cancel
--- host ---
POST/PATCH/DELETE /host/listings ...
GET  /host/bookings
```

## 12. Milestones (phased — each phase ends in a deployable increment)

> **Principle:** deploy from Phase 0 (even an empty app should be live). `main` stays green. Record the deployed link at the end of each phase (a "current status / next step" note before pausing).

| Phase | Content | Deliverable / evidence | Rough effort |
|---|---|---|---|
| **P0 Scaffold** | Turborepo, web + api "hello world" **deployed**, CI green, README skeleton, docker-compose | 2 live links, CI badge | ~1 wk |
| **P1 Listing read** | Listing/Availability domain + search & detail (RSC), seed data | search + detail demo | ~1.5 wk |
| **P2 Booking write** | Booking aggregate, state machine, **overbooking prevention**; domain unit tests + integration tests | working Hold, tests pass | ~2 wk |
| **P3 Payment Saga** | Stripe test, webhook, **BookingCheckoutSaga**, Outbox, confirmation email | end-to-end booking works ✅ (**minimum deployable cut line**) | ~2 wk |
| **P4 Host dashboard** | Listing management + bookings list + RBAC | host flow demo | ~1.5 wk |
| **P5 Hardening** | E2E (Playwright), OWASP baseline, observability, **delivery-metrics doc**, README/ADRs finalized, demo data | finished repo + diagram | ~1.5 wk |
| Stretch | Redis read model, broker, iCal, i18n | — | later |

> **Minimum deployable cut line = P0–P3** (~6–7 weeks): a live app that runs search → reserve → pay (test) → confirm. P4–P5 raise polish and completeness. If time slips, cut a "finished snapshot" at P3, tidy the README, then continue to P4.

## 13. Testing Strategy — the pyramid

- **Unit (many, fast):** pure domain logic — aggregate state transitions, invariants (date overlap, capacity, cancellation policy), pricing calculation. No I/O.
- **Integration (fewer):** application handlers + repositories against a **real Postgres via Testcontainers**; the Stripe webhook handler with a stubbed provider; Outbox publish.
- **End-to-end (fewest):** at least one **Playwright** journey through the deployed front end — search → reserve → pay (Stripe test card) → see confirmation.

## 14. Risks & Open Questions

- **Scope creep (biggest risk):** the plan is ambitious for limited weekly time. → Fix **P3 as the cut line**; treat all stretch items as truly-optional.
- Local Stripe webhook testing needs the Stripe CLI / a tunnel — budget setup time.
- Temptation to over-engineer DDD — balance against readability/maintainability; use ADRs to justify "why this complexity."
- Front-end polish needs deliberate investment in P1 and P5.
- (open) Stay (date range) vs. tour (time slot) for the MVP — **recommend stay (date range) first**, generalize the model, add tours as an extension. To confirm.
- (open) Final product name and niche (boutique stays? Sydney experiences?).

## 15. Next Steps (kick-off)

1. Review & confirm this PRD (product name; stay-first for the MVP).
2. **Scaffold a fresh repo** (Turborepo) in a separate directory; copy this PRD into `docs/PRD.md` and start an `adr/` folder.
3. Start at P0. Record the deployed link at the end of each phase.
