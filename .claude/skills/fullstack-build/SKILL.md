---
name: fullstack-build
description: Step-by-step, vertical-slice curriculum for building the Harbourstay full-stack OTA booking app (Next.js + NestJS + Prisma/Postgres + Stripe, Turborepo monorepo). Each step ("slice") ships FULL WORKING CODE on both ends — shared contract, backend (DDD/CQRS), frontend (App Router/RSC), tests — and is verified to run end-to-end before moving on. Driven by the Strategic Design (`docs/strategic-design/STRATEGIC.md`) and Tactical Design (`docs/DESIGN.md`) documents and PRD milestones §12. Use when the user asks to build/implement the app, scaffold the monorepo, start P0, implement a BC or feature, do the next slice/step, run `/fullstack-build`, or continue the build. Uses four agents: contract-designer, backend-engineer, frontend-engineer, integration-verifier. Core principle: one vertical slice at a time, every slice runs and is verified. Does NOT do Strategic/Tactical Design — that is the strategic-design skill and DESIGN.md.
version: 0.1.0
---

# fullstack-build (Harbourstay)

A curriculum skill that builds the **Harbourstay** OTA booking platform one **vertical slice** at a time. Unlike a horizontal, layer-by-layer build, every slice cuts through the whole stack — shared contract → backend → frontend → verified end-to-end — so the app is runnable and demoable after every step.

The build is driven by three documents (produced earlier):
1. **PRD** — `prd-harbourstay-booking-platform.md` (root) or `docs/PRD.md`. Milestones §12, stack §8, architecture §7.
2. **Strategic Design** — `docs/strategic-design/STRATEGIC.md` (Bounded Contexts, Context Map, Ubiquitous Language). From the `strategic-design` skill.
3. **Tactical Design** — `docs/DESIGN.md` (Aggregates, VOs, use cases, events per BC).

This project's root **is** the implementation repo — the Turborepo monorepo (`apps/web`, `apps/api`, `packages/shared`) is scaffolded here.

---

## Non-Negotiable Principles

### 1. One Vertical Slice at a Time — and It Must Run

- A slice is done only when its **Definition of Done** (see below) is met: types clean, tests green, both apps run, the feature works end-to-end (curl + browser).
- Never leave code "as an exercise" or half-wired. Each step produces **full working code** on both ends.
- `main` stays green (PRD §12). Record the deployed/working state at the end of each slice.

### 2. Contract First

- Every slice starts in `packages/shared`: define the Zod schema + inferred TypeScript types (and, where relevant, the OpenAPI-facing DTO) **before** either end is written.
- Both `apps/web` and `apps/api` import the same contract. A contract mismatch must fail at **compile time**, not runtime (PRD §7, Shared Kernel).

### 3. Backend Keeps the Hexagon

- `apps/api` domain layer has **zero** framework/ORM imports (PRD §7). Prisma lives only in `infra/`, behind repository ports.
- CQRS read-bypass: query handlers return Read Models straight from Prisma; they never reconstitute a domain aggregate.
- See [references/conventions.md](references/conventions.md) — authoritative for folder/file naming.

### 4. Tests Are Written During the Slice, Not After

- Follow the test pyramid (PRD §13): domain unit tests (no mocks) → integration tests (Testcontainers against real Postgres) → Playwright E2E for the headline journeys.
- Every state transition gets a positive **and** a negative test.

### 5. Decisions Become ADRs

- When a slice forces a non-obvious choice (why CQRS, why Prisma-behind-a-port, why optimistic locking vs `EXCLUDE`), write/append an ADR under `adr/` (PRD §5 G5). The build is also a documentation exercise.

---

## Preconditions (check before Phase 0)

Before the first non-scaffold slice, verify the design docs exist:

- `docs/strategic-design/STRATEGIC.md` — if missing, tell the user to run `/strategic-design` first.
- `docs/DESIGN.md` — Tactical Design. If missing, the confirmed BCs from STRATEGIC.md have not been mapped to Aggregates yet; stop and hand back to Tactical Design (see the `strategic-design` skill's Handoff). Phase 0 (scaffold) may proceed without DESIGN.md, but no domain slice may.

If the user insists on building before design docs exist, offer to derive a **minimal** DESIGN.md for the single BC in scope first, then proceed — do not silently invent the whole domain model.

---

## The Curriculum (phases & slices)

See [references/curriculum.md](references/curriculum.md) for the full slice-by-slice detail (goal, BC, backend substeps, frontend substeps, tests, Definition of Done). Summary:

| Step | PRD milestone | Bounded Context(s) | End-to-end result |
|---|---|---|---|
| **P0 Scaffold** | §12 P0 | — | Turborepo up; `apps/web` + `apps/api` "hello" running; one shared type consumed both ends; Postgres via docker-compose; CI green |
| **S1 Listing search & detail** | §12 P1 | Inventory/Availability (read) | Search + detail pages (RSC) backed by a CQRS read model + seed data |
| **S2 Auth** | §12 M1 | Identity & Access | Register / login (JWT + httpOnly cookie), RBAC guard, login UI |
| **S3 Availability + Booking Hold** | §12 P2 | Booking + Inventory | Create Hold with overbooking prevention (optimistic lock / `EXCLUDE`); checkout-start UI; domain + integration tests |
| **S4 Payment Saga** | §12 P3 | Payments + Notifications + Booking | Stripe test PaymentIntent → webhook → BookingCheckoutSaga confirm → Outbox → confirmation email; payment UI. **Minimum deployable cut line** |
| **S5 My bookings + cancel** | §12 M5 | Booking | Booking list/detail + policy-aware cancel |
| **S6 Host dashboard** | §12 P4 | Inventory + Identity | Listing CRUD + availability/rate mgmt + host bookings, RBAC |
| **S7 Hardening** | §12 P5 | — | Playwright E2E, OWASP baseline, pino/health, delivery-metrics doc, ADRs finalized |

Slice order follows the PRD's dependency-driven milestones. **Do not reorder** without the user's decision — e.g. S3 depends on S1's listing model and S2's auth.

---

## How to Run a Slice

Every slice follows the same rhythm — the **vertical-slice recipe** in [references/slice-recipe.md](references/slice-recipe.md). In brief:

1. **Brief** — read the slice's row in `curriculum.md`, the relevant BC in STRATEGIC.md, and its Aggregates/use-cases in DESIGN.md. State the slice's goal and Definition of Done to the user.
2. **Contract** (`contract-designer`) — add the Zod schemas + types to `packages/shared`.
3. **Backend** (`backend-engineer`) — domain → application (CQRS) → infra (Prisma) → presenters → module wiring, with tests. Respect the hexagon and read-bypass.
4. **Frontend** (`frontend-engineer`) — typed API client → RSC page/route → client interactivity (TanStack Query / RHF+Zod) → loading/error states, with tests.
5. **Integrate & verify** (`integration-verifier`) — run both apps, exercise the slice with curl and a browser/Playwright pass, check every Definition-of-Done box. Report pass/fail.
6. **Record** — update `docs/build/PROGRESS.md`; write an ADR if a decision was made; note the working state. Then stop and let the user confirm before the next slice.

**Do not auto-advance to the next slice.** Finish, verify, record, and wait — same discipline as the design skill.

### Agent orchestration notes

- `contract-designer` runs first each slice and its output (the shared types) is the contract both engineers code against — pass it to both.
- `backend-engineer` and `frontend-engineer` can run **concurrently** once the contract is fixed, but the verifier runs only after both report done.
- Give each engineer only what it needs: the slice brief, the contract, the relevant BC/Aggregate sections, and [references/conventions.md](references/conventions.md). Do not dump the whole PRD.
- If the verifier fails a slice, feed the failure back to the responsible engineer — do not mark the slice done.

---

## Definition of Done (every slice)

A slice is complete only when **all** hold:

- [ ] `packages/shared` contract added; both apps import it; no duplicated type.
- [ ] `pnpm -w typecheck` (or `tsc --noEmit` in each package) passes.
- [ ] Backend: domain has zero framework/ORM imports; Prisma only in `infra/`; query side bypasses the domain.
- [ ] Tests green at the layers this slice touches (domain unit; integration via Testcontainers where infra changed; Playwright for a headline journey where UI changed).
- [ ] Both apps start (`pnpm dev`) and the feature works end-to-end — verified by curl **and** in the browser.
- [ ] `docs/build/PROGRESS.md` updated; ADR added if a decision was made.

Phase 0 has its own DoD (see curriculum.md): both apps deployed to public URLs with a green CI badge is the PRD's P0 bar, though a local docker-compose run is acceptable to unblock and deploy can follow.

---

## References & Agents

| File | Purpose |
|---|---|
| [references/curriculum.md](references/curriculum.md) | full per-slice detail: goal, BC, backend + frontend substeps, tests, DoD |
| [references/slice-recipe.md](references/slice-recipe.md) | the repeatable contract→backend→frontend→verify rhythm, with code skeletons |
| [references/conventions.md](references/conventions.md) | authoritative folder/file naming for the monorepo (Prisma + Next.js) |
| [references/templates/progress.md](references/templates/progress.md) | `docs/build/PROGRESS.md` template |
| [references/templates/adr.md](references/templates/adr.md) | ADR template for `adr/` |

| Agent | subagent_type | Role |
|---|---|---|
| Contract Designer | `contract-designer` | owns `packages/shared` — Zod schemas + inferred types, the single source of truth both ends import |
| Backend Engineer | `backend-engineer` | `apps/api` — NestJS DDD/CQRS/Prisma, hexagonal, with Jest + Testcontainers tests |
| Frontend Engineer | `frontend-engineer` | `apps/web` — Next.js App Router/RSC, Tailwind/shadcn, TanStack Query, RHF+Zod, with component/Playwright tests |
| Integration Verifier | `integration-verifier` | runs both apps, exercises the slice (curl + browser/Playwright), reports pass/fail vs the DoD |

---

## Traps and Responses

- **"Just scaffold everything at once."** Refuse the big bang. Scaffold P0, then one slice at a time — each verified. Explain that the value (and the green `main`) comes from vertical increments.
- **Backend leaks Prisma into domain/application.** Reject it (Principle 3). Move Prisma to `infra/`; keep application transaction-primitive-free (use a transaction-manager port — see conventions.md).
- **Frontend duplicates a type instead of importing the contract.** Reject it (Principle 2). The type lives in `packages/shared`.
- **Skipping tests "to move faster."** Tests are part of the slice's DoD, not optional. A slice with no tests is not done.
- **Reordering slices to do the "fun" one first.** Surface the dependency (e.g. booking needs listings + auth) and let the user decide, but default to curriculum order.
