# ADR-0015: Observability — liveness/readiness health split + log redaction as a security control

- **Status:** Accepted
- **Date:** 2026-07-12
- **Slice:** S7b (Hardening — observability)
- **Deciders:** Ken (with Claude Code)

## Context

PRD §13 asks for an observability baseline (structured logging, health checks) as part of hardening.
Two concrete decisions had real trade-offs worth recording:

1. **What should `/health` mean?** The endpoint has existed since P0 returning a static `ok`, and — per
   [docs/DEPLOY.md](../docs/DEPLOY.md) — it is the **ALB health-check target** on AWS: if it fails, ECS
   deregisters and eventually kills the task. So the semantics of `/health` are load-bearing in
   production, not cosmetic.
2. **Structured logs will now capture requests — how do we not leak secrets?** `nestjs-pino`/`pino-http`
   auto-logs each request (with headers). The app carries an httpOnly-cookie JWT session (ADR-0006) and
   Stripe secrets (ADR-0008). Naïve request logging would write `Authorization`, `Cookie`, and any
   `password`/`token`/`clientSecret` straight into the log stream — a credential-exposure vector.

## Decision

### 1. Split liveness from readiness; keep `/health` DB-independent
- **`GET /health` = liveness** — process-up, **does not touch the DB**, response contract unchanged
  (the shared `HealthResponse`). It stays the ALB target *for now*. Rationale: a **transient DB blip must
  not make ECS kill an otherwise-healthy task**. If `/health` queried the DB, a 30-second RDS failover
  would cascade into the ALB deregistering every task and the service going fully dark — turning a brief
  dependency hiccup into an outage.
- **`GET /health/ready` = readiness** — runs `SELECT 1` via Prisma; DB reachable → `200
  {status:'ready',checks:{database:'up'}}`, DB unreachable → **503**. This is the endpoint that answers
  "can this instance actually serve traffic?" and is the **intended ALB target**; repointing the target
  group is a documented follow-up (not changed here to avoid touching live infra in a code slice).
- **Hand-rolled, not `@nestjs/terminus`** — a single `SELECT 1` reads more clearly than pulling in a
  health-indicator framework for one check. Terminus is noted as the seam if more dependencies (Redis,
  external APIs) ever need probing.

### 2. Log redaction as a first-class security control
Configure pino `redact` with an exported `REDACT_PATHS` list, censor `[Redacted]`:
- **Request headers:** `authorization`, `cookie` — redacted before write (pino-http logs the request,
  so these must be scrubbed).
- **Response `set-cookie`:** redacted — and this is **load-bearing, not defence-in-depth**. This app's
  `nestjs-pino` request/response logging *does* emit response headers (verified live: without the redact
  path, the login/refresh `Set-Cookie` carrying the httpOnly JWT would be written in cleartext). The
  redact path is what keeps the session cookie out of the logs.
- **App-log fields by name:** `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`,
  `clientSecret`/`client_secret`, `secret`, `webhookSecret`, Stripe key fields — censored bare and
  one-level-nested, so an accidental `logger.info({ user })` can't spill a hash or token.

Plus a **correlation id**: reuse an inbound `x-request-id` or mint a UUID, echoed on the response header,
so one request is traceable across every log line it produces.

## Alternatives considered

| Option | Why not |
|---|---|
| **Single `/health` that checks the DB** | A DB blip → ALB kills healthy tasks → self-inflicted outage. Liveness must be dependency-free. |
| **No separate readiness endpoint** | Then nothing answers "can I serve?"; the ALB either over-trusts a bare liveness or over-reacts to a DB check. The split is the standard resolution. |
| **`@nestjs/terminus`** | A dependency + abstraction for one `SELECT 1`; deferred until there are multiple/again external dependencies to probe. |
| **Allow-list what to log** instead of redact | Fragile as new fields appear; a deny-list of known-sensitive paths + field names fails safe for the specific secrets this app holds. |
| **Log everything, scrub downstream** | Secrets would still transit and could be retained pre-scrub; redact at the source. |

## Consequences

- **Positive:** production can't be taken down by a transient DB hiccup (liveness is dependency-free),
  yet load balancers/orchestrators have a truthful readiness signal (`/health/ready` → 503 on DB loss,
  proven live + via Testcontainers). Credentials and secrets are kept out of the log stream by construction
  (redaction tested: an `Authorization`/`Cookie` request logs `[Redacted]`, no cleartext). Every request
  is traceable by correlation id. 61 suites / 357 tests green.
- **Trade-offs:** the ALB still points at `/health` (liveness) until the target group is repointed to
  `/health/ready` — a one-line infra follow-up, tracked. Redaction is a **deny-list**: a genuinely new
  secret field name must be added to `REDACT_PATHS` (mitigated by covering the header vectors + the common
  field names, and by not logging response headers). No distributed tracing yet (OTel/Sentry is a marked
  seam, PRD §13 stretch).
- **Follow-ups:** repoint the ALB target group to `/health/ready`; OpenTelemetry traces + a Sentry
  exporter at the noted seam; ship logs to a queryable store (CloudWatch Insights / OpenSearch).

## Learning-build note

Built in the S7 **learn-by-reading** mode (Claude-written, commented). The instructive idea here is that
**two endpoints that both "check health" answer different questions** — "am I alive?" vs "can I serve?" —
and conflating them is how a dependency wobble becomes an outage. And that structured logging is a
security surface, not just an ops nicety: the moment you auto-log requests, redaction is mandatory.
