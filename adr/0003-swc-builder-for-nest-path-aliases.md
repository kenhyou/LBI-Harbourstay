# ADR-0003: SWC builder for NestJS to make `@/` path aliases runtime-safe

- **Status:** Accepted
- **Date:** 2026-07-03
- **Slice:** P0
- **Deciders:** Ken (with Claude Code)

## Context

We want clean absolute imports in the API — `@/health/health.module`, and later per-BC
aliases like `@booking/*`, `@inventory/*` ([conventions.md](../.claude/skills/fullstack-build/references/conventions.md)).
TypeScript `paths` satisfy the compiler and editor, but plain `tsc`/`nest build` **do not
rewrite alias paths in the emitted JS**, so `require("@/...")` crashes at runtime. We need
aliases that work identically in dev-watch and in the build without a separate post-step.

## Decision

Build the API with the **SWC** builder (`nest-cli.json` → `"builder": "swc"`) plus a
`.swcrc` that mirrors the tsconfig `paths` (`baseUrl` + `@/*` → `src/*`). SWC resolves the
aliases into correct relative `require`s in both `nest start --watch` and `nest build`.
`typeCheck: true` keeps `tsc` running for type errors alongside SWC's (type-stripping)
compile. Jest maps the same alias via `moduleNameMapper`.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| SWC builder (chosen) | aliases work in dev + build, fast compile, one config | second compiler concept (`.swcrc`) | best fit; SWC is a first-class Nest builder |
| `tsc` + `tsc-alias` post-step | stays on tsc | rewrite step doesn't run in `nest start --watch` → dev breaks | fails the dev-watch requirement |
| `tsconfig-paths/register` at runtime | no build change | prod runs compiled `dist` where src-relative paths don't map cleanly | brittle in production |
| Relative imports only | zero config | noisy `../../..`; no per-BC aliases | poor DX as BCs multiply |

## Consequences

- Positive: `@/*` (and future `@<bc>/*`) resolve at runtime everywhere; SWC compiles the
  API in ~tens of ms.
- Negative / trade-offs: `.swcrc` `paths` must be kept in sync with `tsconfig.json`
  `paths`; SWC strips types, so `typeCheck: true` (or the separate `typecheck` task) is
  the real type gate.
- Follow-ups: when adding per-BC aliases, update **both** `tsconfig.json` and `.swcrc`
  (and Jest `moduleNameMapper`).
