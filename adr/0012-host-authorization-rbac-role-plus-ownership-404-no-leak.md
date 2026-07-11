# ADR-0012: Host authorization — RBAC role check (403) + per-resource ownership (404 no-leak); host writes are guarded state transitions

- **Status:** Accepted
- **Date:** 2026-07-11
- **Slice:** S6a (Host listings CRUD + RBAC)
- **Deciders:** Ken (with Claude Code)

## Context

S6a opens the first **write** surface a non-guest actor drives: a host creates, edits, and
publishes their **own** listings (`POST/PATCH /host/listings`, `.../publish`, `.../unpublish`,
`GET /host/listings[/:id]`). Two authorization questions fall out of that, and they are **not the
same question**:

1. **Is the caller allowed to use the host surface at all?** — a *role* question. Only a `host`
   may touch `/host/*`. This was built and unit-tested back in S2 (`RolesGuard` + `@Roles()`) but
   S6a is its first real use.
2. **May *this* host act on *this* listing?** — a *resource-ownership* question. A host must be
   unable to read or mutate another host's listing, even with a valid host session.

Getting the **status codes** right matters: a careless ownership check leaks information. If a host
requesting someone else's listing gets `403 Forbidden` but a genuinely non-existent id gets
`404 Not Found`, the difference is an oracle — an attacker enumerates which listing ids are real by
watching 403-vs-404. The booking side already settled this (S3/S5: `GET /bookings/:id` and cancel
return `404` for both unknown and not-owned), and host listings must be consistent with it.

Separately, S6a adds the `Listing` **publication state machine** (`Unpublished ⇄ Published`), which
raises the same idempotency question S4 faced for `Payment`: should re-publishing an
already-Published listing be a silent no-op, or an error?

## Decision

**Two independent authorization layers, with deliberately different status codes; and host write
transitions are guarded (not idempotent).**

### 1. Role check → 403, at the guard
`JwtCookieGuard` + `RolesGuard` + `@Roles('host')` on every `/host/*` route. A signed-in **guest**
(or anonymous) is rejected **before** any handler runs: anonymous → **401**, authenticated
non-host → **403**. A 403 here leaks nothing — "this surface is hosts-only" is not a secret, and no
resource id is involved.

### 2. Ownership check → 404 no-leak, in the handler/query
The owning `hostId` comes from the **session** (`@CurrentUser()`), never from the body or params.
Every per-listing operation is scoped to `{ id, hostId }`:
- **Reads** (`GET /host/listings/:id`, and the list) filter by `hostId` in the query `WHERE`
  clause, so a foreign or unknown id both resolve to `null` → `ListingNotFoundException` → **404**.
- **Writes** load the aggregate and, if `listing.hostId !== command.hostId`, throw the same
  `ListingNotFoundException` → **404** — *before* mutating or saving.

A not-owned id and a truly-unknown id return a **byte-identical 404**. Never `403` for a real but
foreign listing: that would confirm the id exists. This mirrors the booking `CancelBookingHandler`
pattern exactly.

**Ownership is an application concern, not a domain invariant.** The `Listing` aggregate assumes its
caller is authorized — it enforces *listing* invariants (title non-empty, `Capacity ≥ 1`,
`basePrice ≥ 0`, valid publication transitions), not *who* is calling. `hostId` is set once at
`create()` and is immutable (no setter; `updateDetails()` never touches it), so ownership cannot be
transferred or spoofed through the edit path.

### 3. Host write transitions are guarded, not idempotent
`publish()` throws `InvalidListingStateException` (→ **409**) if the listing is not currently
`Unpublished`; `unpublish()` throws if not `Published`. This is the **opposite** of the S4
`Payment` decision, and deliberately so: `Payment.markSucceeded()` is idempotent *because Stripe
delivers webhooks at-least-once*, so a duplicate is expected and must be a no-op. A host clicking
"Publish" twice has no such excuse — surfacing the illegal transition catches client bugs (like the
stuck-button defect this slice actually shipped and the verifier caught) instead of hiding them.
Every other state machine in the codebase (`Hold`, `Booking`) throws on an illegal move; `Payment`
is the documented exception, not the rule.

## Alternatives considered

| Option | Why not |
|---|---|
| **403 for not-owned listings** | Leaks existence — 403-vs-404 is an id-enumeration oracle. The no-leak 404 is the established booking-side pattern; consistency matters. |
| **Ownership as a domain invariant** (aggregate rejects a wrong `hostId`) | Pulls an application/authorization concern into the domain; the aggregate would need the *acting* user passed into every method. Ownership is about the caller, not the listing's own consistency. |
| **Trust a `hostId` from the request body/params** | Trivially spoofable — a host could edit any listing by lying about the owner. Identity must come from the authenticated session only. |
| **Idempotent publish/unpublish** (re-publish = no-op) | Hides client bugs; unlike Stripe there's no at-least-once delivery forcing idempotency here. Guarded transitions caught a real UI defect this slice. |

## Consequences

- **Positive:** the two authorization failures are cleanly separated and correctly coded (401/403 for
  role, 404 no-leak for ownership) — verified end-to-end against two live host accounts (foreign-owned
  `GET`/`PATCH`/`publish` and an unknown id return a byte-identical 404). Identity is session-derived
  and unspoofable; ownership is immutable on the aggregate. The guarded publish transition (409)
  keeps the state machine honest and consistent with `Hold`/`Booking`.
- **Trade-offs:** the ownership check costs a load-then-compare on writes (a read that may 404 before
  the transaction) — negligible here, and the alternative (a `DELETE ... WHERE hostId` style blind
  write) would lose the clear domain exception. The single `RolesGuard`/`@Roles('host')` model has no
  notion of finer host permissions (co-hosts, team accounts) — out of scope (PRD §2/§6).
- **Follow-ups:** admin override (an `admin` acting across hosts) if/when an admin console is pursued
  (PRD stretch); host-initiated cancellation and host bookings arrive in S6b with the same
  session-derived-ownership rule.

## Learning-build note

S6 is built in a different mode from S2–S5: Ken **opted out of scaffold-and-fill for this slice to
learn by reading working code** (recorded in `docs/build/PROGRESS.md`). So the `Listing` aggregate,
the command/query handlers, and the frontend (including the `publish-toggle` primer) were all written
by Claude as heavily-commented teaching artifacts, not implemented by Ken. The mode reverts to fill
at S7 unless Ken decides otherwise. One instructive bug survived a static read and was caught only by
booting the stack: the `publish-toggle` left `submitting=true` across `router.refresh()` (which
re-renders but does **not** remount the client component), permanently disabling the button after one
toggle — a live demonstration of why "every slice runs and is verified" is non-negotiable.
