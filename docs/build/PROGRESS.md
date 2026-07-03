# Harbourstay Build Progress

> Updated at the end of every slice. One row per slice; newest note at the bottom of each slice block.

## Status at a glance

| Slice | PRD milestone | State | Working evidence |
|---|---|---|---|
| P0 Scaffold | P0 | ☑ done | local `pnpm dev` — `/health` end-to-end; CI green locally |
| S1 Listing search & detail | P1 | ☐ | |
| S2 Auth | M1 | ☐ | |
| S3 Availability + Booking Hold | P2 | ☐ | |
| S4 Payment Saga | P3 | ☐ | **cut line** |
| S5 My bookings + cancel | M5 | ☐ | |
| S6 Host dashboard | P4 | ☐ | |
| S7 Hardening | P5 | ☐ | |

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
