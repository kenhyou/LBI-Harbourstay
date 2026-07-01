# Harbourstay Implementation Conventions

Authoritative folder/file naming and structure for the monorepo, so guidance stays consistent across slices without re-reading prior code. When a new convention is decided, **edit this file in the same session**.

Adapted from the `../nestjs` four-layer DDD conventions, ported from TypeORM→**Prisma** and extended to a **Next.js** frontend + shared contract.

---

## Monorepo layout (Turborepo + pnpm)

```text
apps/
  api/            # NestJS backend (DDD/CQRS, hexagonal)
  web/            # Next.js frontend (App Router, RSC)
packages/
  shared/         # contract: Zod schemas + inferred types (the Shared Kernel)
  tsconfig/       # shared TS configs
prisma/           # schema.prisma, migrations, seed (or under apps/api/prisma)
docs/             # PRD, strategic-design/, DESIGN.md, build/PROGRESS.md
adr/              # Architecture Decision Records
docker-compose.yml
turbo.json
```

Path aliases: `@harbourstay/shared` (contract), `@/…` (app-local). Per-BC aliases inside `apps/api` optional (`@booking/*`, `@inventory/*`).

---

## Backend — `apps/api`, folder structure per Bounded Context

```text
apps/api/src/<bc>/
├── presenters/http/{controllers,dtos,filters}
├── application/
│   ├── commands/            # command data containers
│   │   └── handlers/        # @CommandHandler classes
│   ├── queries/             # query data containers
│   │   ├── dtos/            # <name>.read-model.ts
│   │   └── handlers/        # @QueryHandler classes
│   ├── events/handlers/     # @EventsHandler (react to domain events) — event tiers only
│   ├── ports/               # abstract-class ports (repository, query, cross-BC, mailer, token, tx)
│   └── services/            # thin CommandBus/QueryBus facade
├── domain/
│   ├── models/              # aggregates + entities (.model.ts)
│   ├── vo/                  # value objects (.vo.ts)
│   ├── enums/              # plain enums (.enum.ts)
│   ├── events/             # domain events (.event.ts) — event tiers only
│   ├── factories/          # (.factory.ts)
│   ├── services/           # domain services
│   └── exceptions/         # (.exception.ts)
└── infra/
    ├── prisma/             # PrismaService + module
    ├── mappers/            # <aggregate>.mapper.ts  (Prisma row ↔ domain)
    ├── repositories/       # <aggregate>.repository.ts (write impl of the port)
    ├── queries/            # <name>.query.ts (read impl of the Query Port)
    └── adapters/           # cross-BC / external ACL adapters (e.g. Stripe)
apps/api/src/shared/         # framework-free cross-cutting; global filter; AggregateRoot/DomainEvent base
```

`domain/events/` and the `AggregateRoot`/`DomainEvent` base classes exist only in BCs that record Domain Events (Booking, and anything on the Outbox). Domain event **payloads are primitives only** — they serialize into the outbox and may cross a BC boundary; no VOs leak through.

### Backend file naming

| Artifact | Pattern | Example |
|---|---|---|
| Value Object | `<name>.vo.ts` | `date-range.vo.ts`, `money.vo.ts` |
| Enum | `<name>.enum.ts` | `booking-status.enum.ts` |
| Domain Event | `<name>.event.ts` (class `…Event`) | `booking-confirmed.event.ts` |
| Aggregate / Entity | `<name>.model.ts` | `booking.model.ts` |
| Factory | `<name>.factory.ts` | `booking.factory.ts` |
| Domain Exception | `<name>.exception.ts` | `booking-not-found.exception.ts` |
| Repository Port (write) | `<aggregate>.repository.port.ts` | `booking.repository.port.ts` |
| Query Port (read) | `<aggregate>.query.port.ts` | `listing.query.port.ts` |
| Cross-BC / infra Port | `<capability>.port.ts` | `auth-token.port.ts`, `mailer.port.ts`, `transaction.port.ts` |
| Read Model DTO | `<name>.read-model.ts` | `listing-summary.read-model.ts` |
| Command / Handler | `<verb>-<aggregate>.command.ts` / `.command.handler.ts` | `create-booking.command.handler.ts` |
| Query / Handler | `<verb>-<name>.query.ts` / `.query.handler.ts` | `get-availability.query.handler.ts` |
| Service Facade | `<aggregate>.service.ts` | `booking.service.ts` |
| Mapper | `<aggregate>.mapper.ts` | `booking.mapper.ts` |
| Repository impl | `<aggregate>.repository.ts` | `booking.repository.ts` |
| Query impl | `<name>.query.ts` (class `…Query`) | `listing.query.ts` |
| ACL Adapter | `<capability>.adapter.ts` | `stripe-payment.adapter.ts` |
| Request DTO | `<verb>-<aggregate>.request.ts` | `create-booking.request.ts` |
| Test | `<source>.spec.ts` next to source | `booking.model.spec.ts` |

### Backend layering rules (hard)

| Rule | Reason |
|---|---|
| No framework/ORM imports in `domain/` (except `@Injectable` on factories/domain services) | isolated tests, framework independence (PRD §7) |
| No `infra/` imports in `application/` | dependency inversion |
| Prisma only in `infra/`; domain/application never import `@prisma/client` | keep the hexagon; ORM swappable (PRD ADR) |
| Ports are `abstract class`, bound to impls in **exactly one module** | usable as runtime DI tokens |
| Query path bypasses the domain; Read Models projected in `infra/queries/` | true CQRS, no reconstitution cost |
| Transaction context flows via the transaction-manager port / CLS, never as a function param, never `prisma.$transaction` in `application/` | keeps application/domain Prisma-free |
| An aggregate's own id is a VO; a reference to a foreign aggregate is a plain `string` | no FK/foreign-VO leakage across aggregates |
| Cross-BC ports speak **primitives**, adapters translate | ACL; no shared kernel for domain VOs (contract types in `packages/shared` are DTOs, not domain VOs) |

---

## Frontend — `apps/web` (Next.js App Router)

```text
apps/web/
├── app/                    # routes; Server Components by default
│   ├── <route>/page.tsx    # RSC page (server fetch)
│   ├── <route>/loading.tsx # loading UI
│   ├── <route>/error.tsx   # error boundary (client)
│   └── api/                # route handlers (cookie/session, webhooks proxy if needed)
├── components/             # shared UI (shadcn/ui wrappers, cards)
├── lib/
│   ├── api/                # typed API clients (import @harbourstay/shared)
│   └── auth/               # session helpers (httpOnly cookie, server-side)
└── e2e/                    # Playwright specs
```

### Frontend conventions

- **Server Component by default.** Add `'use client'` only for interactivity (forms, TanStack Query, Stripe Element, calendars).
- **Fetch on the server** in RSC pages; runtime-validate responses with the shared Zod schema (`schema.parse(...)`).
- **Forms:** React Hook Form + `zodResolver(sharedSchema)`. Never redefine the schema client-side.
- **Client data/mutations:** TanStack Query; keep query keys per resource.
- **Every route** has `loading.tsx` + `error.tsx` and an explicit empty state.
- **Auth:** session lives in an httpOnly cookie set by a route handler/server action; read it server-side; guard protected routes on the server, not just the client.
- **Styling:** Tailwind + shadcn/ui; responsive; basic a11y (labels/focus/roles).

---

## Contract — `packages/shared`

- One file per resource under `src/contracts/`; export the Zod schema **and** the inferred type.
- These are **DTO/contract** types (transport shapes), deliberately separate from backend domain VOs. The backend maps contract ⇄ domain at the presenter boundary; the frontend consumes contract types directly.
- Bump nothing by hand that Zod can infer — always `z.infer`.

---

## Testing conventions (test pyramid — PRD §13)

- **Unit (many):** pure domain — VO/aggregate/state-machine. **Zero mocks** in domain tests; if one is needed, the design is wrong. Positive **and** negative per transition.
- **Integration (fewer):** application handlers + Prisma repositories against **real Postgres via Testcontainers**; the Stripe webhook with a stubbed provider; Outbox publish; the S3 concurrency race.
- **E2E (fewest):** Playwright through the deployed/served frontend for headline journeys.
- Tests are `*.spec.ts` (backend) / `*.spec.ts`|`*.e2e.ts` (Playwright) written **during** the slice.
- `pnpm test` green ≠ types OK — run `tsc --noEmit` as a separate gate (ts-jest skips full type-checking).

---

## Stack versions & tooling

Pin from PRD §8: Next.js (App Router/RSC) · NestJS + `@nestjs/cqrs` · Prisma + PostgreSQL · JWT (access+refresh, httpOnly cookie) · Stripe test mode + webhooks · Jest + Supertest + Testcontainers + Playwright · Docker + docker-compose + GitHub Actions · pino · NestJS Swagger. Deploy: web→Vercel, api→Render/Fly/Railway, db→Neon/Supabase. Use exact versions (pin, no caret) so slices stay reproducible.
