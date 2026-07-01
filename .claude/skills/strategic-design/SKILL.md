---
name: strategic-design
description: Learning tool for DDD Strategic Design of the Harbourstay OTA booking platform, including Bounded Context identification, Context Map, Ubiquitous Language, and Subdomain classification through a four-role multi-agent discussion. Use when the user asks to start Strategic Design, derive Bounded Contexts, build a Context Map, define Ubiquitous Language, classify Subdomains, run `/strategic-design`, run `/strategic-design --prd`, or run `/strategic-design <sub-domain>`. Follows a 6-phase workflow: Setup -> Discovery -> Subdomain -> BC Identification -> Context Map -> UL -> Consolidation. Defaults to PRD mode against `prd-harbourstay-booking-platform.md`; Socratic mode explores a narrower sub-domain by answering five questions. Outputs to `docs/strategic-design/` (PRD mode) or `docs/<sub-domain>/strategic-design/` (Socratic mode). Tactical Design such as Aggregates and VOs belongs in DESIGN.md. Core principle: AI presents options; the user decides at every phase.
version: 0.3.0
---

# strategic-design (Harbourstay)

A learning skill for running DDD Strategic Design on the **Harbourstay** OTA stay & tour booking platform through multi-role debate. Four roles -- Domain Expert, Solution Architect, Tech Lead, and Product Owner -- discuss the domain from separate viewpoints. The user makes the final decisions while Strategic Design artifacts accumulate phase by phase.

This project already has a rich PRD at `prd-harbourstay-booking-platform.md`, so **PRD mode is the default path**. Socratic mode exists for exploring a narrower sub-domain (e.g. just Pricing, or a hypothetical tours-first cut) from scratch.

---

## Non-Negotiable Principles

### 1. AI Does Not Decide

- Every phase ends only when the user explicitly decides.
- AI presents options, differences, and debate; the final choice belongs to the user.
- If the user says "just decide for me", force two options plus trade-offs and ask the user to choose.

### 2. Phases Are Not Skipped

- Order is Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6.
- Do not automatically proceed to the next phase.
- The PRD already proposes six candidate BCs (§5.1). This makes Phases 1-2 run in **validation mode** (shortened, not skipped) — the point of the exercise is to pressure-test those candidates, not rubber-stamp them.

### 3. Role Separation Must Be Strong

- Hide other roles' outputs when invoking subagents.
- Do not create weak consensus. Conflict is a learning resource.

### 4. Reflection Is Written by the User

- The reflection section in Phase 6 is not ghostwritten by AI.
- Even a short reflection must be typed by the user.
- In PRD mode, the reflection must include a **"What changed in my thinking"** bullet list comparing `initial-bc-guess.md` (written in Phase 1) to the final BCs in `STRATEGIC.md`. At minimum: which of your own guesses survived, which were merged or split, which were renamed, and — critically — **how your final BCs differ from the PRD's six suggested contexts and why**.

---

## Trigger Clarification

### Use This Skill For

- "Start Strategic Design"
- "Help with strategic design (for Harbourstay)"
- "Let's derive Bounded Contexts"
- "BC split"
- "Build a Context Map"
- "Define Ubiquitous Language"
- "Classify Subdomains"
- `/strategic-design` or `/strategic-design --prd` for PRD mode (default; reads `prd-harbourstay-booking-platform.md`)
- `/strategic-design <sub-domain>` for Socratic mode on a narrower slice (e.g. `pricing`, `tours`)

### Do Not Use This Skill For

- Tactical Design such as Aggregate, VO, or Repository. Those live in `docs/DESIGN.md` (see PRD §5.2-§5.5). Note the PRD *already sketches* Aggregates, the Saga, Outbox, and CQRS — that is Tactical/architecture material and is out of scope here.
- Code implementation. That follows the PRD's phased milestones (§12: P0-P5).
- Short DDD concept questions such as "what is a Bounded Context?" Answer normally without activating the skill.

---

## Entry Procedure

When the user uses a trigger phrase, determine the mode first.

### Mode Detection

- **PRD mode** (default): bare `/strategic-design`, `/strategic-design --prd`, or any trigger that does not name a narrower slice. Reads `prd-harbourstay-booking-platform.md` at the project root.
- **Socratic mode**: the trigger names a sub-domain to explore from scratch (e.g. `/strategic-design pricing`).

### PRD Mode Entry

1. **Read PRD file**
   - Read the PRD. Look in this order: `prd-harbourstay-booking-platform.md` at the project root, then `docs/PRD.md` (PRD §15 copies the PRD there once the repo is scaffolded).
   - If neither exists, stop and tell the user the PRD file was not found.

2. **Parse PRD** (map the actual PRD sections — see the table below)
   - Domain name: **Harbourstay** (from the `# PRD — Harbourstay` heading).
   - Tier: this is an **advanced** full-stack DDD build (per §5, §7).
   - Five discovery answers, extracted from these sections:

     | Discovery answer | PRD source |
     |---|---|
     | Primary / secondary actors | §4 Users & Personas (Guest, Host/Operator, Admin) |
     | Core domain events | §5.2 state machine + §5.3 Saga (e.g. `BookingConfirmed`, `HoldPlaced`, `PaymentSucceeded`, `BookingExpired`, `BookingCancelled`) |
     | Key business KPIs | §3 Success Criteria + §9 NFR (booking success end-to-end, zero double-bookings, search p95 < 500ms) |
     | Differentiation | §1 Background (rich booking domain: overbooking prevention + reliable payment confirmation via Saga/Outbox) |
     | Out of scope | §2 Non-goals (N1-N4) + §6 Won't |

   - Suggested BC candidates: **§5.1** already lists six — Booking (core), Inventory/Availability, Pricing, Payments, Identity & Access, Notifications. **Do not show these to the user before they write their own guess** (see step 6).

3. **Choose output directory**
   - Path: `docs/strategic-design/`.
   - If it exists, ask whether to continue existing work or restart.

4. **Choose learning mode**
   - **Guided**: user decides at every step; recommended.
   - **Observation**: user observes role debate; one extra debate round may be automatic.

5. **Confirm pre-filled discovery**
   - Copy the mapped PRD content into `docs/strategic-design/01-discovery.md`.
   - Show it once and ask whether to proceed or edit.
   - If the user agrees, Phase 0/1 ends.

6. **Initial BC candidates (pre-debate)**
   - **Required before Phase 2 starts.** Ask the user to list their *own* initial Bounded Context guesses: name + one-line responsibility each. Three to six entries is typical.
   - Save the list to `docs/strategic-design/initial-bc-guess.md` with a timestamp.
   - Do not let the user skip this step. If they say "I don't know", ask them to write down even rough guesses — being wrong here is the point. The post-debate reflection compares against this file.
   - **The PRD's §5.1 suggested BCs must not be shown to the user before they write their own guess.** The whole learning value is comparing your independent guess *and* the PRD's version against what survives four-role debate.

7. **Shortened validation mode**
   - Because §5.1 supplies six candidate BCs, run Phases 1 and 2 as **validation** (shortened) — challenge the candidates, do not skip the phases.

### Socratic Mode Entry (narrower sub-domain)

1. **Confirm sub-domain name**
   - Ask which slice of Harbourstay to explore if the user did not say (e.g. `pricing`, `tours`, `reviews`).
   - Agree on a directory-friendly name.

2. **Check existing progress**
   - Check whether `docs/<sub-domain>/strategic-design/` exists.
   - If it exists, ask whether to continue or restart.
   - If it does not exist, start Phase 0.

3. **Choose learning mode**
   - **Guided**: user decides each step.
   - **Observation**: user mainly observes role debate.

4. **Ask about existing BC candidates**
   - If the user already has candidates, run Phases 1 and 2 briefly as validation.

---

## 6-Phase Workflow Summary

See [references/workflow.md](references/workflow.md) for details. Move forward only after each phase's exit condition is met.

| Phase | Content | Agents | Output |
|---|---|---|---|
| 0 | Setup | None | directory + empty STRATEGIC.md skeleton |
| 1 | Domain Discovery | None (PRD-prefilled in PRD mode) | `01-discovery.md` (+ `initial-bc-guess.md`) |
| 2 | Subdomain classification | domain-expert + product-owner | `02-subdomains.md` |
| 3 | BC identification | all four roles + user-led extra rounds | `03-bounded-contexts.md` + `debates/...` |
| 4 | Context Map | solution-architect + tech-lead | `04-context-map.md` |
| 5 | Ubiquitous Language | domain-expert | `05-ubiquitous-language.md` |
| 6 | Consolidation + reflection | None; user writes reflection | consolidated `STRATEGIC.md` |

### Phase 3: BC Identification

1. The skill prepares a briefing from Phase 1 and 2.
2. Invoke four agents concurrently and hide their results from each other. Limit each response to 300 words.
3. Extract only differences between the four outputs and present them to the user.
4. If the user selects a conflict point, invoke another debate round. Do not do this automatically.
5. The user makes the final decision and writes one paragraph explaining the decision.
6. Save raw debate notes under `docs/strategic-design/debates/bc-boundary-{topic}.md` (or the Socratic-mode equivalent).

**Harbourstay tension points worth surfacing in Phase 3** (do not lead the witness — let them emerge, but recognize them):
- **Pricing**: fold into Inventory/Availability, or split out? (PRD §5.1 hedges: "initially folded into Inventory; split out if it grows".)
- **Availability/Hold**: does the overbooking-prevention Hold belong to Inventory or to Booking? The Saga (§5.3) straddles both.
- **Payments ACL boundary**: Stripe is behind an ACL (§5.1) — is Payments its own BC or an adapter of Booking?
- **Notifications**: a genuine BC, or just an Outbox consumer downstream of Booking?

---

## References

| File | Purpose |
|---|---|
| [references/workflow.md](references/workflow.md) | detailed input/procedure/output/exit conditions for each phase |
| [references/role-prompts.md](references/role-prompts.md) | source of truth for the four role prompts |
| [references/socratic-questions.md](references/socratic-questions.md) | questions for Phases 1 and 6 |
| [references/anti-patterns.md](references/anti-patterns.md) | common BC-splitting mistakes and skill responses |
| [references/output-templates/strategic.md](references/output-templates/strategic.md) | full STRATEGIC.md template |
| [references/output-templates/context-map-notation.md](references/output-templates/context-map-notation.md) | nine relationship patterns and Mermaid notation |
| [references/output-templates/ubiquitous-language.md](references/output-templates/ubiquitous-language.md) | UL glossary template |
| [references/examples/harbourstay-walkthrough.md](references/examples/harbourstay-walkthrough.md) | worked Harbourstay example across all six phases |

---

## Agents

Four agents are defined under `.claude/agents/`. Use their `subagent_type` when invoking Task.

| Agent | subagent_type | Phases |
|---|---|---|
| Domain Expert | `domain-expert` | 2, 3, 5 |
| Solution Architect | `solution-architect` | 3, 4 |
| Tech Lead | `tech-lead` | 3, 4 |
| Product Owner | `product-owner` | 2, 3 |

### Agent Invocation Notes

- Do not include other agents' results in the input, especially in Phase 3.
- Specify a response length limit, such as 300 words.
- Provide only summarized outputs from previous phases, not the full context.
- Concurrent invocation is allowed.
- Agents may read the PRD (`prd-harbourstay-booking-platform.md`) for domain facts, but must still argue only from their own role's perspective.

---

## Output Directories

### PRD Mode

```text
docs/strategic-design/
|-- STRATEGIC.md
|-- 01-discovery.md
|-- initial-bc-guess.md
|-- 02-subdomains.md
|-- 03-bounded-contexts.md
|-- 04-context-map.md
|-- 05-ubiquitous-language.md
`-- debates/
    `-- bc-boundary-{topic}.md
```

### Socratic Mode

```text
docs/<sub-domain>/strategic-design/
|-- STRATEGIC.md
|-- 01-discovery.md
|-- 02-subdomains.md
|-- 03-bounded-contexts.md
|-- 04-context-map.md
|-- 05-ubiquitous-language.md
`-- debates/
    `-- bc-boundary-{topic}.md
```

`<sub-domain>` is the slice name agreed in Phase 0.

---

## Common Traps and Responses

### Trap 1: User Asks AI to Decide

Refuse the decision. Present two options with trade-offs and ask the user to choose.

### Trap 2: User Wants to Skip Phases

Offer shortened validation mode, but still run each phase.

### Trap 3: Four Agent Results Are Too Similar

See [references/anti-patterns.md](references/anti-patterns.md). Re-invoke with stronger role-specific prohibitions.

### Trap 4: BC Is Too Large or Too Small

Use Anti-Patterns 3 and 4 in [references/anti-patterns.md](references/anti-patterns.md) to guide the user.

### Trap 5: Rubber-Stamping the PRD's Six BCs

The PRD's §5.1 list is a *hypothesis*, not an answer. If the user simply adopts all six unchanged, push back: ask them to justify each boundary as a language boundary (Anti-Pattern 1) and to defend Pricing-in-vs-out-of Inventory explicitly.

### Trap 6: No Same-Word-Different-Meaning Case in Phase 5

Invoke Domain Expert again and ask whether the BC split is meaningful enough. Harbourstay has good candidates — e.g. does **"Availability"** mean the same thing in Inventory and in Booking? Does **"Guest"** mean a person (Identity) or a party-size count (Booking)? If no such case emerges, reconsider the split.

---

## Handoff

This project's root **is** the implementation repo — Strategic Design, Tactical Design, and the code all live here, not in a separate directory. (PRD §15 was written before that decision; treat "scaffold a fresh repo in a separate directory" as "scaffold the monorepo in this repo".)

After Phase 6:
- `docs/strategic-design/STRATEGIC.md` is complete.
- Suggested next step: start **Tactical Design** in `docs/DESIGN.md` by mapping each confirmed BC to Aggregates. The PRD §5.2-§5.5 already sketches Aggregates (Booking, Listing/Availability, Payment), the BookingCheckoutSaga, the Transactional Outbox, and CQRS read/write split — use STRATEGIC.md to confirm which BC owns each.
- After DESIGN.md, implement **in this repo** following the PRD milestones (§12: P0 Scaffold → P3 Payment Saga cut line → P5 Hardening). Each confirmed BC becomes a module under the NestJS backend (`apps/api`) in the Turborepo monorepo (`apps/web`, `apps/api`, `packages/shared`) described in §7; the STRATEGIC.md Context Map guides how those modules depend on each other.
- Implementation itself is driven by the **`fullstack-build`** skill (`/fullstack-build`), which reads STRATEGIC.md + DESIGN.md and builds the app one verified vertical slice at a time (contract → backend → frontend → verify).