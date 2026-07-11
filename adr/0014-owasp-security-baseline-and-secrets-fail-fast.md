# ADR-0014: OWASP security baseline (helmet, CORS allow-list, rate limiting) + secrets fail-fast

- **Status:** Accepted
- **Date:** 2026-07-12
- **Slice:** S7a (Hardening — security baseline)
- **Deciders:** Ken (with Claude Code)

## Context

PRD §9 asks for an **OWASP Top-10 baseline**, explicitly *breadth over depth* (deep security is
out of scope, PRD §2/§6). Through S6 the app grew its full guest and host surface — 24 routes, an
httpOnly-cookie JWT session (ADR-0006), Stripe webhooks (ADR-0008) — but had **no** transport-level
hardening: no security headers, no rate limiting, permissive CORS, and (found during this slice's
audit) a JWT adapter that fell back to **well-known literal secrets** when its env vars were unset.

S7 is the hardening slice: no new domain, no new endpoints. The job is to add the standard baseline
correctly, audit that authorization actually holds across every route, and close what the audit finds.

## Decision

**Add a cross-cutting security baseline at the framework edge (never in the domain), and make the
service refuse to run on unsafe secrets.**

### 1. Security headers — split by tier
- **API (`helmet`)** in a reusable `configureSecurity(app)` at bootstrap: `nosniff`, `X-Frame-Options`,
  HSTS, COOP, `x-powered-by` removed, etc. **CSP is deliberately *off* on the API** — it protects
  browser documents, and the API serves JSON.
- **Web (Next.js `headers()`)**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a minimal `Permissions-Policy`, and HSTS on all
  routes. **A strict CSP is deferred, documented-not-shipped** — a wrong CSP silently breaks the Stripe
  Payment Element, so a commented scaffold in `next.config.ts` records exactly which sources a real CSP
  must allow (Stripe js/api/frames, self, image origins) and the report-only rollout path. `X-Frame-
  Options: DENY` is safe for checkout: it governs *us being framed*, not *us embedding Stripe's iframe*.

### 2. CORS — credentialed allow-list, never wildcard
`enableCors` with an **origin-callback allow-list** read from `CORS_ORIGIN`/`WEB_ORIGIN` (dev default
`http://localhost:3000`) and `credentials: true` so the httpOnly cookie flow works. A disallowed origin
gets **no** `Access-Control-Allow-Origin` at all. The callback form (not a static string) is chosen so
the policy supports a multi-origin list and provably never emits `*`-with-credentials (which browsers
forbid and which would defeat the cookie model).

### 3. Rate limiting — tiered, env-tunable
`@nestjs/throttler` as a global `APP_GUARD`: a default (~100/min/IP) plus a **tighter ~10/min tier on
`/auth/*`** (login/register/refresh) to resist credential stuffing/brute force → **429**. `/health`
and `/webhooks/stripe` **skip** throttling — the webhook is legitimately bursty and Stripe retries
at-least-once (ADR-0008/0009), and it is authenticated by **signature**, not a limiter. All limits are
env-tunable. The guard runs before the JWT guard, so a 429 precedes auth work.

### 4. Secrets fail-fast — refuse to boot on a default
The JWT adapter no longer falls back to literal `'dev-access-secret'`/`'dev-refresh-secret'` in
production. A `requireSecret` helper **throws at construction** when `NODE_ENV === 'production'` and
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` is unset — the service **exits rather than serve** on a
forgeable, publicly-known secret (which would let anyone mint a valid session). A friendly fallback
remains for local/dev + tests only. This is the one **real vulnerability** the authorization audit
surfaced; it is fixed, not deferred.

### 5. The authorization audit is a durable artifact
`docs/security-audit.md` tabulates **every route × guard × role × ownership × input-validation** with a
verdict. It found **no route-level access-control gap** — every host route stacks
`JwtCookieGuard + RolesGuard('host')`, every owned resource uses the S5/S6 **404-no-leak** ownership
pattern, and the three public routes (`/auth/*`, `/webhooks/stripe`, `/health`) are intentional and
documented. The one input-validation asterisk (`GET /listings/:id` `from`/`to`) was closed with a Zod
schema, so "every inbound request is validated" now holds without exception.

## Alternatives considered

| Option | Why not |
|---|---|
| **CORS `origin: true` / reflect any origin** | Reflecting arbitrary origins with `credentials:true` exposes the cookie session to any site. An explicit allow-list is the only safe credentialed CORS. |
| **Ship a strict CSP now** | High risk of silently breaking the Stripe Element; needs report-only telemetry first. Deferred with a documented scaffold rather than shipped half-right. |
| **Keep the dev secret fallback everywhere** | A prod deploy that forgets the secret would boot on a public default — a silent auth-bypass. Fail-fast turns a latent vuln into a loud startup error. |
| **Throttle everything uniformly (incl. the webhook)** | Would drop legitimate Stripe retry bursts and could lose a `payment_intent.succeeded`. The webhook is signature-authenticated; skip it. |
| **Redis-backed throttler now** | In-memory is per-task (see trade-off below); Redis is the scale-out upgrade, not needed at 1 task. Deferred. |

## Consequences

- **Positive:** the transport baseline is in place and **proven at runtime** (not just configured):
  login 429s past the limit with `Retry-After` while `/health` stays open; a disallowed origin gets no
  ACAO; a >100kb body → 413; `x-powered-by` gone; the production boot **exits code 1** on a missing JWT
  secret. Authorization was audited end-to-end and holds. 57 suites / 345 tests green.
- **Trade-offs / limits:** throttler storage is **in-memory → per-ECS-task** counting; with >1 task the
  effective limit multiplies by task count (Redis storage is the documented upgrade). HSTS `preload` is
  effectively irreversible once submitted — a conscious step before submitting the domain. CSP is not
  yet enforced. Depth (pen-testing, WAF, account lockout, MFA) is explicitly out of scope (PRD §9).
- **Follow-ups:** enforce CSP via report-only → widen → enforce; Redis-backed throttling when scaling
  past one task; consider account-level lockout on repeated auth failures; move the remaining runtime
  secrets behind the same fail-fast discipline.

## Learning-build note

Built in the S7 **learn-by-reading** mode (Claude-written, commented). The reading centerpiece is
`docs/security-audit.md` — a single table that makes the whole app's access-control model legible at a
glance, which is worth more to a learner than any one config line. The slice's most instructive moment
was the audit finding a *real* vulnerability (the default JWT secret) that all the green tests had
happily run on — a reminder that a passing suite proves behavior, not safety.
