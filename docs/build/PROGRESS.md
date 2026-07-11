# Harbourstay Build Progress

> Updated at the end of every slice. One row per slice; newest note at the bottom of each slice block.
> This file is the **single source of truth for build state** — CLAUDE.md / AGENT.md carry only the rules and point here.

## Status at a glance

| Slice | PRD milestone | State | Working evidence |
|---|---|---|---|
| P0 Scaffold | P0 | ☑ done | local `pnpm dev` — `/health` end-to-end; CI green locally |
| S1 Listing search & detail | P1 | ☑ done | `/listings` search + `/listings/:id` detail over seeded Postgres; 15 api tests + 5 Playwright green |
| S2 Auth | M1 | ☑ done | register/login → httpOnly-cookie JWT session, RBAC guard; **Ken wrote the domain layer**; 77 api tests + 4 Playwright green |
| S3 Availability + Booking Hold | P2 | ☑ done | reserve → Booking(PendingPayment) + Hold in one txn; overbooking prevented by Postgres `EXCLUDE` (proven under live concurrency); **Ken wrote the Booking domain + state machine**; 172 api tests + 3 Playwright green |
| S4 Payment Saga | P3 | ☑ done | Stripe test-mode PaymentIntent → idempotent webhook → `BookingCheckoutSaga` confirms booking + commits Hold → Transactional Outbox → email; **Ken wrote the Payment domain + the saga**; browser payment (`4242…`) flips the page to Confirmed; 211 api tests green. **cut line** |
| **Deploy (cut line)** | §12 | ☑ done | **live on AWS**, on a private custom domain — web (Amplify SSR) → api (ALB → ECS Fargate) → RDS Postgres 16. Real Stripe test-card payment: webhook `200` → outbox relay delivered `BookingConfirmed` **1s later**, exactly once. |
| S5 My bookings + cancel | M5 | ☑ done | `GET /me/bookings` + detail; policy-aware cancel (`Booking.cancel(outcome, now)` + `hold.release()` + `BookingCancelled` outbox in one txn); refund **computed, not issued**. **Ken wrote the CancellationPolicy VO + `cancel()`**; the command handler + React dialog were Claude-written (opt-out). 238 api tests + Playwright cancel journey green. |
| S6 Host dashboard | P4 | ☐ | |
| S7 Hardening | P5 | ☐ | |

Branch: `s5-cancel` (off `main`; not yet committed at time of writing).
**Next up: S6 — Host dashboard** (listing CRUD + availability/rate mgmt + host bookings, RBAC). Depends on S1/S2. Next slice defaults back to Ken writing the handlers.
Deployed on a **private custom domain** (hostnames deliberately not recorded here): web = AWS Amplify Hosting
(SSR/WEB_COMPUTE) · api = ALB + ACM → ECS Fargate, 1 task · db = **RDS PostgreSQL 16.14** `db.t4g.micro`, private.
Runbook: [docs/DEPLOY.md](../DEPLOY.md) · topology rationale: `adr/0010-aws-deploy-ecs-fargate-behind-alb.md`.
CI: `.github/workflows/ci.yml` (runs on push to a GitHub remote; local branch for now).

---

## P0 — Monorepo Scaffold

- **Shipped:** a runnable full-stack skeleton. `GET /health` travels API → shared Zod
  contract → Next.js RSC and renders in the browser; Postgres + Prisma wired as
  groundwork; the CI pipeline (build/typecheck/test/lint) is green locally.
- **BC(s):** none — pure infrastructure.
- **Contract added:** `packages/shared/src/contracts/health.ts` — `healthResponse` schema +
  `HealthResponse` type, imported by **both** apps from `@harbourstay/shared`.
- **Backend (`apps/api`):** NestJS 11 + SWC builder; `GET /health` (validates its output
  against the shared schema); pino logging, Swagger at `/docs`. `PrismaService`/`PrismaModule`
  scaffolded in `infra/prisma/` but **not** wired into `AppModule` yet (API boots without a DB).
- **Frontend (`apps/web`):** Next 16 App Router / React 19 / Tailwind 4; RSC home page fetches
  `/health` via a typed client that re-parses the response with the shared schema; `loading.tsx`
  + `error.tsx`; TanStack Query provider wired for later slices.
- **Infra:** `docker-compose.yml` (Postgres 16); `apps/api/prisma/schema.prisma` (datasource +
  client generator, no models yet); root `turbo.json` pipelines; `packages/tsconfig` shared configs.
- **Definition of Done:**
  - [x] contract shared, imported both ends, no duplicate type
  - [x] `tsc --noEmit` clean (all packages)
  - [x] domain has zero framework/ORM imports; query side bypasses domain (n/a — no domain yet)
  - [x] tests green (api unit: HealthService satisfies the contract)
  - [x] both apps run (`pnpm dev`); `/health` verified via curl (HTTP 200) **and** browser
  - [x] ADRs written
- **Verifier result:** PASS — `curl :3001/health` → `200 {"status":"ok",...}`; web `/` renders
  `harbourstay-api`; `pnpm build` 3/3, `typecheck` 4/4, `test` 1 passed, `lint` 4/4.
- **ADRs:** `adr/0001-monorepo-turborepo-pnpm.md`, `adr/0002-prisma-behind-repository-port.md`,
  `adr/0003-swc-builder-for-nest-path-aliases.md`.
- **Deferred to their slices (not P0 scope):** eslint (S1 api / S7 web), Playwright (S1),
  shadcn/ui (S1), `PrismaModule` wiring + first migration (S1), CLS transaction manager (S3),
  public deploy + coverage badge (S4).
- **Next:** S1 — Listing search & detail (CQRS read model over seeded Postgres). Wires
  `PrismaModule`, adds the first migration + seed, and the read-side query path.

---

## S1 — Listing Search & Detail

- **Shipped:** guests search listings (`/listings`) and open a detail page (`/listings/:id`),
  served from a **CQRS read model** (BC-5 Listing Catalog & Search) over seeded Postgres. No
  write aggregate, no domain layer — Prisma rows projected straight into the shared DTOs.
- **BC(s):** BC-5 Listing Catalog & Search *(Supporting, read side)*. Reads `Listing` +
  `AvailabilityBlock`, whose **writes** are owned by BC-2 (arrives in S3) — see ADR-0004.
- **Contract added:** `packages/shared/src/contracts/listing.ts` — `listingSearchQuery`,
  `listingSummary`, `listingDetail` (+ inferred types), imported by **both** apps.
- **Backend (`apps/api`, `catalog` BC):** `PrismaModule` now wired into `AppModule` (was
  unwired since P0). Read side only: `ListingQueryPort` (abstract class) + `@QueryHandler`s
  (`search-listings`, `get-listing-detail`); `infra/queries/listing.query.ts` projects Prisma
  rows directly into `ListingSummary`/`ListingDetail` (no mapper, no reconstitution). Presenters
  `GET /listings` (Zod-validated query) + `GET /listings/:id` (404 on unknown/Unpublished);
  reusable `ZodValidationPipe` under `shared/`. First migration `20260703114201_s1_listing_catalog`
  (`Listing`/`AvailabilityBlock` + `@@index([status, location])`) + `prisma/seed.ts` (6 Published
  + 1 Unpublished, deterministic UUIDs).
- **Frontend (`apps/web`):** typed client `lib/api/listings.ts` (runtime-validates responses with
  the shared schema); `/listings` RSC search page + client search form (RHF, resolves against a
  **lenient form-level schema** — empties allowed — then coerces via `toQuery()` against the wire
  contract before navigating); `/listings/[id]` RSC detail with an *indicative-availability* hint
  ("confirmed at checkout"); `loading`/`error`/`not-found`/empty states; plain `<img>` with null
  fallback. Prices rendered via `formatPrice` (minor units → dollars — ADR-0005).
- **Definition of Done:**
  - [x] contract shared, imported both ends, no duplicate type
  - [x] `tsc --noEmit` clean (api + web)
  - [x] read path bypasses the domain (no `domain/` in `catalog`); Prisma only in `infra/`
  - [x] tests green — api: 15 (handler units + Testcontainers `listing.query.spec.ts`);
        web: Playwright 5 passed / 1 skipped (search→detail, search-filter, empty-submit, not-found)
  - [x] both apps run (`pnpm dev`); `/listings`, filter, `/listings/:id`, and not-found verified
        via curl (200/400/404) **and** browser
  - [x] prices render in dollars (cents-on-the-wire convention)
- **Verifier result:** PASS — `/listings`→6 Published cards (Unpublished excluded); `?location=wellington`→2;
  `?guests=10`→1; `?guests=-1`→400; detail 200 + full shape; unknown/Unpublished id→404. Browser: prices
  $45–$320 (not $18k), location-only filter navigates + filters to 2 Wellington cards, empty submit browses
  all 6, bad-input (from≥to, guests=-1) blocked. Playwright 5/6 (1 intentional skip).
- **ADRs:** `adr/0004-shared-postgres-listing-table-ownership.md` (S1 reads tables BC-2 will own the
  writes of; one physical Postgres store), `adr/0005-money-minor-units-on-the-wire.md` (cents on the
  wire, format at the display edge — aligns with Stripe in S4).
- **In-flight fixes during the slice:** price units were 100× off (seed cents vs frontend dollars) → fixed
  `formatPrice` + ADR-0005; unreachable seed image URLs → swapped to `picsum.photos`; search form couldn't
  submit (wire contract rejected empty optional fields) → decoupled a lenient form schema + added regression
  tests; over-broad `getByRole('alert')` e2e assertion (matched Next's route-announcer) → scoped to the form.
- **Deferred (not S1 scope):** api eslint (S7), booking/checkout flow from the detail page (S3), real
  availability re-verification at booking time (S3), object-storage images (S6), public deploy (S4).
- **Next:** S2 — Authentication & Roles (Identity & Access): register/login with JWT in an httpOnly
  cookie, `RolesGuard` + `@Roles()`; **or** S3 — Availability + Booking Hold (needs S1 + S2). Per the
  dependency graph S3 requires a signed-in guest, so S2 comes next.

---

## S2 — Authentication & Roles  *(first scaffold-and-fill slice)*

- **Shipped:** a visitor can **register** and **log in**; the JWT session rides in an **httpOnly cookie**
  (access + refresh) and survives reloads; a `RolesGuard`/`@Roles()` gates protected routes. BC-7 Identity
  & Access (Generic).
- **Learning mode:** first slice built scaffold-and-fill. Agents scaffolded the whole BC + frontend and
  wrote failing unit tests; **Ken implemented the domain layer** himself.
- **Contract added:** `packages/shared/src/contracts/auth.ts` — `role`, `registerRequest`, `loginRequest`,
  `authUser` (+ types). No token shape in the contract (JWT is an infra/cookie concern).
- **Backend (`apps/api`, `identity` BC):** `RegisterUser`/`LoginUser`/`RefreshToken` command handlers +
  `GetCurrentUser` query; ports `UserRepositoryPort` / `PasswordHasherPort` (bcrypt, cost 12) /
  `AuthTokenPort` (JWT access+refresh, separate secrets); Prisma `User` repo + mapper + safe read
  projection; presenters `POST /auth/register|login|refresh` (set httpOnly cookies) + guarded `GET /auth/me`;
  `RolesGuard` + `@Roles()` + `JwtCookieGuard`; migration `20260704120152_s2_identity` (`user` table,
  UNIQUE email). Hashing/JWT never touch the domain.
- **User implemented (fill plan):** **Ken wrote the entire domain layer** — `domain/vo/email.vo.ts`
  (validate + normalize + value-equality), `domain/models/user.model.ts` (`User` aggregate, `create`/
  `reconstitute`, self-added+tested `passwordHash` invariant, defensive-copied `createdAt`), and the 3
  domain exceptions (`EmailAlreadyInUse` / `InvalidCredentials` — deliberately generic, no user
  enumeration / `UserNotFound`). Drove `email.vo.spec.ts` + `user.model.spec.ts` from red to green.
  Coaching produced real fixes: dropped a redundant guard, kept+tested the credential invariant, and
  learned `toBe` vs `toStrictEqual` (reference vs value) when the defensive copy broke an over-strict test.
  Backend-engineer review: **0 must-fix, 4 nits** (createdAt copy + test-name accuracy applied; explicit
  `node:crypto` import + `equals` null-guard left as optional).
- **Frontend (`apps/web`):** `/login`, `/signup` (RHF + `zodResolver`, guest/host choice), `/account`
  (server-guarded); cookie-bridge route handlers under `app/api/auth/` (relay the API's `Set-Cookie` to the
  web origin, strip `Domain`); server-side `getCurrentUser()`/`requireUser()` session helpers; header
  reflecting auth state + logout. All full working code (no fill files on the frontend this slice).
- **Definition of Done:**
  - [x] contract shared, imported both ends, no duplicate type
  - [x] `tsc --noEmit` clean (api + web)
  - [x] domain zero framework/ORM imports (grep-verified); passwords hashed behind a port; `AuthUser`
        never leaks `passwordHash`
  - [x] tests green — api: **16 suites / 77 tests** (Ken's domain specs + Testcontainers repo/query +
        `auth.controller.e2e`); web: Playwright auth journey **4/4**
  - [x] both apps run; register → login → stay-logged-in-across-reload → guarded route works in the
        browser; tokens httpOnly; invalid login generic (no enumeration)
- **Verifier result:** PASS (first pass) — register 201 (+httpOnly cookies, no `passwordHash`), duplicate 409,
  short password 400, login 200, wrong-password vs unknown-email both 401 with **byte-identical** bodies,
  `/auth/me` 200/401, refresh 200. Playwright 4/4.
- **ADRs:** `adr/0006-jwt-httponly-cookie-session-and-bcrypt.md` (httpOnly-cookie JWT transport,
  access+refresh with separate secrets, bcrypt cost 12).
- **Deferred (not S2 scope):** `RolesGuard` is wired + unit-tested but its first real use is S6 (host RBAC);
  password reset / email verification / account settings out of scope; public deploy (S4).
- **Next:** S3 — Availability + Booking Hold (the hard one): `Booking` + `Hold` aggregates, the state
  machine, and overbooking prevention under concurrency (Postgres `EXCLUDE` vs optimistic `version` — an
  ADR). Ken's fill files: the domain (aggregates + `DateRange` VO + state transitions).

---

## S3 — Availability + Booking Hold  *(the hard one)*

- **Shipped:** a signed-in guest reserves dates on a listing → creates a `Booking` (`PendingPayment`)
  + a time-boxed `Hold` in **one transaction**; **overbooking is impossible** — enforced by a Postgres
  `EXCLUDE` constraint, proven under real concurrency. BC-1 Booking + BC-2 Availability & Inventory,
  in a Partnership.
- **The headline guarantee:** `EXCLUDE USING gist (listingId =, daterange(checkIn,checkOut,'[)') &&)
  WHERE status IN ('active','committed')` on `hold` (+ `btree_gist`). Concurrent overlapping insert →
  `23P01` → `OverlappingHoldException` → 409. Verified live: two concurrent overlapping `POST /bookings`
  → exactly one 201, one 409, one active hold in the DB. Half-open `[in,out)` → a checkout day and a
  same-day check-in do NOT conflict. See **ADR-0007**.
- **Contract added:** `packages/shared/src/contracts/booking.ts` — `bookingStatus`, `createBookingRequest`,
  `bookingSummary` (`holdExpiresAt` drives the TTL countdown), `availabilityQuery`, `listingAvailability`.
- **Backend (`apps/api`):** two BCs. `inventory/` (scaffold) — `Hold` aggregate + state machine, `EXCLUDE`
  migration, `HoldRepository` (catches `23P01`), `PricingService` (basePrice×nights + fee), `GetAvailability`
  read model. `booking/` — `CreateBooking` command handler (the Partnership seam), `BookingRepository`,
  `POST /bookings` + `GET /bookings/:id` (ownership-scoped, 404 no-leak) + `GET /listings/:id/availability`.
  First real use of the **transaction manager** (`@nestjs-cls/transactional`) — cross-aggregate write in one
  `@Transactional`, application stays `$transaction`-free. Migration `20260705063337_s3_booking_hold`.
- **User implemented (fill plan):** **Ken wrote the entire Booking domain** — `booking/domain/models/booking.model.ts`
  (the `Booking` aggregate + full state machine: `confirm`/`complete`/`cancel(policy)`/`expire`/`markNoShow`,
  each guard→mutate, no state-skipping, illegal moves throw `InvalidBookingStateException`), `date-range.vo.ts`
  (half-open `overlaps`, `nights`, check-in<check-out), `party-size.vo.ts`, `money.vo.ts` (integer minor units),
  and the 4 booking exceptions. Drove 6 spec suites red→green (21 state-machine tests alone), incl. making the
  `create-booking.integration.spec` concurrency race pass. Review: **0 must-fix in the initial pass on the state
  machine (praised as senior-level)**; 2 must-fix on the edges (a real `nights()` bug — used `getDate()`
  day-of-month instead of timestamp math, broke across month boundaries; `Date` getters leaking mutable internals),
  4 nits — all applied, and Ken added the cross-month regression test that the original spec lacked (172 tests).
  Coaching lessons landed: `getDate` vs timestamp arithmetic; a fix and its test are one unit of work; test
  coverage ≠ file coverage (two exceptions were unimplemented because no unit spec referenced them — caught by
  the fuller suite).
- **Frontend (`apps/web`):** hand-rolled accessible availability calendar (TanStack Query, disables `unavailable`
  ranges, half-open boundary correct), booking widget (range + party size → reserve), cookie-forwarding
  `POST /bookings` route handler (auth from S2), `/bookings/[id]` pending-payment page with a **live TTL countdown**
  that survives reload, signed-out → `/login?next=`. No new deps.
- **Definition of Done:**
  - [x] contract shared both ends, no dup type
  - [x] `tsc --noEmit` clean (api + web)
  - [x] domain framework/ORM-free (Ken's `booking/domain` grep-clean; `@Injectable` on the `PricingService`
        domain service is the documented-allowed exception — conventions §Backend layering); cross-aggregate write
        in ONE transaction (no `$transaction` in application)
  - [x] **concurrency proves zero double-booking** — Jest integration race + live two-request race both → exactly
        one wins; `EXCLUDE` + `btree_gist` present in the DB
  - [x] state machine cannot skip states (21/21 unit tests)
  - [x] both apps run; reserve journey works in the browser (calendar disables taken dates, Hold shown with live
        countdown, reload persists); 409 on overlap; signed-out redirect
- **Verifier result:** PASS. (One flagged item — `@Injectable` in `pricing.service.ts` — reviewed and found
  compliant with the documented convention that allows `@Injectable` on domain services; not a violation.)
  Evidence: race `201`/`409` + single hold row; all curls (201/404/401/409/422/400); Playwright 3/3; 172 api tests.
- **ADRs:** `adr/0007-overbooking-via-postgres-exclude-constraint.md` (DB `EXCLUDE` vs optimistic `version`).
- **Deferred (not S3 scope):** actual payment/confirmation (S4 — Hold stays `Active`, Booking stays
  `PendingPayment`); scheduled Hold-expiry job (S4/S5); cancel flow (S5); k6 load test (stretch).
- **Next:** S4 — Payment Saga + Outbox + Confirmation (Stripe test mode → webhook → saga confirms + commits Hold →
  Outbox → email). The **minimum deployable cut line**.

---

## S4 — Payment Saga + Outbox + Confirmation  *(the cut line)*

- **Shipped:** a guest with a `PendingPayment` booking pays with a Stripe **test-mode** card and the booking
  becomes **Confirmed** on its own — no refresh. Card details → Stripe PaymentIntent (via the ACL) →
  `payment_intent.succeeded` webhook → idempotent handler → **`BookingCheckoutSaga`** confirms the booking +
  commits the Hold in one transaction + writes a `BookingConfirmed` **outbox** row → a polling relay delivers it
  → Notifications emails the guest → the confirmation page (polling `GET /bookings/:id`) flips to Confirmed.
  Touches BC-3 Payment + BC-4 Stripe ACL + BC-5 Notifications, orchestrating BC-1 Booking + BC-2 Inventory.
- **The two headline guarantees:**
  - **A duplicate webhook is harmless.** Stripe delivers at-least-once; a `ProcessedWebhookEvent` dedup ledger
    (unique on Stripe `event.id`) skips a re-delivery, **and** the `Payment` aggregate's transitions are
    idempotent (re-applying the same terminal state is a no-op; a *conflicting* one throws
    `InvalidPaymentStateException`). Proven live: a resent `payment_intent.succeeded` → **no** second confirm,
    **no** second email.
  - **Confirm-and-notify can't tear.** The `BookingConfirmed` event row is written **in the same transaction**
    as `booking.confirm()` / `hold.commit()` (Transactional Outbox), so it's impossible to confirm-without-notify
    or notify-without-confirm. A separate `@Interval` relay delivers it at-least-once; the `notification_log`
    (keyed on event id) makes the consumer idempotent. See **ADR-0008** (Stripe ACL) + **ADR-0009** (Outbox).
- **Contract added:** `packages/shared/src/contracts/payment.ts` — `createPaymentIntentResponse`
  (`{ clientSecret, paymentId }`). Money stays integer minor units on the wire (ADR-0005).
- **Backend (`apps/api`):** `payment/` — Stripe confined to `infra/adapters/stripe-payment.adapter.ts` (only place
  the SDK + `sk_test`/`whsec` live); `POST /bookings/:id/pay` (creates a Pending `Payment` + a Stripe
  PaymentIntent, returns the client secret); `POST /webhooks/stripe` (raw-body signature verify → domain intent);
  `CreatePaymentIntent` handler; hold-expiry `@Interval` job (compensation safety net). `shared/outbox/` — the
  `outbox_event` table + `@Interval` relay. `notifications/` — `TestMailerAdapter` + `notification_log`. First use
  of a **process manager / saga** and the **outbox** in this codebase. Migration `20260707103131_s4_payment_outbox`
  (`payment`, `processed_webhook_event`, `outbox_event`, `notification_log`).
- **User implemented (fill plan):** **Ken wrote the entire Payment domain + the saga** —
  `payment/domain/vo/payment-id.vo.ts` + `money.vo.ts` (his BC's own copy, integer cents),
  `payment/domain/models/payment.model.ts` (the **idempotent state machine** — `markSucceeded`/`markFailed` guard
  only the *conflicting* terminal state and otherwise assign, so same-state is a free no-op — the crux of S4,
  praised as the clean shape), `processed-webhook-event.model.ts` (the tiny dedup-ledger aggregate), the
  `PaymentNotFound` / `InvalidPaymentState` exceptions, a fresh `HoldNotFoundException`, and
  `application/booking-checkout.saga.ts` — the **process manager**: three methods, each one `this.tx.run(...)`;
  the confirm path loads Booking + Hold, calls `confirm()` + `commit()`, saves both, and enqueues the outbox row
  **inside** the txn; `onPaymentFailed` / `onHoldExpired` are the **compensation** (`release()` + `expire()`, no
  outbox). Drove `payment.model.spec` (8) + `booking-checkout.saga.spec` (3) + the VO specs red→green. Review:
  **0 must-fix** (independent backend-engineer pass); a first round of 3 self-caught nits (dead code, an
  inconsistent raw `Error` → he added `HoldNotFoundException` to match the pattern, an error-message tidy), plus
  learning nits noted-not-required (ingress `Date` copy in `reconstitute`; `currency` rides the outbox payload's
  open index signature rather than a declared field). Coaching lesson landed: idempotency as "same terminal state
  is a no-op, a contradictory one is a bug"; the outbox `enqueue` must be *inside* `tx.run` for atomicity.
- **Frontend (`apps/web`):** Stripe Payment Element checkout (`components/payment-panel.tsx`) with
  `@stripe/react-stripe-js`; `payment-confirmation.tsx` polls `GET /bookings/:id` every 2s (cap ~30s) and flips
  to Confirmed; `app/bookings/[id]/confirmed/` page; env `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test`). Trusts
  backend status — never confirms from the client.
- **Definition of Done:**
  - [x] contract shared both ends, no dup type
  - [x] `tsc --noEmit` clean (api + web)
  - [x] domain framework/ORM-free (Ken's `payment/domain` grep-clean; Stripe SDK only in the ACL adapter);
        cross-aggregate confirm+commit in ONE transaction (no `$transaction` in application)
  - [x] **idempotent webhook** — dedup ledger + idempotent aggregate; a resent event does nothing twice (live)
  - [x] **outbox is atomic** — `BookingConfirmed` row commits with the state change; relay delivers; consumer
        deduped by `notification_log`
  - [x] both apps run; **browser payment with `4242 4242 4242 4242` flips the page to Confirmed unaided**;
        error paths 401/404/409
- **Verifier result:** PASS (both halves). Headless: 211 api tests / 39 suites green (incl. Testcontainers
  webhook-idempotency + outbox-relay specs); `POST /bookings/:id/pay` → real Stripe test PaymentIntent
  (`pi_…_secret_…`); 401/404/409 on the error paths; a locally-signed synthetic webhook drove Confirmed +
  a notification, a replay drove neither. Browser (Ken): test-card payment → Confirmed; DB shows the Confirmed
  booking, a Succeeded `payment` (`pi_3TqYweCB…`), 2 `processed_webhook_event` rows, a `notification_log` row.
- **ADRs:** `adr/0008-stripe-payment-gateway-anti-corruption-layer.md` (Stripe behind an ACL, BC-4),
  `adr/0009-transactional-outbox-for-booking-confirmed.md` (crash-safe cross-context event delivery).
- **Deferred (not S4 scope):** real settlement/refunds/payouts (out of scope, PRD §2/§6); outbox retention/prune +
  dead-letter for a poison event (S7); cancel flow (S5); the noted learning nits (ingress Date copy, `currency`
  as a declared payload field).
- **Next:** **DEPLOY** — this is the cut line (search → reserve → pay-test → confirm all work). web → Vercel,
  api → Render/Fly/Railway, db → Neon/Supabase; point a Stripe webhook endpoint at the deployed api. Then S5.

---

## Deploy — the S4 cut line, live on AWS  *(user-driven, console)*

- **Shipped:** the whole cut line running on AWS in `us-west-2`, on Ken's own domain, over TLS.
  web (Amplify SSR) → api (ALB + ACM) → ECS Fargate task →
  RDS PostgreSQL 16.14 (private). Stripe webhooks hit the public API. Ken clicked every console step
  himself; the agent scaffolded, verified each step against the AWS APIs, and debugged.
- **The headline proof:** a real Stripe **test-card** payment on the deployed site produced —
  `12:39:29 webhook POST → 200` … `12:39:30 notification sent`. **Exactly one** notification, **1 second**
  after the webhook. That single second proves the S4 Transactional-Outbox relay's `@Interval(5s)` timer
  really ticks in production — the load-bearing claim of **ADR-0010**. Two forged unsigned POSTs to
  `/webhooks/stripe` were rejected `400`, so signature verification holds: nobody can confirm a booking
  they never paid for.
- **Topology (ADR-0010):** ECS **Fargate** behind an **ALB**, *not* Lambda and *not* App Runner — both are
  disqualified by S4's background timers (Lambda has none; App Runner **throttles CPU when idle**). The task
  runs in a **public subnet with a public IP** so it reaches `api.stripe.com` through the existing IGW,
  avoiding a **$32/mo NAT Gateway**; it is still unreachable from the internet because the security groups
  chain `alb-sg → api-sg → rds-sg`. Secrets in **SSM Parameter Store** SecureString (free) rather than
  Secrets Manager. `prisma migrate deploy` runs in the container on start (idempotent, advisory-locked),
  so **RDS never needs public access**.
- **Artifacts added:** `apps/api/Dockerfile` (multi-stage, pnpm-workspace aware; verified by *building and
  booting* both `arm64` and `linux/amd64`), `.dockerignore` (keeps `.env` out of every layer), `amplify.yml`,
  `docs/DEPLOY.md` (console runbook with real account ids + a ranked gotcha list), `adr/0010-…md`.
  `prisma` CLI moved to `dependencies` so the prod install can regenerate the client and the container can
  self-migrate.
- **Four bugs found and fixed (all would have shipped silently):**
  1. `pnpm prune --prod` in the Dockerfile deleted `node_modules` and "reinstalled" into an empty tree with no
     store cache mount. **`docker build` went green; the image crash-looped.** Replaced with a `prod-deps` stage.
     *Lesson: a successful build proves nothing; boot the container.*
  2. Amplify's `WEB_COMPUTE` bundler packages `<appRoot>/node_modules` and cannot follow pnpm's symlinks out to
     `../../node_modules/.pnpm` → `CustomerError: missing the 'next' dependency`. Fixed with `node-linker=hoisted`
     **appended during the build only** (repo-wide it empties `apps/api/node_modules` and breaks the Dockerfile),
     plus copying the hoisted root `node_modules` under the app root.
  3. Amplify injects console env vars into the **build** container, never the **SSR runtime** — so
     `process.env.API_URL` was `undefined` and every RSC fetch fell back to `localhost:3001`
     (`ECONNREFUSED 127.0.0.1:3001`). Fixed by writing `API_URL` into `apps/web/.env.production` during the build.
  4. 🚨 **A Stripe `sk_test_` secret key was pasted into `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** and inlined into
     the client bundle. Key rolled in Stripe, SSM updated, ECS redeployed, 17 served chunks re-scanned clean.
     *Lesson: `NEXT_PUBLIC_` is not a naming convention, it is a publishing instruction.*
- **Cost:** ~$30/month year one (ALB ~$18 + Fargate 0.25 vCPU/1 GB ~$11; RDS free tier), ~$45 after. Budget
  alarm set. Teardown steps in `docs/DEPLOY.md` §13.
- **Deferred:** infrastructure is click-ops — codify it (CDK/Terraform) in S7, along with autoscaling >1 task,
  RDS Multi-AZ, outbox retention/dead-letter, and a real mailer (SES) behind the existing `MailerPort`.
- **Next:** S5 — My bookings + cancel.

---

## S5 — My Bookings + Cancel

- **Shipped:** a signed-in guest sees their bookings (`GET /me/bookings`), opens one
  (`/account/bookings/:id`), and cancels within policy — the booking flips to `Cancelled`, its
  `Hold` is released, a refund is computed and recorded, and a `BookingCancelled` notification
  fires. A too-late / wrong-state cancel is refused with a clear message. BC-1 Booking, releasing
  BC-2 inventory, reusing the S4 Outbox.
- **The headline shape:** cancel is the **saga compensation from the other direction** — the S4
  `onPaymentFailed` pattern, triggered by a guest instead of Stripe. In one `tx.run(...)`:
  `booking.cancel(outcome, now)` + `hold.release()` (guarded to releasable states) + save both +
  `outbox.enqueue(BookingCancelled)`. See **ADR-0011**.
- **The domain decision (ADR-0011):** cancellation modelled as a **policy VO evaluated at cancel
  time** — `CancellationPolicy.evaluate(status, checkIn, now, priceSnapshot) → { allowed,
  refundAmount, reason? }` (pure, deterministic — `now` injected). Tiers: PendingPayment → 0;
  Confirmed ≥7d → 100%; 2–7d → 50% floored; <48h/after → rejected; terminal → rejected. **Refund is
  computed and recorded, never issued to Stripe** (settlement out of scope, PRD §2/§6). The aggregate
  keeps its **own** status guard — it never delegates state-machine integrity to the policy's boolean.
- **Contract added:** extended `packages/shared/src/contracts/booking.ts` — `bookingDetail`,
  `myBookingsResponse` (= `BookingDetail[]`), `cancelBookingRequest` (optional `reason`),
  `cancelBookingResponse`. Money integer minor units (ADR-0005); reuses `bookingStatus`.
- **Backend (`apps/api`, scaffold):** migration `20260711120000_s5_booking_cancel` (nullable
  `cancelledAt`, `refundAmount`); CQRS read side `GET /me/bookings` + widened `GET /bookings/:id`
  (listing-join projection → `BookingDetail`, no domain reconstitution); `POST /bookings/:id/cancel`
  (`@HttpCode(200)`, ownership 404-no-leak, `InvalidBookingStateException` → 409);
  `CancellationPolicyProviderPort` seam (single `standard()` today, per-listing later);
  `BookingCancelled` event + TestMailer notification handler; module wiring.
- **User implemented (fill plan):** **Ken wrote the two domain pieces** —
  `booking/domain/policies/cancellation-policy.ts` (`evaluate()` tiered refund, status-first
  branching, deterministic `now`, `Math.floor` to never over-refund) and the widened
  `Booking.cancel(outcome, now)` in `booking.model.ts` (allow-list `PendingPayment | Confirmed`,
  throw on any other status, throw on `!outcome.allowed`, record `cancelledAt` + `refundAmount`).
  Review found **one must-fix on `cancel()`** — the guard only blocked `Completed`, delegating the
  rest of its state-machine integrity to the policy; Ken fixed it to a positive allow-list, corrected
  a wrong exception type (plain `Error` → `InvalidBookingStateException`, which is what maps to 409
  not 500), and **added the regression test that was missing** (an *allowed* outcome on an `Expired`
  booking must still throw — red against the old guard, green now). Coaching lessons landed: an
  aggregate protects its own invariants regardless of what a collaborator hands it; the exception type
  IS the HTTP contract; the fix and its test are one unit of work.
- **Fill-file OPT-OUT (recorded):** Ken asked Claude to write the **`CancelBooking` command handler**
  (`cancel-booking.command.handler.ts` — his first command handler) and the **React cancel dialog**
  (`components/cancel-booking-dialog.tsx` — no React experience yet). Both written by Claude, heavily
  commented as teaching artifacts, and reviewed by the engineers (handler must-fix: guard `hold.release()`
  to releasable states — fixed; dialog must-fix: real modal a11y — focus-on-open, Escape, focus-restore —
  fixed). Ken still wrote the meat of the slice (the policy + the aggregate). **Next slice defaults back
  to Ken writing the handlers**; S6 (host dashboard) is frontend-heavy — plan a gentler React on-ramp so
  the frontend learning goal isn't repeatedly opted out of.
- **Frontend (`apps/web`, scaffold):** my-bookings list + `/account/bookings/[id]` detail (a **separate
  durable route** from the transient `/bookings/[id]` pay flow, which still needs `holdExpiresAt`);
  cookie-forwarding `POST /api/bookings/[id]/cancel` bridge; status badge; loading/error/not-found.
- **Definition of Done:**
  - [x] contract shared both ends, no dup type
  - [x] `tsc --noEmit` clean (api + web); `next build` compiles
  - [x] domain framework/ORM-free; cross-aggregate cancel+release+outbox in ONE transaction
  - [x] policy boundaries + aggregate guard unit-tested (incl. the allowed-outcome-on-terminal regression)
  - [x] both apps run; browser cancel journey works unaided; 401/404/409 error paths
- **Verifier result:** PASS. 238 api tests / 43 suites (incl. Testcontainers `cancel-booking.integration`);
  live: `GET /me/bookings` `[]`→1; reserve→PendingPayment; cancel → `{status: Cancelled, refundAmount: 0}`,
  DB shows Cancelled + `cancelledAt` + hold `released` + one relayed `BookingCancelled` outbox row + mailer
  line; 401 (no cookie) / 404 (unknown + other-guest no-leak) / 409 (re-cancel). Playwright cancel journey
  2/2 (the too-late-409 and 50%/100% tiers need a Confirmed near-check-in booking — covered by unit +
  integration tests). One finding fixed: cancel returned 201 → `@HttpCode(200)` to match the contract.
- **ADRs:** `adr/0011-cancellation-policy-vo-refund-computed-not-issued.md`.
- **Deferred (not S5 scope):** per-listing cancellation policies (port seam is in place); a real Stripe
  refund when settlement enters scope; host-initiated cancellation (S6); a full focus-trap on the dialog
  (basic a11y done; hardening in S7).
- **Next:** S6 — Host dashboard.
