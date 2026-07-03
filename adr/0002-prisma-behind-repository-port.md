# ADR-0002: Prisma behind a repository port (keep the hexagon)

- **Status:** Accepted
- **Date:** 2026-07-03
- **Slice:** P0 (decision) — implemented from S1
- **Deciders:** Ken (with Claude Code)

## Context

PRD §7 mandates a hexagonal backend: the domain layer must have **zero** framework/ORM
imports so domain logic is unit-testable without a database and the ORM stays swappable.
Prisma is our chosen ORM (PRD §8), but Prisma types leaking into domain/application would
couple the core to the persistence technology.

## Decision

Prisma lives **only** in `apps/api/src/<bc>/infra/`. `PrismaService` (a Nest provider
wrapping `PrismaClient`) is the single place the client is constructed. The application
layer depends on **abstract-class ports** (`*.repository.port.ts`, `*.query.port.ts`);
infra provides the implementations and a **mapper** converts Prisma rows ↔ domain models.
The CQRS read path projects Prisma rows **directly** into Read Model DTOs, bypassing the
domain (no `reconstitute()` on reads).

In P0 we scaffold `PrismaService`/`PrismaModule` but do **not** wire them into `AppModule`
yet — the first repository (and the DB connection on boot) arrives in S1 — so the API
still boots without a database.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Prisma behind ports (chosen) | domain framework-free, ORM swappable, true CQRS reads | more layers/mappers to write | the point of the exercise (PRD §7) |
| Prisma models as domain models | less code | domain married to ORM; no pure unit tests | violates PRD §7 |
| TypeORM active-record | familiar | same coupling problem; heavier | no benefit over Prisma here |

## Consequences

- Positive: domain unit tests run with zero mocks and zero DB; the read path pays no
  aggregate-reconstitution cost.
- Negative / trade-offs: a mapper + port per aggregate is boilerplate.
- Follow-ups: S1 wires `PrismaModule` into `AppModule` and adds the first
  `ListingQueryPort` implementation; transaction handling (cross-aggregate writes) is
  deferred to S3 via a transaction-manager port (`@nestjs-cls/transactional`).
