# Harbourstay Build Progress

> Lives at `docs/build/PROGRESS.md`. Updated at the end of every slice. One row per slice; newest note at the bottom of each slice block.
> This file is the **single source of truth for build state** — never record state in CLAUDE.md / AGENT.md; they carry only the rules and point here.

## Status at a glance

| Slice | PRD milestone | State | Working evidence |
|---|---|---|---|
| P0 Scaffold | P0 | ☐ not started / ◐ in progress / ☑ done | local `pnpm dev` / live URLs |
| S1 Listing search & detail | P1 | ☐ | |
| S2 Auth | M1 | ☐ | |
| S3 Availability + Booking Hold | P2 | ☐ | |
| S4 Payment Saga | P3 | ☐ | **cut line** |
| S5 My bookings + cancel | M5 | ☐ | |
| S6 Host dashboard | P4 | ☐ | |
| S7 Hardening | P5 | ☐ | |

Branch: `<current working branch>`.
**Next up: <slice id — title>** (<one line: BC + what it delivers; note the fill-plan focus>).
Deployed: web `<url>` · api `<url>` · db `<provider>`. CI: `<badge/link>`.

---

## <Slice id> — <title>

- **Shipped:** <what now works end-to-end, one or two sentences>
- **BC(s):** <from STRATEGIC.md>
- **Contract added:** `packages/shared/src/contracts/<file>.ts` — <schemas>
- **Backend:** <endpoints, aggregates/handlers touched>
- **Frontend:** <routes/components touched>
- **User implemented (fill plan):** <which files Ken wrote, how many red→green cycles, review must-fix count; or "opt-out recorded: <reason>">
- **Definition of Done:**
  - [ ] contract shared, imported both ends, no duplicate type
  - [ ] `tsc --noEmit` clean
  - [ ] domain has zero framework/ORM imports; query side bypasses domain
  - [ ] tests green (unit / integration / e2e as applicable)
  - [ ] both apps run; feature verified via curl **and** browser
  - [ ] ADR written if a decision was made
- **Verifier result:** PASS / FAIL — <evidence: status codes, screenshots, log lines>
- **ADRs:** <adr/NNNN-*.md if any>
- **Next:** <next slice + any carried-over risk>
