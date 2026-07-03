# Harbourstay

> An OTA (online travel agency) platform for booking short stays & tours — built as a full-stack, Domain-Driven Design exercise on a real, hard problem: **preventing overbooking and confirming payment reliably.**

[![CI](https://github.com/kenhyou/LBI-Harbourstay/actions/workflows/ci.yml/badge.svg)](https://github.com/kenhyou/LBI-Harbourstay/actions/workflows/ci.yml)
<!-- coverage · live web · live api badges added when deployed (S4 cut line) -->

**Status:** 🏗️ P0 in progress — monorepo scaffolded; `/health` runs end-to-end (NestJS → shared contract → Next.js RSC), Postgres + Prisma wired, CI green. Strategic + Tactical Design complete. See [Roadmap](#roadmap).

---

## What it is

Guests search availability, reserve, pay (Stripe **test mode**), and receive confirmation; hosts list properties and manage availability & rates. The reservation lifecycle — search → reserve → confirm → pay → cancel — spans inventory, availability, pricing, concurrency, and reliable payment confirmation, and is modelled with **DDD + CQRS + Saga + Transactional Outbox**.

The point of the project is depth on the *booking domain* and its architecture, not breadth. Deep security, multi-tenancy, real settlement, and native mobile are explicitly **out of scope** (see the [PRD](prd-harbourstay-booking-platform.md)).

## Architecture

A **Turborepo monorepo** with a Next.js frontend, a NestJS backend built on a strict hexagonal (ports & adapters) architecture, and a shared contract package giving end-to-end type safety.

```
Browser ─▶ apps/web  (Next.js App Router, RSC)
             │  typed REST over @harbourstay/shared (Zod contracts)
           apps/api  (NestJS · DDD · CQRS)
             │  interface → application → domain (pure) → infrastructure
             ▼
        PostgreSQL (Prisma behind repository ports)
             │  Transactional Outbox ─▶ Notifications (email)
        Stripe (test) ─ webhook ─▶ Payments (behind an ACL)
```

The domain layer has **zero** framework/ORM imports; Prisma lives only in `infra/`, behind ports. The CQRS read path bypasses the domain. Full boundaries, relationships, and vocabulary are in the design docs below.

### Bounded Contexts

Nine contexts (from [Strategic Design](docs/strategic-design/STRATEGIC.md)):

| Context | Class | Owns |
|---|---|---|
| **Booking** | Core | reservation lifecycle / state machine |
| **Availability & Inventory** | Core | the Hold + overbooking invariant + canonical Listing (Pricing folded in) |
| **Payment Confirmation** | Core | "truly paid" reconciliation; idempotent webhook |
| Money Movement | Generic | Stripe behind an Anti-Corruption Layer |
| Listing Catalog & Search | Supporting | CQRS read-side "marketed offer" view |
| Host Management | Supporting | host command surface over Inventory |
| Identity & Access | Generic | users / roles / JWT |
| Notifications | Generic | Outbox-driven email |
| Reviews | Supporting | post-stay ratings (deferred) |

The heart of the system: **overbooking is prevented by a Postgres `EXCLUDE` constraint** (a cross-aggregate invariant the database enforces), and **payment → confirmation is coordinated by a `BookingCheckoutSaga`** with the Transactional Outbox guaranteeing at-least-once notification.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router, React Server Components), TypeScript, Tailwind, shadcn/ui, TanStack Query, React Hook Form + Zod |
| Backend | NestJS, `@nestjs/cqrs`, hexagonal DDD |
| ORM / DB | Prisma + PostgreSQL (behind repository ports) |
| Auth | JWT (access + refresh) in an httpOnly cookie; RBAC (guest/host/admin) |
| Payments | Stripe (test mode) + webhooks, behind an ACL |
| Testing | Jest (unit) · Supertest + Testcontainers (integration) · Playwright (E2E) |
| Tooling | Turborepo + pnpm · Docker Compose · GitHub Actions · pino · Swagger/OpenAPI |
| Deploy | web → Vercel · api → Render/Fly/Railway · db → Neon/Supabase |

Rationale for the non-obvious choices lives in Architecture Decision Records under [`adr/`](adr/) (created during the build).

## Repository layout

```
prd-harbourstay-booking-platform.md   # product requirements (the spec)
CLAUDE.md · AGENT.md                   # guidance for Claude Code / other LLM agents
docs/
  strategic-design/STRATEGIC.md        # Bounded Contexts, Context Map, Ubiquitous Language
  DESIGN.md                            # Tactical Design: aggregates, VOs, state machines, saga
  build/PROGRESS.md                    # slice-by-slice build log (from P0)
adr/                                   # Architecture Decision Records (from the build)
apps/web · apps/api                    # (after P0) frontend / backend
packages/shared                        # (after P0) Zod contract types
.claude/                               # skills + agents that drive design and build
```

## How this repo is built

Harbourstay is built with an AI agent's guidance, in three stages, each a committed artifact:

1. **Strategic Design** (`/strategic-design`) — a four-role debate deriving the Bounded Contexts, Context Map, and Ubiquitous Language → [`docs/strategic-design/`](docs/strategic-design/). ✅
2. **Tactical Design** — mapping each BC to aggregates, value objects, and state machines → [`docs/DESIGN.md`](docs/DESIGN.md). ✅
3. **Implementation** (`/fullstack-build`) — building the app one **vertical slice** at a time (shared contract → backend → frontend → verified end-to-end), driven by the two design docs. ⏳

## Roadmap

Vertical slices mapped to the PRD milestones (§12); each ends deployable:

- **P0** — monorepo scaffold, both apps running, CI green
- **S1** — listing search & detail (CQRS read side)
- **S2** — auth & roles (JWT, RBAC)
- **S3** — availability + booking Hold (overbooking prevention proven under concurrency)
- **S4** — payment Saga + Outbox + confirmation email — **minimum deployable cut line** (search → reserve → pay → confirm)
- **S5** — my bookings + cancel · **S6** — host dashboard · **S7** — hardening (E2E, OWASP baseline, ADRs, delivery metrics)

## Getting started

> The monorepo is not scaffolded yet — these are the intended commands once P0 lands.

```bash
pnpm install
docker compose up -d          # Postgres
pnpm --filter api prisma migrate dev
pnpm dev                      # web + api
```

Run instructions, API docs (Swagger), and live deployment links will be filled in here as the build progresses.

## License

Personal project. No license granted yet.
