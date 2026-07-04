# CLAUDE.md — Harbourstay

Guidance for **Claude Code** working in this repo. Other LLM agents (e.g. Gemini) read [AGENT.md](AGENT.md), which carries the same project rules without the Claude-specific tooling — **keep the two files in sync** when the project facts or invariants change.

---

## What this project is

**Harbourstay** — a full-stack OTA (short-stay accommodation & tour) booking platform, built here with an AI agent's guidance. This repo root **is** the implementation repo: Strategic Design, Tactical Design, and all the code live here (the Turborepo monorepo is scaffolded in-place).

**The primary purpose is teaching Ken to write full-stack code** — backend to frontend; the app is the vehicle. From S2 on, the build runs in **scaffold-and-fill** mode: agents scaffold each slice and write failing tests; **Ken implements the designated core files** (domain models, command/query handlers, key frontend components); agents review his diff (comments, not rewrites) and verify. Never implement Ken's fill files for him — not to fix a test, not for speed. Details: the `fullstack-build` skill §Scaffold-and-Fill. (P0–S1 predate this mode and were agent-written.)

Authoritative product spec: **`prd-harbourstay-booking-platform.md`** (moves to `docs/PRD.md` once scaffolded). It defines the domain, stack (§8), architecture (§7), and milestones (§12).

## Current state

**Lives in [docs/build/PROGRESS.md](docs/build/PROGRESS.md)** — read the *Status at a glance* table and the newest slice block (each ends with a `Next:` line) at the start of any build work. Do **not** record build state in this file; update `PROGRESS.md` instead. This file changes only when the *rules* change (invariants, tooling, process), not when a slice lands.

## How you work here (Claude-specific tooling)

You have two skills and a set of subagents. Use them; don't hand-improvise the build.

```
PRD ──/strategic-design──▶ docs/strategic-design/STRATEGIC.md
    ──(tactical design)──▶ docs/DESIGN.md
    ──/fullstack-build ──▶ the app, one verified vertical slice at a time
```

- **`/strategic-design`** — DDD Strategic Design (Bounded Contexts, Context Map, Ubiquitous Language) via a four-role debate. The *user* decides at every phase.
- **`/fullstack-build`** — builds the app in vertical slices (contract → backend → frontend → verify), driven by [.claude/skills/fullstack-build/references/curriculum.md](.claude/skills/fullstack-build/references/curriculum.md).
- You (main thread) **plan, sequence, and coach**; the subagents (`contract-designer`, `backend-engineer`, `frontend-engineer`, `integration-verifier`) **scaffold, review, and verify**; **Ken writes the fill files**. Agents never decide what comes next, whether a slice is done, or take over Ken's code.
- **Never auto-advance.** Finish a slice, verify it, record it in `docs/build/PROGRESS.md`, then stop for the user's confirmation.

## Non-negotiable invariants

1. **Contract-first.** Request/response types are Zod schemas in `packages/shared` (the Shared Kernel), imported by both apps. No duplicated types.
2. **Backend keeps the hexagon.** `apps/api` domain layer has zero framework/ORM imports; Prisma lives only in `infra/`, behind repository ports; the CQRS read path bypasses the domain.
3. **Every slice runs.** Full working code on both ends — no stubs. Verified by curl **and** browser before it's done.
4. **Tests during the slice** (test pyramid, PRD §13): domain unit (no mocks) → integration (Testcontainers) → Playwright for headline journeys.
5. **Decisions become ADRs** under `adr/` (PRD needs ≥3).

Folder/file naming and layer rules: [.claude/skills/fullstack-build/references/conventions.md](.claude/skills/fullstack-build/references/conventions.md) is authoritative.

## Repo map

```
prd-harbourstay-booking-platform.md   # the PRD (→ docs/PRD.md after scaffold)
CLAUDE.md   AGENT.md                   # guidance for Claude / for other LLM agents
apps/web    apps/api                   # (after P0) Next.js frontend / NestJS backend
packages/shared                        # (after P0) Zod contract types
docs/strategic-design/  docs/DESIGN.md # design outputs
docs/build/PROGRESS.md                 # slice-by-slice build log
adr/                                   # Architecture Decision Records
.claude/skills/  .claude/agents/       # Claude Code tooling (skills + subagents)
```

## Key constraints (from the PRD)

- **Stripe test mode only** — no real money movement (§2 N4). Local webhooks need the Stripe CLI / a tunnel (§14).
- **Scope cut line = P0–S4** (search → reserve → pay-test → confirm). S5–S7 are polish; if time slips, snapshot at S4.
- **Deploy early, stay green.** §12: deploy from P0; `main` always green.
- Out of scope (defend it): multi-tenancy, deep security/compliance, real settlement, native mobile (§2, §6).

When you finish real work, record it in `docs/build/PROGRESS.md` — never here.
