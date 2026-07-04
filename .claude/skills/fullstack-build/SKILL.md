---
name: fullstack-build
description: Step-by-step, vertical-slice curriculum for building the Harbourstay full-stack OTA booking app (Next.js + NestJS + Prisma/Postgres + Stripe, Turborepo monorepo) — as a LEARNING build in scaffold-and-fill mode; agents scaffold each slice and THE USER implements the designated core files (domain, handlers, key components), then agents review and verify. Each step ("slice") ends as FULL WORKING CODE on both ends — shared contract, backend (DDD/CQRS), frontend (App Router/RSC), tests — verified to run end-to-end before moving on. Driven by the Strategic Design (`docs/strategic-design/STRATEGIC.md`) and Tactical Design (`docs/DESIGN.md`) documents and PRD milestones §12. Use when the user asks to build/implement the app, scaffold the monorepo, start P0, implement a BC or feature, do the next slice/step, run `/fullstack-build`, or continue the build. Uses four agents: contract-designer, backend-engineer, frontend-engineer, integration-verifier. Core principles: one vertical slice at a time, every slice runs and is verified; the user writes the core. Does NOT do Strategic/Tactical Design — that is the strategic-design skill and DESIGN.md.
version: 0.2.0
---

# fullstack-build (Harbourstay)

A curriculum skill that builds the **Harbourstay** OTA booking platform one **vertical slice** at a time. Unlike a horizontal, layer-by-layer build, every slice cuts through the whole stack — shared contract → backend → frontend → verified end-to-end — so the app is runnable and demoable after every step.

**This is a learning build.** The project's primary purpose is teaching the user to write full-stack code; the app is the vehicle, not the destination. The skill runs in **scaffold-and-fill** mode: agents scaffold each slice (contract, wiring, infra, failing tests) and **the user implements the designated core files** — see *Scaffold-and-Fill: who writes what* below. Speed is never a reason to take the user's code away from them.

The build is driven by three documents (produced earlier):
1. **PRD** — `prd-harbourstay-booking-platform.md` (root) or `docs/PRD.md`. Milestones §12, stack §8, architecture §7.
2. **Strategic Design** — `docs/strategic-design/STRATEGIC.md` (Bounded Contexts, Context Map, Ubiquitous Language). From the `strategic-design` skill.
3. **Tactical Design** — `docs/DESIGN.md` (Aggregates, VOs, use cases, events per BC).

This project's root **is** the implementation repo — the Turborepo monorepo (`apps/web`, `apps/api`, `packages/shared`) is scaffolded here.

---

## Non-Negotiable Principles

### 0. The User Writes the Core (scaffold-and-fill)

- Agents scaffold; **the user implements the fill files** (domain models, VOs, command/query handlers, designated frontend components). An agent must **never** implement a fill file — not to go faster, not to make a test pass, not while fixing review findings.
- The main thread **coaches** while the user codes (explain → point at a similar file → pseudocode, in that order); it writes fill-file code only on the user's explicit request, and records that opt-out in `docs/build/PROGRESS.md`.
- Everything *outside* the fill files is still full working code — agents never leave their own TODOs.

### 1. One Vertical Slice at a Time — and It Must Run

- A slice is done only when its **Definition of Done** (see below) is met: types clean, tests green, both apps run, the feature works end-to-end (curl + browser).
- The only permitted "unfinished" state is the **fill stubs** while the user is implementing them (the red→green step); a slice is never **recorded done** half-wired, and no code is ever left "as an exercise" *beyond the agreed fill plan*.
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

## Scaffold-and-Fill: who writes what

Default ownership split per slice (the Brief step may reassign — see *fill plan* below):

| Part | Who | Notes |
|---|---|---|
| `packages/shared` contract | agent (`contract-designer`) | the contract is the **spec** the user codes against |
| Prisma schema, migrations, seed | agent | |
| Ports (abstract classes), command/query data containers, module wiring | agent | the shapes the user's code plugs into |
| Presenters (controllers), pipes, mappers | agent | reassign to the user when a slice's learning goal is there |
| **Tests** | agent | authored **complete and failing (red)** for everything a fill file must satisfy — they are the user's executable spec |
| `domain/` — aggregates, VOs, domain services, exceptions | **USER** | the heart of the DDD learning goal |
| `application/` — command & query **handlers** | **USER** | orchestration; the CQRS learning goal |
| Frontend: designated client components / page logic | **USER** | the brief names which (e.g. the search form, the calendar, the Stripe element) |
| Frontend: API clients, loading/error states, Playwright specs | agent | reassignable like presenters |

**Mechanics:**

1. **Fill plan.** The Brief ends with a table of the slice's files marked `SCAFFOLD` or `YOU`, plus the acceptance signal (*which* tests must go green). The user confirms — they may pull more onto their plate or hand some back. No agent is spawned before the fill plan is confirmed.
2. **Compiling stubs.** Engineers create each fill file with full typed signatures and `// TODO(you): …` bodies that `throw new Error('TODO(you): implement')` — so `tsc --noEmit` passes on the skeleton while the fill tests are red.
3. **You code.** The user implements until the designated tests are green. The main thread coaches (concept → pointer to a similar existing file → pseudocode, escalating only on request) and helps debug, but does not write fill-file code.
4. **Review.** When green, the responsible engineer reviews the user's diff like a senior reviewer — **must-fix vs nit, with reasons, no rewrites**. The user applies the fixes themselves. Then the verifier runs.

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

1. **Brief + fill plan** — read the slice's row in `curriculum.md`, the relevant BC in STRATEGIC.md, and its Aggregates/use-cases in DESIGN.md. State the slice's goal and Definition of Done, walk the user through the design, and agree the **fill plan** (which files are theirs). Confirm before spawning agents.
2. **Contract** (`contract-designer`) — add the Zod schemas + types to `packages/shared`.
3. **Skeleton** (`backend-engineer` ∥ `frontend-engineer`) — scaffold everything *around* the fill files: infra, wiring, presenters, states, and the **complete, failing tests** for the fill files, which themselves become compiling `TODO(you)` stubs. Respect the hexagon and read-bypass.
4. **You code** — the user implements the fill files until the designated tests are green; the main thread coaches (never writes fill code uninvited).
5. **Review** — each engineer reviews the user's diff in its own app (must-fix vs nit, no rewrites); the user applies fixes.
6. **Integrate & verify** (`integration-verifier`) — run both apps, exercise the slice with curl and a browser/Playwright pass, check every Definition-of-Done box. Report pass/fail.
7. **Record** — update `docs/build/PROGRESS.md`, **including what the user implemented**; write an ADR if a decision was made; note the working state. Then stop and let the user confirm before the next slice.

**Do not auto-advance to the next slice.** Finish, verify, record, and wait — same discipline as the design skill.

### Agent orchestration notes

- `contract-designer` runs first each slice and its output (the shared types) is the contract both engineers code against — pass it to both.
- `backend-engineer` and `frontend-engineer` scaffold **concurrently** once the contract is fixed. Pass each one the confirmed fill plan — they must know exactly which files to stub, not implement.
- After the user's fill code is green, resume each engineer (SendMessage) for the review pass; the verifier runs only after both reviews' must-fix items are resolved.
- Give each engineer only what it needs: the slice brief, the fill plan, the contract, the relevant BC/Aggregate sections, and [references/conventions.md](references/conventions.md). Do not dump the whole PRD.
- If the verifier fails a slice, feed the failure back to the responsible layer. If the failure is in a fill file, it goes back to the **user** with coaching — not to an agent.

---

## Definition of Done (every slice)

A slice is complete only when **all** hold:

- [ ] `packages/shared` contract added; both apps import it; no duplicated type.
- [ ] `pnpm -w typecheck` (or `tsc --noEmit` in each package) passes.
- [ ] Backend: domain has zero framework/ORM imports; Prisma only in `infra/`; query side bypasses the domain.
- [ ] Tests green at the layers this slice touches (domain unit; integration via Testcontainers where infra changed; Playwright for a headline journey where UI changed).
- [ ] Both apps start (`pnpm dev`) and the feature works end-to-end — verified by curl **and** in the browser.
- [ ] The fill files were implemented **by the user** (or an explicit opt-out is recorded); an engineer review of the user's code happened and its must-fix items are resolved.
- [ ] `docs/build/PROGRESS.md` updated (including what the user implemented); ADR added if a decision was made.

Phase 0 has its own DoD (see curriculum.md): both apps deployed to public URLs with a green CI badge is the PRD's P0 bar, though a local docker-compose run is acceptable to unblock and deploy can follow.

---

## References & Agents

| File | Purpose |
|---|---|
| [references/curriculum.md](references/curriculum.md) | full per-slice detail: goal, BC, backend + frontend substeps, tests, DoD |
| [references/slice-recipe.md](references/slice-recipe.md) | the repeatable contract→skeleton→you-code→review→verify rhythm, with code skeletons |
| [references/conventions.md](references/conventions.md) | authoritative folder/file naming for the monorepo (Prisma + Next.js) |
| [references/templates/progress.md](references/templates/progress.md) | `docs/build/PROGRESS.md` template |
| [references/templates/adr.md](references/templates/adr.md) | ADR template for `adr/` |

| Agent | subagent_type | Role |
|---|---|---|
| Contract Designer | `contract-designer` | owns `packages/shared` — Zod schemas + inferred types, the single source of truth both ends import |
| Backend Engineer | `backend-engineer` | `apps/api` — scaffolds the slice (infra, wiring, presenters, failing tests, `TODO(you)` stubs) around the user's fill files, then reviews the user's diff. NestJS DDD/CQRS/Prisma, hexagonal |
| Frontend Engineer | `frontend-engineer` | `apps/web` — scaffolds (API client, states, Playwright, stubs) around the user's fill components, then reviews the user's diff. Next.js App Router/RSC, Tailwind/shadcn, TanStack Query, RHF+Zod |
| Integration Verifier | `integration-verifier` | runs both apps, exercises the slice (curl + browser/Playwright), reports pass/fail vs the DoD |

---

## Traps and Responses

- **"Just scaffold everything at once."** Refuse the big bang. Scaffold P0, then one slice at a time — each verified. Explain that the value (and the green `main`) comes from vertical increments.
- **Backend leaks Prisma into domain/application.** Reject it (Principle 3). Move Prisma to `infra/`; keep application transaction-primitive-free (use a transaction-manager port — see conventions.md).
- **Frontend duplicates a type instead of importing the contract.** Reject it (Principle 2). The type lives in `packages/shared`.
- **Skipping tests "to move faster."** Tests are part of the slice's DoD, not optional. A slice with no tests is not done.
- **Reordering slices to do the "fun" one first.** Surface the dependency (e.g. booking needs listings + auth) and let the user decide, but default to curriculum order.
- **An agent "helpfully" implements a fill file** (to fix a red test, during review, or to speed up). Revert it and re-stub; the fill files belong to the user (Principle 0). Review comments describe the fix — they don't apply it.
- **The user asks the main thread to just write the fill code.** Coach first: explain the concept, point at a similar existing file, then pseudocode. If they still want it written, write it — the user decides — but record the opt-out in `PROGRESS.md`, and the next slice defaults back to fill mode.
- **The fill plan quietly shrinks to nothing.** If several consecutive slices end with the user having written little, say so plainly at the Brief and propose a meatier fill plan — the build's purpose is the user's learning, not agent throughput.
