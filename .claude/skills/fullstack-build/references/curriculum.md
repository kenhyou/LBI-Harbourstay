# Harbourstay Full-Stack Curriculum — Slice by Slice

This is the authoritative per-slice detail referenced by `SKILL.md`. Each slice cuts through the whole stack and ends runnable. Backend substeps keep the hexagon (see `conventions.md`); frontend substeps use Next.js App Router + RSC.

Paths are relative to the repo root. Backend = `apps/api`, frontend = `apps/web`, contract = `packages/shared`.

**Rule:** finish, verify (`integration-verifier`), and record a slice before starting the next. Do not auto-advance.

---

## P0 — Monorepo Scaffold

**Goal:** a live skeleton both ends run against, with CI. No domain yet.

**Backend/infra substeps**
1. `pnpm` + Turborepo workspace: `apps/web`, `apps/api`, `packages/shared`, `packages/tsconfig` (shared TS config). Root `turbo.json` with `dev`, `build`, `lint`, `typecheck`, `test` pipelines.
2. `apps/api`: `nest new` inside the workspace; add `@nestjs/config`, `@nestjs/cqrs`, `@nestjs/swagger`, `prisma` + `@prisma/client`, `pino`/`nestjs-pino`, `@nestjs-cls/transactional` (+ Prisma adapter). Health endpoint `GET /health`.
3. `prisma/schema.prisma` with a Postgres datasource; `docker-compose.yml` running Postgres. First migration is empty or a trivial table.
4. `apps/web`: `create-next-app` (App Router, TS, Tailwind) inside the workspace; add shadcn/ui, TanStack Query provider, a base layout. One page that fetches `GET /health` **through a shared contract type** and renders it.
5. `packages/shared`: a `health` Zod schema + inferred type, exported and imported by **both** apps (proves end-to-end type safety).
6. CI: GitHub Actions running `lint`, `typecheck`, `test`, `build` on push. README skeleton with a CI badge slot.

**Definition of Done**
- `pnpm dev` runs both apps; the web page shows live data from the api `/health` via the shared type.
- CI is green. (PRD P0 bar: both deployed to public URLs with a green badge — do that if the user wants the full P0, else deploy can follow S4.)
- `docs/build/PROGRESS.md` created from the template.

**ADR candidates:** monorepo (Turborepo+pnpm) rationale; Prisma-behind-a-repository-port decision (write the decision now, implement in S1).

---

## S1 — Listing Search & Detail  (PRD P1 · BC: Inventory/Availability, read side)

**Goal:** guests search and view listings, served from a CQRS **read model** (no domain reconstitution).

**Contract** (`packages/shared`): `ListingSearchQuery` (location, from, to, guests), `ListingSummary`, `ListingDetail` schemas + types.

**Backend** (`apps/api`, `inventory` BC)
1. Prisma models: `Listing`, `AvailabilityBlock`/`RatePlan` (per PRD §10). Migration + seed script with demo listings.
2. Read side only this slice: `ListingQueryPort` (abstract class) + `@QueryHandler` returning `ListingSummary[]` / `ListingDetail`. Implement the port in `infra/queries/` projecting Prisma rows straight into Read Model DTOs — **no aggregate, no mapper**.
3. `presenters/http`: `GET /listings` (search) and `GET /listings/:id`. Swagger annotations.
4. Tests: integration test (Testcontainers Postgres) asserting search filters + detail shape; the query path does not import domain models.

**Frontend** (`apps/web`)
1. Typed API client in `lib/api/` using the shared contract.
2. `/listings` **Server Component** page: server-side fetch, render results; search form (RHF + Zod) driving query params.
3. `/listings/[id]` detail RSC page.
4. Loading (`loading.tsx`) and error (`error.tsx`) states; basic a11y.
5. Test: a Playwright smoke — search shows results, click through to detail.

**Definition of Done:** search + detail work in the browser against seeded data; read path bypasses the domain; tests green.

---

## S2 — Authentication & Roles  (PRD M1 · BC: Identity & Access)

**Goal:** register/login with JWT (access + refresh) stored in an httpOnly cookie; RBAC `guest`/`host`/`admin`.

**Contract:** `RegisterRequest`, `LoginRequest`, `AuthUser`, `Role` enum.

**Backend** (`identity` BC)
1. Domain: `User` aggregate (id, email, passwordHash, role), `Email` VO, password hashing in an application service (bcrypt/argon behind a port — no crypto in domain).
2. Application: `RegisterUser`, `LoginUser` commands + handlers; issue tokens via an `AuthTokenPort`.
3. Infra: Prisma `User` repository behind the port; `AuthTokenPort` impl (JWT); refresh handling.
4. Presenters: `POST /auth/register|login|refresh`; set httpOnly cookie; `RolesGuard` + `@Roles()` decorator.
5. Tests: domain (email validation, role invariants) unit; integration for register→login→refresh; guard unit test.

**Frontend**
1. Login + signup pages (RHF + Zod); server actions or route handlers that call the api and set the cookie.
2. Session helper (read cookie server-side); redirect/guard for protected routes; a header showing the signed-in user.
3. Test: Playwright login journey.

**Definition of Done:** a user can register, log in, stay logged in across reloads, and hit a role-guarded route; tokens are httpOnly.

---

## S3 — Availability + Booking Hold  (PRD P2 · BC: Booking + Inventory) — the hard one

**Goal:** create a Booking in `PendingPayment` with a time-boxed **Hold**, and **prove no double-booking** under concurrency.

**Contract:** `AvailabilityQuery`, `CreateBookingRequest` (listingId, dateRange, guests), `BookingSummary`, `BookingStatus` enum.

**Backend** (`booking` + `inventory` write side)
1. Domain: `Booking` aggregate with the state machine `PendingPayment → Confirmed → Completed` (+ `Cancelled`/`Expired`/`NoShow`), `DateRange` VO (overlap/contains/equality tests), invariants (check-in < check-out, guests ≤ capacity), `priceSnapshot`. Inventory owns `Availability`/`Hold` authority (per STRATEGIC.md decision).
2. Concurrency: overbooking prevented by **optimistic locking (`version` column)** or a Postgres **`EXCLUDE`/unique constraint** — this is an explicit ADR decision. Implement in the Inventory repository.
3. Application: `PlaceHold`/`CreateBooking` command spanning Booking + Inventory under one transaction (via the transaction-manager port; application stays Prisma-free). `GET /listings/:id/availability` read model.
4. Presenters: `POST /bookings` (create Hold → PendingPayment), `GET /listings/:id/availability`.
5. Tests: domain state-machine (positive + negative per transition), `DateRange` VO; **integration concurrency test** — two overlapping bookings race; exactly one succeeds. (Stretch: k6.)

**Frontend**
1. Availability calendar on the listing detail page (client component, TanStack Query).
2. Checkout-start flow: pick dates/guests → `POST /bookings` → land on a pending-payment page showing the Hold + TTL countdown.
3. Test: Playwright — reserve dates, see pending booking.

**Definition of Done:** a Hold is created and shown; the concurrency test proves zero double-booking; state machine cannot skip states.

---

## S4 — Payment Saga + Outbox + Confirmation  (PRD P3 · BC: Payments + Notifications + Booking) — minimum deployable cut line

**Goal:** complete a booking end-to-end: Stripe test payment → webhook → `BookingCheckoutSaga` confirms → Outbox emits `BookingConfirmed` → Notifications sends the confirmation email.

**Contract:** `CreatePaymentIntentResponse` (clientSecret), `StripeWebhookEvent` (validated), `BookingConfirmedEvent` payload.

**Backend**
1. Payments BC behind a **Stripe ACL** (adapter translating Stripe's shape → our model). `POST /bookings/:id/pay` creates a PaymentIntent; `POST /webhooks/stripe` is **idempotent** (idempotency key from the event) and drives the saga.
2. `BookingCheckoutSaga` (process manager): on `payment_succeeded` → Booking `Confirmed`, commit the Hold, emit `BookingConfirmed`; on failure/timeout → release Hold, Booking `Expired` (compensation).
3. **Transactional Outbox:** write the `outbox_events` row in the **same transaction** as the state change; a polling relay (`@Interval`) publishes and stamps `published_at`; subscribers idempotent.
4. Notifications BC: `@EventsHandler` on `BookingConfirmed` sends a (test) confirmation email via a mailer port.
5. Tests: webhook idempotency (same event twice → one confirm); saga retry + compensation paths; outbox relay delivers after a simulated crash.

**Frontend**
1. Stripe payment page (Stripe.js / Payment Element) using the clientSecret; success/failure redirects.
2. Confirmation page after `Confirmed`.
3. Test: Playwright end-to-end with a Stripe test card — search → reserve → pay → confirmation (this is PRD §3's headline success criterion).

**Definition of Done:** the full journey works with a Stripe **test** card; webhook is idempotent; email is emitted via the Outbox; **this is the deployable cut line** — deploy web/api/db to public URLs now if not already.

---

## S5 — My Bookings + Cancel  (PRD M5 · BC: Booking)

**Goal:** guests see their bookings and cancel within policy.

- **Contract:** `MyBookingsQuery`, `BookingDetail`, `CancelBookingRequest`.
- **Backend:** `GET /me/bookings`, `GET /bookings/:id` (read models); `POST /bookings/:id/cancel` applying the cancellation policy (domain method); release Hold/availability as needed.
- **Frontend:** my-bookings list + detail; cancel action with policy messaging and confirm dialog.
- **Tests:** cancel policy (positive + negative: too-late cancel rejected); Playwright cancel journey.

**Definition of Done:** a guest lists bookings and cancels one within policy; a disallowed cancel is rejected with a clear message.

---

## S6 — Host Dashboard  (PRD P4 · BC: Inventory + Identity)

**Goal:** hosts manage listings, availability/rates, and view their bookings — all behind RBAC `host`.

- **Contract:** `HostListingUpsert`, `AvailabilityUpsert`, `HostBookingSummary`.
- **Backend:** `POST/PATCH/DELETE /host/listings`, availability/rate mgmt, `GET /host/bookings`; `@Roles('host')`; ownership checks (a host edits only their listings).
- **Frontend:** host dashboard, listing editor (RHF + Zod), availability/rate manager, bookings list; image upload (object storage) is a Should — include if time.
- **Tests:** authorization (a host cannot edit another host's listing); listing CRUD integration; Playwright host flow.

**Definition of Done:** a host creates/edits a listing, blocks dates, and sees bookings; a non-owner is forbidden.

---

## S7 — Hardening  (PRD P5)

**Goal:** ship-quality pass. No new domain.

- **E2E:** flesh out Playwright journeys (guest booking, host management).
- **Security baseline (OWASP Top 10):** helmet, CORS, rate limiting, Zod validation everywhere, per-role authorization audit, secrets in env, parameterized queries (Prisma). Depth is out of scope (PRD §9).
- **Observability:** pino structured logging, health checks; (stretch) OpenTelemetry/Sentry.
- **Delivery metrics:** a `docs/build/delivery-metrics.md` documenting deployment frequency / lead time (DORA); CI + coverage badges in README.
- **Docs:** finalize README (problem, architecture diagram, tech rationale, run instructions, API docs link, live links) and the `adr/` set (≥3 ADRs per PRD §3).

**Definition of Done:** README top shows green CI + coverage badges and live links; ≥3 ADRs; E2E + integration + unit all pass; OWASP baseline checklist complete.

---

## Stretch (PRD §6 Could / §12 Stretch)

Redis read-model projection/caching · a real broker (RabbitMQ/Redis Streams) for outbox delivery · iCal availability sync · i18n (en/ko) · admin console. Each is a self-contained slice; only after S7 and only if the user asks.

---

## Slice Dependency Graph

```text
P0 ─▶ S1 (listings) ─┬─▶ S3 (booking hold) ─▶ S4 (payment saga) ─▶ S5 (cancel)
      S2 (auth) ─────┘                                              
      S1 + S2 ───────────────────────────────────────────────────▶ S6 (host)
      S4 ──────────────────────────────────────────────────────── ▶ S7 (hardening, needs it all)
```

S3 needs S1 (listing model) + S2 (a signed-in guest). S4 needs S3. S6 needs S1 + S2. Respect this unless the user explicitly reorders.
