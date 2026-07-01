# AGENT.md — Harbourstay

Guidance for **LLM coding agents other than Claude Code** (e.g. Gemini CLI, and any tool that reads `AGENT.md`/`AGENTS.md`). If you are Claude Code, read `CLAUDE.md` instead — it carries the same rules plus Claude-specific tooling. **These two files must stay in sync** on project facts and invariants.

You do **not** have this repo's Claude-specific skills or subagents (those live under `.claude/` and only Claude Code runs them). But the important part — the curriculum and conventions — is plain Markdown you can read and follow directly. Do that; do not improvise your own process.

---

## What this project is

**Harbourstay** — a full-stack OTA (short-stay accommodation & tour) booking platform. This repo root **is** the implementation repo: design docs and all code live here (a Turborepo monorepo, scaffolded in-place).

Authoritative product spec: **`prd-harbourstay-booking-platform.md`** (or `docs/PRD.md` after scaffolding). Read it for the domain, stack (§8), architecture (§7), and milestones (§12).

## Current state

- Exists: the PRD and the reference docs under `.claude/skills/fullstack-build/references/`.
- Not yet (as of writing): the monorepo is not scaffolded; `docs/strategic-design/STRATEGIC.md` and `docs/DESIGN.md` do not exist. Verify on disk before relying on this.

## The process to follow

The build is a **vertical-slice curriculum**: each step ships full working code on both ends and must run before the next begins. The Claude tooling automates it, but the source of truth is plain Markdown you should read:

- **What to build, in what order** → `.claude/skills/fullstack-build/references/curriculum.md` (P0 scaffold, then slices S1–S7 mapped to PRD milestones §12).
- **How to build each slice** → `.claude/skills/fullstack-build/references/slice-recipe.md` (the repeatable rhythm + code skeletons): **contract → backend → frontend → integrate & verify.**
- **Folder/file naming & layer rules** → `.claude/skills/fullstack-build/references/conventions.md` (authoritative).
- **Design inputs** → `docs/strategic-design/STRATEGIC.md` (Bounded Contexts, Context Map, Ubiquitous Language) and `docs/DESIGN.md` (Aggregates, VOs, use cases). If these are missing, do the design first (or ask the user) — do not invent the domain model.

Overall pipeline: `PRD → STRATEGIC.md → DESIGN.md → build slice by slice`.

**Work one slice at a time. Do not auto-advance.** Finish a slice, verify it runs, record it in `docs/build/PROGRESS.md`, then stop for the user.

## Non-negotiable invariants

1. **Contract-first.** Request/response types are Zod schemas in `packages/shared` (the Shared Kernel), imported by **both** `apps/web` and `apps/api`. Never duplicate a contract type on either end.
2. **Backend keeps the hexagon.** `apps/api` domain layer has **zero** framework/ORM imports; Prisma lives only in `infra/`, behind repository ports. The CQRS **read path bypasses the domain** (query handlers project Prisma rows straight into Read Models — no aggregate reconstitution). Ports are `abstract class`. Keep transaction primitives out of `application/`.
3. **Frontend:** Next.js App Router, Server Components by default; client components only for interactivity (React Hook Form + Zod, TanStack Query, Stripe Element). Auth via an **httpOnly cookie**, guarded server-side. Import the shared contract for both types and form validation.
4. **Every slice runs.** Full working code — no stubs, no TODOs. Verify by **running** (curl every endpoint, happy + error paths; drive the UI) — not by assuming.
5. **Tests during the slice** (test pyramid, PRD §13): domain unit tests with **zero mocks** (positive **and** negative per state transition) → integration tests against real Postgres via Testcontainers → Playwright for headline journeys. `tsc --noEmit` is a separate gate from the test run.
6. **Decisions become ADRs** under `adr/` (PRD needs ≥3): why CQRS, why Prisma-behind-a-port, the overbooking mechanism, the Outbox, the Stripe ACL.

## Repo map

```
prd-harbourstay-booking-platform.md   # the PRD (→ docs/PRD.md after scaffold)
CLAUDE.md   AGENT.md                   # guidance for Claude / for other LLM agents
apps/web    apps/api                   # (after P0) Next.js frontend / NestJS backend
packages/shared                        # (after P0) Zod contract types
docs/strategic-design/  docs/DESIGN.md # design outputs
docs/build/PROGRESS.md                 # slice-by-slice build log
adr/                                   # Architecture Decision Records
.claude/                               # Claude-specific tooling; its references/ are readable by you
```

## Key constraints (from the PRD)

- **Stripe test mode only** — no real money movement (§2 N4). Local webhooks need the Stripe CLI / a tunnel (§14).
- **Scope cut line = P0–S4** (search → reserve → pay-test → confirm). S5–S7 are polish; snapshot at S4 if time slips.
- **Deploy early, stay green.** §12: deploy from P0; `main` always green.
- Out of scope (defend it): multi-tenancy, deep security/compliance, real settlement, native mobile (§2, §6).

## Honesty

Report what actually happened: if tests fail, say so with the output; if you could not verify something (e.g. a Stripe webhook without the CLI), say that explicitly rather than claiming it passed. Update `docs/build/PROGRESS.md` and the **Current state** notes when you change things.
