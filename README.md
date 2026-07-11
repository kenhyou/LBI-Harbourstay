# Harbourstay

> An OTA (online travel agency) platform for booking short stays & tours — built as a full-stack, Domain-Driven Design exercise on a real, hard problem: **preventing overbooking and confirming payment reliably.**

[![CI](https://github.com/kenhyou/LBI-Harbourstay/actions/workflows/ci.yml/badge.svg)](https://github.com/kenhyou/LBI-Harbourstay/actions/workflows/ci.yml)
<!-- coverage badge is a documented follow-up (see docs/build/delivery-metrics.md) -->

**Status:** ✅ **Complete through the P0–S7 build.** The full guest journey (search → reserve → pay in Stripe test mode → confirm → view bookings → cancel) and host journey (create/publish listings → block dates → view bookings) run end-to-end, **deployed live on AWS**, with `main` green throughout. **357 backend tests** (unit + Testcontainers integration + API e2e) and Playwright browser journeys pass; **15 ADRs**; security + observability baselines in place. Full slice-by-slice history: [docs/build/PROGRESS.md](docs/build/PROGRESS.md).

---

## What it is

Guests search availability, reserve dates, pay (Stripe **test mode**), and receive an emailed confirmation; they can list and cancel their bookings within policy. Hosts create and publish listings, block out dates, and see bookings across their properties. The reservation lifecycle — search → reserve → confirm → pay → cancel — spans inventory, availability, pricing, concurrency, and reliable payment confirmation, and is modelled with **DDD + CQRS + Saga + Transactional Outbox**.

The point of the project is depth on the *booking domain* and its architecture, not breadth. Deep security, multi-tenancy, real settlement, and native mobile are explicitly **out of scope** (see the [PRD](prd-harbourstay-booking-platform.md)).

> **How it was built.** Harbourstay is a learning build: an AI agent (Claude Code) scaffolds and verifies while the author implements the core (domain models, handlers, key components) — a "scaffold-and-fill" curriculum across vertical slices. The `docs/` and `adr/` trees are the paper trail of that process.

## The four guarantees worth reading the code for

1. **Overbooking is impossible** — enforced by a Postgres `EXCLUDE` constraint (a cross-`Hold` invariant no single aggregate can hold), proven under real concurrency: two overlapping reservations race → exactly one wins. ([ADR-0007](adr/0007-overbooking-via-postgres-exclude-constraint.md))
2. **A duplicate payment webhook is harmless** — a `ProcessedWebhookEvent` dedup ledger + an idempotent `Payment` aggregate mean Stripe's at-least-once delivery confirms a booking exactly once. ([ADR-0008](adr/0008-stripe-payment-gateway-anti-corruption-layer.md))
3. **Confirm-and-notify can't tear** — the `BookingConfirmed` event is written in the *same transaction* as the state change (Transactional Outbox); a relay delivers it at-least-once to an idempotent consumer. ([ADR-0009](adr/0009-transactional-outbox-for-booking-confirmed.md))
4. **You can't see or touch another host's data** — every owned resource uses a 404-no-leak ownership check (a foreign id is byte-identical to an unknown one), audited across all 24 routes. ([ADR-0012](adr/0012-host-authorization-rbac-role-plus-ownership-404-no-leak.md), [docs/security-audit.md](docs/security-audit.md))

## Architecture

A **Turborepo monorepo** with a Next.js frontend, a NestJS backend on a strict hexagonal (ports & adapters) architecture, and a shared contract package giving end-to-end type safety.

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

The domain layer has **zero** framework/ORM imports; Prisma lives only in `infra/`, behind ports. The CQRS read path bypasses the domain entirely (Prisma rows projected straight into read-model DTOs). A contract mismatch between the two apps fails at **compile time**, because both import the same Zod schemas from `packages/shared`. Full boundaries, relationships, and vocabulary are in the [design docs](#design--decisions).

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

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router, React Server Components), TypeScript, Tailwind, TanStack Query, React Hook Form + Zod |
| Backend | NestJS, `@nestjs/cqrs`, hexagonal DDD, `@nestjs-cls/transactional` |
| ORM / DB | Prisma + PostgreSQL (behind repository ports) |
| Auth | JWT (access + refresh) in an httpOnly cookie; RBAC (guest/host/admin) |
| Payments | Stripe (test mode) + webhooks, behind an ACL |
| Reliability | Transactional Outbox + `@Interval` relay; `BookingCheckoutSaga` process manager |
| Security | helmet, credentialed CORS allow-list, `@nestjs/throttler` rate limiting, secret-redacting logs, JWT-secret fail-fast |
| Observability | pino structured logging + correlation id; liveness/readiness health split |
| Testing | Jest (unit) · Supertest + Testcontainers (integration) · Playwright (E2E) |
| Tooling | Turborepo + pnpm · Docker Compose · GitHub Actions · pino · Swagger/OpenAPI |
| **Deploy** | **AWS** — web → **Amplify Hosting** (SSR) · api → **ALB + ACM → ECS Fargate** · db → **RDS PostgreSQL 16** (private) · secrets in **SSM Parameter Store** ([ADR-0010](adr/0010-aws-deploy-ecs-fargate-behind-alb.md), [runbook](docs/DEPLOY.md)) |

Rationale for every non-obvious choice lives in the [ADR index](#architecture-decision-records) below.

## Repository layout

```
prd-harbourstay-booking-platform.md   # product requirements (the spec)
CLAUDE.md · AGENT.md                   # guidance for Claude Code / other LLM agents
docs/
  strategic-design/STRATEGIC.md        # Bounded Contexts, Context Map, Ubiquitous Language
  DESIGN.md                            # Tactical Design: aggregates, VOs, state machines, saga
  build/PROGRESS.md                    # slice-by-slice build log
  build/delivery-metrics.md            # DORA delivery metrics (from git history)
  security-audit.md                    # per-route authorization audit
  DEPLOY.md                            # AWS deployment runbook
adr/                                   # 15 Architecture Decision Records
apps/web · apps/api                    # frontend / backend
packages/shared                        # Zod contract types (the Shared Kernel)
.claude/                               # skills + agents that drive design and build
```

## Getting started

**Prerequisites:** Node 22+, pnpm 9, and Docker (for Postgres and the integration tests).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env                        # DATABASE_URL etc. (JWT secrets have dev defaults)
docker compose up -d db                                       # Postgres 16
pnpm --filter @harbourstay/api exec prisma migrate deploy     # create the tables
pnpm --filter @harbourstay/api exec prisma db seed            # demo listings + a host account
pnpm dev                                                      # web :3000 + api :3001
```

Then open **http://localhost:3000**. The API's Swagger docs are at **http://localhost:3001/docs**; the readiness probe is **http://localhost:3001/health/ready**.

**Seeded host** (to try the host dashboard): `host@harbourstay.test` / `password123` — owns the demo listings.

> **Stripe test payments (S4):** set `STRIPE_SECRET_KEY` (`sk_test_…`) + `STRIPE_WEBHOOK_SECRET` (`whsec_…`) in `apps/api/.env` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) in the web env; run the Stripe CLI to forward webhooks locally (`stripe listen --forward-to localhost:3001/webhooks/stripe`). **Never** put an `sk_` key in a `NEXT_PUBLIC_` var. Test card: `4242 4242 4242 4242`.

## Testing

Two layers — a fast Jest suite (unit + integration) and browser end-to-end with Playwright. **357 backend tests / 61 suites** + Playwright journeys, all green.

```bash
pnpm test                                    # whole workspace
pnpm --filter @harbourstay/api test          # backend (unit + Testcontainers + e2e — Docker required)
pnpm --filter @harbourstay/api test -- --watch          # watch mode
pnpm --filter @harbourstay/api test listing.model.spec  # a single file by name
```

The backend suite includes **Testcontainers** integration specs (a real throwaway Postgres — e.g. the overbooking concurrency race, the outbox relay, and the block→booking-rejection proof) and API e2e specs (`*.e2e.spec.ts`). **Docker must be running** for these.

Browser end-to-end (Playwright) needs the **API running + database ready**; it starts the web server itself:

```bash
pnpm --filter @harbourstay/web test:e2e:install              # one-time: fetch Chromium
docker compose up -d db
pnpm --filter @harbourstay/api exec prisma migrate deploy && pnpm --filter @harbourstay/api exec prisma db seed
pnpm --filter @harbourstay/api dev                          # terminal 1 — API on :3001, leave running
pnpm --filter @harbourstay/web test:e2e                     # terminal 2 — auto-starts web, runs the specs
```

Useful: `--headed` (watch it), `--ui` (interactive), `playwright test host-availability` (one suite), `playwright show-report`.

## Design & decisions

- **[Strategic Design](docs/strategic-design/STRATEGIC.md)** — Bounded Contexts, Context Map, Ubiquitous Language (derived via a four-role DDD debate; the transcripts are under `docs/strategic-design/`).
- **[Tactical Design](docs/DESIGN.md)** — aggregates, value objects, state machines, the saga, and consistency boundaries per BC.
- **[Build log](docs/build/PROGRESS.md)** — every slice: what shipped, what was implemented by whom, the verifier result, and the ADRs.
- **[Delivery metrics](docs/build/delivery-metrics.md)** — the four DORA keys from real git history.
- **[Security audit](docs/security-audit.md)** — every route × guard × role × ownership × validation.

### Architecture Decision Records

Every non-obvious choice is recorded under [`adr/`](adr/) (see [adr/README.md](adr/README.md) for this index):

| # | Decision |
|---|---|
| [0001](adr/0001-monorepo-turborepo-pnpm.md) | Monorepo on Turborepo + pnpm |
| [0002](adr/0002-prisma-behind-repository-port.md) | Prisma behind a repository port (keep the domain ORM-free) |
| [0003](adr/0003-swc-builder-for-nest-path-aliases.md) | SWC builder for Nest path aliases |
| [0004](adr/0004-shared-postgres-listing-table-ownership.md) | Shared Postgres; Listing table ownership (read vs write side) |
| [0005](adr/0005-money-minor-units-on-the-wire.md) | Money as integer minor units on the wire |
| [0006](adr/0006-jwt-httponly-cookie-session-and-bcrypt.md) | JWT in an httpOnly cookie + bcrypt |
| [0007](adr/0007-overbooking-via-postgres-exclude-constraint.md) | Overbooking prevented by a Postgres `EXCLUDE` constraint |
| [0008](adr/0008-stripe-payment-gateway-anti-corruption-layer.md) | Stripe behind an Anti-Corruption Layer |
| [0009](adr/0009-transactional-outbox-for-booking-confirmed.md) | Transactional Outbox for `BookingConfirmed` |
| [0010](adr/0010-aws-deploy-ecs-fargate-behind-alb.md) | AWS deploy — ECS Fargate behind an ALB |
| [0011](adr/0011-cancellation-policy-vo-refund-computed-not-issued.md) | Cancellation policy VO; refund computed, not issued |
| [0012](adr/0012-host-authorization-rbac-role-plus-ownership-404-no-leak.md) | Host authorization — RBAC 403 + ownership 404-no-leak |
| [0013](adr/0013-availability-blocks-inside-listing-aggregate-enforced-at-hold-time.md) | Availability blocks inside the Listing aggregate, enforced at hold time |
| [0014](adr/0014-owasp-security-baseline-and-secrets-fail-fast.md) | OWASP security baseline + secrets fail-fast |
| [0015](adr/0015-observability-liveness-readiness-split-and-log-redaction.md) | Observability — liveness/readiness split + log redaction |

## Deployment

Deployed on **AWS** (`us-west-2`) on a **private custom domain** over TLS — web on Amplify Hosting (SSR), API on ECS Fargate behind an ALB (ACM cert), Postgres on RDS (private), secrets in SSM. The Fargate task runs in a public subnet with an egress-only security-group chain (`alb-sg → api-sg → rds-sg`) so it reaches Stripe without a NAT gateway while staying unreachable from the internet. `prisma migrate deploy` runs in-container on start, so RDS never needs public access. **Live hostnames are deliberately not published in this repo.** Full runbook + teardown: [docs/DEPLOY.md](docs/DEPLOY.md); rationale: [ADR-0010](adr/0010-aws-deploy-ecs-fargate-behind-alb.md).

## Known follow-ups (out of the MVP cut line)

Codify the click-ops infra as CDK/Terraform; repoint the ALB health check to `/health/ready`; enforce a CSP (report-only → widen → enforce); Redis-backed rate limiting for >1 task; a real mailer (SES) behind the existing port; per-listing cancellation policies + rate rules; image upload to object storage; a coverage badge; OpenTelemetry/Sentry. Scope guardrails (multi-tenancy, real settlement, deep security, native mobile) remain out of scope by design (PRD §2/§6).

## License

[MIT](LICENSE) © 2026 Ken Hoegun You
