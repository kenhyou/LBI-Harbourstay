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
| S6a Host listings CRUD + RBAC | P4 | ☑ done | `Listing` **write aggregate** (S1 deferred stub, now filled); host CRUD + publish/unpublish behind `@Roles('host')` + per-listing ownership **404 no-leak**; `GET /host/listings[/:id]` CQRS reads (drafts included). **Learn-by-reading mode — Claude wrote all of S6a** (opt-out). 52 api suites / 295 tests + 2 Playwright green. |
| S6b Availability blocks + host bookings | P4 | ☑ done | host blocks/unblocks date ranges (an **aggregate-owned collection** on `Listing`; overlap → 409) + `GET /host/bookings` (ownership-scoped). A blocked range **prevents a guest hold** (S3 seam, now proven: overlapping booking → 409, **zero rows written**). **Learn-by-reading — Claude-written** (opt-out). 56 api suites / 338 tests + Playwright 3/3 green. |
| S7a Security baseline (OWASP) | P5 | ☑ done | helmet + credentialed CORS allow-list + `@nestjs/throttler` (tight on `/auth/*`) + web security headers; **JWT secret fail-fast** (prod refuses to boot on a default — the one real vuln the audit found, fixed); `docs/security-audit.md` (24 routes, no authz gap). Verified at runtime: 429 + `Retry-After`, CORS isolation, prod boot exits code 1. **Learn-by-reading — Claude-written.** 57 api suites / 345 tests green. |
| S7b Observability + delivery metrics | P5 | ☑ done | structured pino logging + **secret redaction** (auth headers/cookies/tokens → `[Redacted]`, proven live) + correlation id; **liveness/readiness split** (`/health` DB-independent = ALB-safe; new `/health/ready` → 503 on DB down, proven by pausing Postgres); `docs/build/delivery-metrics.md` (DORA from real git history). **Learn-by-reading.** 61 api suites / 357 tests green. ADR-0015. |
| S7c Docs finalize (README + ADRs) | P5 | ☑ done | README rewritten to the finished build (status, architecture, tech stack incl. AWS deploy, run + test instructions, four headline guarantees, ADR index) + `adr/README.md` index; ADR set reviewed (15, all Accepted, sequential). **Build complete.** |

Branch: `main` (S5 merged). S6 is being built on `main` in a different mode — see below.
**🎉 BUILD COMPLETE — P0 → S7 all shipped.** The full guest + host journeys run end-to-end, live on AWS, `main` green throughout. 357 backend tests + Playwright; 15 ADRs; security + observability baselines. S7 (Hardening) was learn-by-reading, split S7a (security ✓) → S7b (observability + metrics ✓) → S7c (docs ✓). **S7c uncommitted** at time of writing (commit on its own branch + merge, like the rest). Remaining items are all post-MVP follow-ups (see README §Known follow-ups); nothing on the P0–S4 cut line or the S5–S7 scope is outstanding.
**⚠️ S6 learning-mode change:** for S6, Ken **opted out of scaffold-and-fill to learn by reading working code** — Claude writes all of S6 (backend aggregate/handlers + frontend, heavily commented as teaching artifacts); no fill files. This is a deliberate, S6-scoped departure from "Ken writes the core"; **reconfirm the mode at S7** rather than assume it carries forward.
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

---

## S6a — Host Listings CRUD + RBAC  *(learn-by-reading mode — Claude-written)*

- **Shipped:** a signed-in **host** creates, edits, and publishes/unpublishes their **own** listings
  from a dashboard (`/host/listings`, `/host/listings/new`, `/host/listings/[id]/edit`), behind role
  `host` + per-listing ownership. This introduces the **`Listing` write aggregate** — BC-2's write
  side that DESIGN.md §BC-2 carried as a deferred stub since S1 (which built only the read projection).
  First real use of the S2 `@Roles('host')` RBAC. BC-2 Availability & Inventory (write) + BC-6 Host
  Management command surface + BC-7 Identity (RBAC).
- **⚠️ Learning-mode change (recorded):** for S6, **Ken opted out of scaffold-and-fill to learn by
  reading working code.** All of S6a — the `Listing` aggregate + VOs, the four command handlers, the
  host read queries, AND the frontend (pages, editor form, the `publish-toggle` primer) — was written
  by Claude as heavily-commented teaching artifacts (matching the annotated `cancel-booking-dialog.tsx`
  style), **not** implemented by Ken. This is a deliberate, S6-scoped departure from the project's
  "Ken writes the core" purpose; the honest trade-off (reading builds recognition, not production
  muscle) was flagged. **Mode reverts to fill at S7 unless Ken decides otherwise.**
- **The two authorization decisions (ADR-0012):** two *independent* layers, deliberately different
  codes. (1) **Role → 403 at the guard:** anonymous → 401, signed-in guest → 403 on any `/host/*`,
  before any handler runs. (2) **Ownership → 404 no-leak in the handler/query:** `hostId` comes from
  `@CurrentUser()` (never body/params); every op is scoped to `{ id, hostId }`, so a foreign or unknown
  id both return a **byte-identical 404** — never 403 for a real-but-other-host listing (that would be
  an id-enumeration oracle). Mirrors the booking cancel pattern. `hostId` is immutable on the aggregate
  (set at `create()`, never touched by `updateDetails()`). Publish/unpublish are **guarded, not
  idempotent** (re-publish → `InvalidListingStateException` → 409) — the opposite of S4 `Payment`, and
  on purpose: no at-least-once delivery forces idempotency here, and guarding catches client bugs.
- **Contract added:** extended `packages/shared/src/contracts/listing.ts` — `hostListingUpsert`
  (create+edit, full-replace), `hostListingSummary` (host's own card, includes `status`, drafts
  included), `hostListingDetail` (= summary **+** `description` + `images`; the lossless prefill source),
  `hostListingsResponse`; extracted reusable `listingType` / `listingStatus` enums. Money integer minor
  units (ADR-0005).
- **Backend (`apps/api`, `inventory` BC):** `Listing` write aggregate (`create` starts **Unpublished**
  / `reconstitute`, `updateDetails` full-replace, guarded `publish`/`unpublish`; invariants via
  `Capacity` VO ≥ 1 + `Money` ≥ 0 + non-empty title, immutable `hostId`) — **zero framework/ORM
  imports** (grep-clean; the pre-existing `@Injectable` `PricingService` is the documented exception).
  Four command handlers (`Create`/`Update`/`Publish`/`Unpublish`) each with the ownership 404-no-leak
  gate; CQRS read side `GET /host/listings` + `GET /host/listings/:id` (host-scoped `WHERE`, drafts
  included, bypasses the domain). `ListingRepositoryPort` + Prisma impl/mapper. Host controller — all
  routes `JwtCookieGuard` + `RolesGuard` + `@Roles('host')`; `listing-exception.filter` (invalid state
  → 409, not-found/not-owned → 404, Zod → 400). No migration (the `listing` table already had every
  column). Seed: `host@harbourstay.test` / `password123` owns all 7 seed listings (6 Published + 1
  Unpublished) so the dashboard is populated.
- **Frontend (`apps/web`):** `/host/listings` dashboard (server role-guarded via `requireHost()` —
  signed-out → `/login?next=`, guest → `/host/forbidden`), `new` + `[id]/edit` pages;
  `listing-editor-form.tsx` (RHF + `zodResolver`, create+edit via a `mode` prop, **dollars↔minor-units
  at the display edge**, edit prefills losslessly from `GET /host/listings/:id` incl. drafts);
  `publish-toggle.tsx` (the intended-fill React primer, heavily commented); cookie-bridge route handlers
  under `app/api/host/listings/…`; typed `lib/api/host-listings.ts` re-parsing every response with the
  shared schema; status badge, loading/error/not-found. Consumes `@harbourstay/shared`, no redefined
  types.
- **Definition of Done:**
  - [x] contract shared both ends, no dup type
  - [x] `tsc --noEmit` clean (api + web); `next build` compiles
  - [x] `inventory/domain` framework/ORM-free; host reads bypass the domain (CQRS)
  - [x] RBAC (401 anon / 403 guest) **and** ownership 404-no-leak (foreign id ≡ unknown id) — tested
        across two live host accounts
  - [x] listing CRUD + guarded publish/unpublish; full-replace edit **doesn't lose a draft's
        description** (the contract-gap regression)
  - [x] both apps run; host create → edit → publish/unpublish works in the browser
- **Verifier result:** initial **FAIL** then **PASS**. Backend green first pass (52 suites / 295 tests;
  RBAC, ownership isolation across two hosts, CRUD, draft-edit preservation, minor-units-on-wire,
  validation all verified by direct execution). Frontend **failed** the headline Playwright journey: the
  `publish-toggle` left `submitting=true` on success on the false assumption `router.refresh()` remounts
  the component — it re-renders the server tree but keeps the **same** client instance, so the button
  stuck disabled reading "Working…" after one toggle (second POST never fired). Fixed (reset
  `submitting=false` on success; comment rewritten to teach the real lesson) → both Playwright tests
  green (guest-forbidden + create→edit-draft→publish/unpublish round-trip). *Lesson: a static read
  accepted the buggy comment's logic; only booting the stack exposed it.*
- **Contract gap found & closed mid-slice:** the full-replace `PATCH` had no lossless prefill source
  (`hostListingSummary` lacked `description`/`images`; no host detail endpoint), so editing an
  Unpublished **draft** would blank those fields on save. Closed end-to-end: added `hostListingDetail`
  + `GET /host/listings/:id` (ownership 404-no-leak, drafts included) + edit-page prefill from it;
  Playwright now asserts a draft's description survives the round-trip.
- **ADRs:** `adr/0012-host-authorization-rbac-role-plus-ownership-404-no-leak.md`.
- **Deferred to S6b (not S6a scope):** availability-block management (block/unblock date ranges) and
  the host bookings view (`GET /host/bookings`). **Deferred beyond S6 (stretch):** complex rate *rules*
  (weekend uplift, LOS discounts — DESIGN.md §Pricing); MVP is a single editable base price. Image
  **upload** to object storage (the editor takes image URLs/paths as text for now).
- **Next:** S6b — Availability blocks + host bookings.

---

## S6b — Availability Blocks + Host Bookings  *(learn-by-reading mode — Claude-written)*

- **Shipped:** the host dashboard is complete. A host **blocks/unblocks date ranges** on their own
  listings, and a **blocked range prevents a guest from booking it**; a host also **sees all bookings
  across their listings** (`GET /host/bookings`). BC-2 Availability & Inventory (blocks on `Listing`) +
  BC-1 Booking (host bookings read + the enforcement seam).
- **The headline guarantee (proven at the storage layer):** a blocked range has **teeth**. Blocking
  `2027-06-10..06-20` then attempting to book over it → **409 `DATES_NOT_AVAILABLE`** with **zero rows
  written** to `booking` *or* `hold` (transaction rolled back); a non-overlapping range and the
  half-open boundary (check-in == block's check-out) both book fine. The enforcement seam
  (`CreateBookingHandler` → `hasBlockingBlock` → `DatesNotAvailableException`) was **designed in S3**
  but never exercisable until something could create a block — S6b makes it real. See **ADR-0013**.
- **The modelling decision (ADR-0013):** blocks are a **child collection *inside* the `Listing`
  aggregate** (`listing.block(range)` / `unblock(id)`; no-self-overlap invariant → 409; unknown
  unblock id → 404) — the **opposite** of `Hold`'s own-aggregate decision (ADR-0007), and on purpose:
  blocks change on the low-frequency *host cadence* with a *single-listing* invariant, so the
  whole-listing-load cost that damns holds is irrelevant here (DESIGN.md §BC-2). The repository
  persists the collection by an **id-keyed diff inside the write transaction**; `reconstitute` loads
  the `isBlocked=true` rows. No migration — the `availability_block` table has existed since S1.
- **Contract added:** `availabilityBlockRequest` (`{checkIn,checkOut}`, checkIn<checkOut, YYYY-MM-DD),
  `availabilityBlock` (`{id,checkIn,checkOut}`), `listingBlocksResponse` (also the POST/DELETE return,
  so the client re-syncs in one round trip) in `listing.ts`; `hostBookingSummary`
  (`{id,listingId,listingTitle,guestId,checkIn,checkOut,partySize,status,totalPrice,createdAt}` —
  guest identity limited to `guestId`, **no PII**) + `hostBookingsResponse` in `booking.ts`. Reuses
  `bookingStatus` + the existing date-string convention; money integer minor units (ADR-0005).
- **Backend (`apps/api`):** `inventory` — extended `Listing` with the `AvailabilityBlock` child +
  `block`/`unblock` (+ `OverlappingBlockException` 409 / `BlockNotFoundException` 404); `BlockDates` /
  `UnblockDates` handlers (ownership 404-no-leak); `GET /host/listings/:id/blocks` read; mapper/repo
  do the collection diff in the write txn. `booking` — `GET /host/bookings` host-scoped read
  (join `booking` → the host's listing ids, no PII) as a sibling `HostBookingController`; the
  block→hold enforcement proof (`create-booking-blocked.integration.spec.ts`). All host routes
  `JwtCookieGuard` + `RolesGuard` + `@Roles('host')`. `inventory/domain` stays framework/ORM-free.
- **Frontend (`apps/web`):** `components/availability-manager.tsx` (the reading centerpiece — a client
  component with a live blocks list + add-range form + per-row remove, **explicitly resetting its
  in-flight flags on success to avoid the S6a stuck-button bug**); dedicated
  `/host/listings/[id]/availability` route (linked per card); `/host/bookings` RSC table (status badge,
  `formatPrice` at the display edge, truncated guest id); cookie-bridge routes; typed clients
  re-parsing the shared schemas. Consumes `@harbourstay/shared`, no redefined types.
- **Definition of Done:**
  - [x] contract shared both ends, no dup type
  - [x] `tsc --noEmit` clean (api + web); `next build` compiles
  - [x] `inventory/domain` framework/ORM-free; host bookings read bypasses the domain (CQRS)
  - [x] RBAC (401/403) + ownership 404-no-leak on block routes (foreign listing ≡ unknown, two live hosts)
  - [x] **a blocked range prevents a guest hold** — proven at the DB layer (0 rows on the 409s)
  - [x] host bookings ownership-scoped (host A never sees host B's bookings — both directions)
  - [x] both apps run; block/unblock + host-bookings work in the browser
- **Verifier result:** **PASS (first pass)** — no bug this slice (contrast S6a). Block CRUD (201 with the
  updated list / 200 delete / 400 bad range / 409 overlap / 404 unknown block); ownership 404-no-leak
  across two hosts; the headline block→booking-rejection proven with `psql` row counts; cross-host
  booking isolation grep-verified both ways; `totalPrice` integer minor units everywhere; Playwright
  `host-availability` 3/3; 56 suites / 338 tests green.
- **ADRs:** `adr/0013-availability-blocks-inside-listing-aggregate-enforced-at-hold-time.md`.
- **Deferred (stretch / not S6 scope):** per-range `price` overrides + block `reason` (table has the
  `price` column; deferred with the rate-rules cut); a new block does **not** retro-affect an existing
  confirmed booking on those dates (gates future holds only); surfacing blocked ranges in the
  guest-side availability calendar; image upload to object storage.
- **S6 complete:** host dashboard done end to end (S6a listings CRUD + RBAC, S6b availability + host
  bookings). **Next:** S7 — Hardening (E2E breadth, OWASP baseline, observability, delivery-metrics
  doc, ADRs finalized). **⚠️ Reconfirm the learning mode at S7** — S6 was learn-by-reading (Claude-
  written); the default is Ken writing the core.

---

## S7a — Security Baseline (OWASP)  *(learn-by-reading mode — Claude-written)*

- **Shipped:** the OWASP Top-10 **baseline** (PRD §9, breadth over depth) across both apps, plus a
  full authorization audit. No new domain, no new endpoints. **Mode reconfirmed at S7:** Ken chose to
  continue **learn-by-reading** and to **split S7 into phases** (S7a security → S7b observability +
  delivery metrics → S7c docs).
- **API (`apps/api`):** `helmet` secure headers (CSP off on the API — it serves JSON); credentialed
  **CORS allow-list** (origin-callback from `CORS_ORIGIN`/`WEB_ORIGIN`, `credentials:true`, never
  `*`); `@nestjs/throttler` rate limiting — global ~100/min/IP + a **tight ~10/min tier on `/auth/*`**
  (→ 429), `/health` + `/webhooks/stripe` skip-throttled (bursty + signature-authenticated);
  `x-powered-by` removed; ~100kb JSON body cap. All env-tunable. Wired in a reusable
  `bootstrap/configure-security.ts` + `shared/throttler/throttler.config.ts`. **Domain untouched.**
- **Web (`apps/web`):** five security response headers on all routes (`X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS) via `next.config.ts`. **CSP deliberately
  deferred** — a wrong CSP silently breaks the Stripe Element; a commented scaffold documents exactly
  what a real CSP must allow + the report-only rollout path.
- **⭐ The audit + the one real vuln:** `docs/security-audit.md` tabulates **all 24 routes × guard ×
  role × ownership × validation**. **No route-level authz gap** — the S5/S6 404-no-leak ownership
  pattern held up end-to-end. It DID surface a genuine vulnerability: the JWT adapter fell back to
  **well-known literal secrets** (`'dev-access-secret'`…) when its env vars were unset — an
  auth-forgery risk in prod that every green test had been running on. **Fixed:** `requireSecret`
  fail-fast — production **throws at construction and refuses to boot** if `JWT_ACCESS_SECRET` /
  `JWT_REFRESH_SECRET` is unset (dev fallback kept for local/tests). One validation asterisk
  (`GET /listings/:id` `from`/`to`) closed with a Zod schema.
- **Contract touched:** added `listingDetailQuery` (optional `from`/`to`) so the detail route's query
  is validated — the only contract change (no new endpoint).
- **Definition of Done:**
  - [x] `tsc --noEmit` clean (api + web); `next build` clean; full suite green (**57 suites / 345 tests**)
  - [x] rate limiting: `/auth/*` → 429 past the limit (+ `Retry-After`); `/health` unthrottled
  - [x] CORS: allowed origin reflected + credentials; disallowed origin → no ACAO; never `*`+credentials
  - [x] helmet headers present + `x-powered-by` absent; >100kb body → 413
  - [x] web: all five headers on `/listings` + `/login`; Playwright header spec green
  - [x] JWT fail-fast: prod without secrets **exits code 1**, never serves (unit + isolated boot proof)
  - [x] authz regression clean (401 anon / 403 guest / 404 no-leak); domain untouched
- **Verifier result:** **PASS (first pass)** — all 8 DoD items proven by execution (isolated instances
  used so the auth throttle didn't self-inflict false failures): login 429 + `Retry-After: 56` while
  `/health` stayed 200 under load; `evil.example` origin got no ACAO; `NODE_ENV=production` + empty
  secrets → threw in DI, exited 1, never opened a listener; helmet/headers/413 confirmed; Playwright
  `security-headers` 1/1 + `host-listings`/`auth` 6/6 regression.
- **ADRs:** `adr/0014-owasp-security-baseline-and-secrets-fail-fast.md`.
- **Deferred (documented):** enforce CSP (report-only → widen → enforce); Redis-backed throttler for
  >1 task (in-memory is per-task today); account-level lockout; depth security (pen-test/WAF/MFA — out
  of scope, PRD §9).
- **Next:** S7b — Observability (pino/health) + DORA delivery-metrics doc.

---

## S7b — Observability + Delivery Metrics  *(learn-by-reading mode — Claude-written)*

- **Shipped:** the observability baseline (PRD §13) + a DORA delivery-metrics doc. No new domain, no
  business endpoints. Still learn-by-reading (Claude-written, commented).
- **Structured logging + secret redaction (the key win):** `nestjs-pino` hardened in
  `shared/logging/logger.config.ts` — JSON in prod / pretty in dev; a **correlation id** per request
  (reuse inbound `x-request-id` else mint a UUID, echoed on the response); **`redact`** censors
  `authorization`/`cookie` request headers, `set-cookie` **response** headers (load-bearing — this app
  *does* log response headers, so without it the httpOnly JWT cookie would hit the logs in cleartext),
  and `password`/`passwordHash`/`token`/`accessToken`/`refreshToken`/`clientSecret`/`secret`/Stripe-key
  fields (bare + nested). Logging is a security surface once you auto-log requests.
- **Health: liveness vs readiness (deploy-safe):** `GET /health` stays **DB-independent** (liveness;
  shared `HealthResponse` unchanged) so a transient DB blip can't make ECS kill a healthy task — it
  remains the ALB target. New `GET /health/ready` runs `SELECT 1` (readiness) → 200 `{database:'up'}` /
  **503** on DB loss; it's the *intended* ALB target, and repointing the target group is a documented
  infra follow-up (not changed here). Hand-rolled, no `@nestjs/terminus` (one `SELECT 1` reads clearer;
  terminus noted as the seam).
- **Delivery metrics:** `docs/build/delivery-metrics.md` — the four DORA keys computed from **real git
  history** (10 days, 45 commits, 9 green-`main` slices, 1 prod deploy) with honest caveats (solo +
  AI-assisted, no PR/CI latency, releasability-proxy for deploy frequency). The through-line: the
  verify-before-done discipline converted the expensive bugs (crash-looping container, stuck button)
  into *caught*-failures, not change-failures; the one escaped defect was the S4 leaked-key incident.
- **Definition of Done:**
  - [x] `tsc --noEmit` clean; full suite green (**61 suites / 357 tests**)
  - [x] structured logs with correlation id; **secrets redacted** (proven live — `[Redacted]`, zero cleartext)
  - [x] `/health` liveness unchanged + DB-independent (ALB-safe); `/health/ready` 200 up / 503 down (proven)
  - [x] delivery-metrics doc from real git data
  - [x] domain untouched
- **Verifier result:** **PASS (first pass).** Paused Postgres → `/health/ready` 503, unpaused → 200,
  while `/health` stayed 200 throughout; login with `Authorization`/`Cookie` logged `[Redacted]` and a
  full-log grep for the plaintext secrets/JWT prefix found **zero**; correlation id generated + echoed;
  61/357 green. One stale comment corrected post-verify (the `set-cookie` redact path is load-bearing,
  not defence-in-depth — this app logs response headers). **Caveat:** the Stripe webhook redaction path
  is unit-tested but **not** live-proven (needs the Stripe CLI/tunnel) — noted, not a gap.
- **ADRs:** `adr/0015-observability-liveness-readiness-split-and-log-redaction.md`.
- **Deferred (documented):** repoint the ALB target group to `/health/ready`; OpenTelemetry traces +
  Sentry at the noted seam; ship logs to a queryable store (CloudWatch Insights/OpenSearch).
- **Next:** S7c — Docs finalize (README with architecture + run instructions + live links; ADR set
  review) — the final phase of the build.

---

## S7c — Docs Finalize  *(learn-by-reading mode — Claude-written)  ·  the final phase*

- **Shipped:** the closing documentation pass. No code; the PRD §3/§5 docs bar for the finished build.
- **README rewritten** ([README.md](../../README.md)) — it was frozen at S2 (stale status "Next: S3",
  a Vercel/Render/Neon deploy row that never happened). Now reflects the finished build: complete
  status, the architecture diagram + hexagon note, the nine Bounded Contexts, the real AWS deploy
  topology, Node 22 / pnpm 9 run instructions, the Stripe-test setup note (with the `NEXT_PUBLIC_`
  secret warning learned in the deploy), the testing guide (357 tests / 61 suites), a **"four
  guarantees worth reading the code for"** section (overbooking `EXCLUDE`, idempotent webhook, outbox
  atomicity, ownership 404-no-leak), and a full **ADR index**. Live hostnames deliberately not
  published (consistent with the deploy sanitisation).
- **ADR index added** ([adr/README.md](../../adr/README.md)) — all 15 ADRs tabulated with the slice
  that produced each. **ADR set reviewed:** 15 records, all `Accepted`, sequentially numbered 0001–0015,
  consistent format. The PRD asked for ≥3 (§5 G5); the decision trail is itself a deliverable.
- **README claims verified** against the repo (not asserted blindly): `apps/api/.env.example`, `LICENSE`,
  and the web `test:e2e` / `test:e2e:install` scripts all exist; the Swagger `/docs` + `/health/ready`
  endpoints are real; test counts match the S7b suite (357/61).
- **Definition of Done (S7c):**
  - [x] README top shows the CI badge + accurate status; architecture, tech rationale, run + test
        instructions, API-docs link, deploy section, ADR index all present and correct
  - [x] ≥3 ADRs (15), all Accepted + indexed
  - [x] every command/link in the README verified to exist
- **Verifier:** n/a — docs-only phase, no runtime surface (the build's *code* was verified through S7b).
- **Honest gaps (documented in the README §Known follow-ups, not hidden):** no **coverage badge** yet
  (jest coverage + a badge service is a follow-up — the CI badge is present and green); infra is still
  click-ops; CSP not enforced; single Fargate task. None are on the P0–S7 scope.
- **🎉 Build complete:** P0 → S7 all shipped, verified, recorded. Guest + host journeys live on AWS,
  `main` green throughout, 357 backend tests + Playwright, 15 ADRs. What remains is the post-MVP
  follow-up list (README §Known follow-ups) — a deliberate, documented backlog, not unfinished work.
