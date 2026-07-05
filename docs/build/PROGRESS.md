# Harbourstay Build Progress

> Updated at the end of every slice. One row per slice; newest note at the bottom of each slice block.
> This file is the **single source of truth for build state** — CLAUDE.md / AGENT.md carry only the rules and point here.

## Status at a glance

| Slice | PRD milestone | State | Working evidence |
|---|---|---|---|
| P0 Scaffold | P0 | ☑ done | local `pnpm dev` — `/health` end-to-end; CI green locally |
| S1 Listing search & detail | P1 | ☑ done | `/listings` search + `/listings/:id` detail over seeded Postgres; 15 api tests + 5 Playwright green |
| S2 Auth | M1 | ☑ done | register/login → httpOnly-cookie JWT session, RBAC guard; **Ken wrote the domain layer**; 77 api tests + 4 Playwright green |
| S3 Availability + Booking Hold | P2 | ☐ | |
| S4 Payment Saga | P3 | ☐ | **cut line** |
| S5 My bookings + cancel | M5 | ☐ | |
| S6 Host dashboard | P4 | ☐ | |
| S7 Hardening | P5 | ☐ | |

Branch: `s2-auth` (off `main`; not yet committed at time of writing).
**Next up: S3 — Availability + Booking Hold** (Booking + Inventory write side: create a Hold with overbooking prevention under concurrency — the hard slice). Depends on S1 + S2, both done. Scaffold-and-fill: Ken's fill files will be the `Booking`/`Hold` domain + the state machine.
Deployed: web `<deferred to S4>` · api `<deferred to S4>` · db local docker-compose Postgres 16.
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
