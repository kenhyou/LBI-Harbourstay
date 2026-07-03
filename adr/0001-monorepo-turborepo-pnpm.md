# ADR-0001: Monorepo with Turborepo + pnpm workspaces

- **Status:** Accepted
- **Date:** 2026-07-03
- **Slice:** P0
- **Deciders:** Ken (with Claude Code)

## Context

Harbourstay is a full-stack app with a NestJS API and a Next.js web app that must
share request/response types (PRD §7, Shared Kernel). We need a repository layout
where a contract change fails at **compile time** on both ends, builds are cached and
orchestrated, and one command runs the whole stack. The alternative — two repos with a
published types package — adds a version/publish loop that is pure friction for a solo
learning build.

## Decision

A single **Turborepo + pnpm** workspace at the repo root: `apps/api`, `apps/web`,
`packages/shared` (the Zod contract), `packages/tsconfig` (shared TS configs). Task
running/caching via `turbo.json`; dependency graph via pnpm `workspace:*` links.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Turborepo + pnpm (chosen) | one install, compile-time shared types, task cache, `workspace:*` | monorepo tooling to learn | — |
| Nx | powerful generators, graph | heavier, more opinionated than needed | overkill for 2 apps + 2 packages |
| Two repos + published `@harbourstay/shared` | clean separation | publish/version loop on every contract change | kills the fast contract-first loop |
| npm/yarn workspaces (no Turbo) | simpler | no task caching/orchestration | slower CI, manual build ordering |

## Consequences

- Positive: the shared contract is imported, not published; `pnpm dev` runs both apps;
  turbo builds `shared → apps` in order and caches unchanged tasks.
- Negative / trade-offs: pnpm's strict `node_modules` + native build-script gating
  (Prisma, SWC) needs an explicit `onlyBuiltDependencies` allowlist.
- Follow-ups: keep versions pinned (no `^`) for reproducibility; CI uses
  `pnpm install --frozen-lockfile`.
