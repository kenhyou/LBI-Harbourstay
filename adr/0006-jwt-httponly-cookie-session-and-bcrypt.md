# ADR-0006: Session is a JWT access+refresh pair in httpOnly cookies; passwords hashed with bcrypt (cost 12)

- **Status:** Accepted
- **Date:** 2026-07-04
- **Slice:** S2 (Authentication & Roles, BC-7 Identity & Access)
- **Deciders:** Ken (with Claude Code)

## Context

S2 introduces authentication. Three coupled choices had to be pinned before the slice's
handlers, guards, and the frontend session helper are built: (1) **where the session token
lives** in the browser, (2) the **token model** (single vs access/refresh), and (3) **how
passwords are stored**. The PRD (§8) already names "JWT (access+refresh, httpOnly cookie)"
as the stack intent; this ADR records the concrete parameters and the reasoning so later
slices (host RBAC S6, protected booking flows S3–S4) inherit a settled contract.

The domain must stay framework-free (CLAUDE.md invariant 2): hashing and token signing are
**infra** concerns behind ports (`PasswordHasherPort`, `AuthTokenPort`), never in the `User`
aggregate.

## Decision

1. **Transport: httpOnly cookies.** The access and refresh JWTs are set as `httpOnly`,
   `sameSite=lax`, `path=/` cookies (`secure` in production; off on localhost http).
   They are never returned in the JSON body and never readable by JS. The API reads them
   server-side via `cookie-parser`; the response body carries only the SAFE `AuthUser`
   (`{id, email, role}`) — `passwordHash` never leaves the DB (the read projection
   `select`s only safe columns).
2. **Token model: access + refresh, separate secrets + a `typ` claim.** Short-lived access
   token (15m) and long-lived refresh token (7d), each signed with its **own** secret and
   stamped `typ: 'access' | 'refresh'`. Verification rejects a token presented as the wrong
   kind, so an access token can never be replayed at `/auth/refresh` and vice-versa.
   `/auth/refresh` rotates a fresh pair.
3. **Password hashing: bcrypt, cost factor 12.** A sane 2026 default balancing brute-force
   resistance against login latency (~200–300ms/hash). Bcrypt auto-salts; equal passwords
   produce different digests. The digest is opaque to the domain — the `User` aggregate
   receives an already-computed hash string and never hashes or compares.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| httpOnly cookie (chosen) | not XSS-readable; browser attaches it automatically; server-guarded | needs CSRF care (mitigated by `sameSite=lax` + no cross-site state-changing GETs) | standard for server-rendered/RSC apps; matches the Next.js server-side session model (conventions §Auth) |
| `localStorage` bearer token | trivial client wiring | readable by any injected script (XSS → token theft) | unacceptable for a credential store |
| Single long-lived JWT (no refresh) | simplest | can't revoke/rotate; long exposure if leaked | refresh gives short access-token exposure with a re-auth path |
| Shared secret for both tokens | one env var | a leaked access token could be replayed as refresh | separate secrets + `typ` close cross-kind replay cheaply |
| argon2id hashing | memory-hard, modern | native build heavier in CI; bcrypt is sufficient at this scope | bcrypt cost 12 is adequate for the MVP (PRD §6 defers deep security) |
| bcrypt cost 10 / 14 | faster / stronger | 10 weaker vs modern GPUs; 14 adds noticeable login latency | 12 is the balanced middle |

## Consequences

- Positive: no token in JS reach; short access-token blast radius; one settled session
  contract for S3–S6; hashing/signing isolated behind ports (swappable, domain stays pure).
- Negative / trade-offs: cookie auth needs CSRF discipline as state-changing routes grow
  (revisit if non-`lax` flows appear); refresh rotation without server-side revocation means
  a stolen refresh token is valid until expiry (acceptable at MVP scope; a denylist/rotation
  store is the future upgrade). bcrypt's native binding must be built in CI (added to
  `pnpm.onlyBuiltDependencies`).
- Follow-ups: secrets come from env (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`) — dev defaults exist but **must** be set in any
  deployed environment. S6 host RBAC reuses `RolesGuard` + `@Roles()`. A logout endpoint
  (clear cookies) and refresh-token rotation/denylist are candidate hardening if pursued.
```
