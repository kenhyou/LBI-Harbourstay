# Security Audit — Harbourstay API (S7a, OWASP baseline)

_Date: 2026-07-12 · Scope: `apps/api` HTTP surface · Companion to ADR-0014 (security baseline)._

This is the authorization audit produced during **S7a — Security baseline (OWASP)**.
It walks **every HTTP route** in the API and records, per route: the authentication
guard, the role required, whether an ownership check applies, whether the input is
validated against the shared Zod contract, and a verdict. Deliberately-public routes
(`/health`, `/auth/*`, `/webhooks/stripe`) are called out as intentional.

No new endpoints or domain code were added in S7a — this pass added cross-cutting
defences only (helmet, CORS allow-list, rate limiting, body-size cap, `x-powered-by`
removal).

## Legend

- **Auth (guard)** — `JwtCookieGuard` = authenticated via the httpOnly access cookie;
  `+ RolesGuard` = RBAC on top; `public` = no guard (intentional).
- **Ownership** — "404-no-leak" = the handler/query returns 404 for both an unknown id
  and a resource owned by someone else, so it never reveals another user's data
  (S5/S6a/S6b pattern). "from cookie" = the acting identity is taken from the verified
  session, never from the body/params. "n/a" = no per-resource ownership dimension.
- **Input validation** — the Zod schema (from `@harbourstay/shared`) the body/query is
  parsed with by `ZodValidationPipe`. Path params (`:id`, `:blockId`) are opaque strings
  passed to Prisma as **parameterized** query values (no injection risk); an unknown id
  resolves to 404. They are intentionally not UUID-shape-validated.

## Route table (24 routes across 9 controllers)

| # | Method + Path | Auth (guard) | Role | Ownership | Input validation (Zod?) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `POST /auth/register` | public | — | n/a | ✅ `registerRequest` | OK — public by design; **tighter throttle** (~10/min) |
| 2 | `POST /auth/login` | public | — | n/a | ✅ `loginRequest` | OK — public by design; **tighter throttle** |
| 3 | `POST /auth/refresh` | public (reads refresh cookie) | — | cookie-bound | n/a (no body; validates refresh cookie) | OK — public by design; **tighter throttle** |
| 4 | `GET /auth/me` | `JwtCookieGuard` | any authed | self (returns own user) | n/a (no input) | OK |
| 5 | `GET /listings` | public | — | n/a | ✅ `listingSearchQuery` | OK — public catalog search by design |
| 6 | `GET /listings/:id` | public | — | n/a | ✅ `listingDetailQuery` (`:id` opaque) | OK — read-only, only **Published** returned (404 otherwise). Query now Zod-validated (S7a fix, Note A) |
| 7 | `GET /listings/:id/availability` | public | — | n/a | ✅ `availabilityQuery` (`:id` opaque) | OK — public, indicative availability |
| 8 | `POST /bookings` | `JwtCookieGuard` | any authed | guest id **from cookie** | ✅ `createBookingRequest` | OK |
| 9 | `GET /me/bookings` | `JwtCookieGuard` | any authed | self-scoped query | n/a (no input) | OK |
| 10 | `GET /bookings/:id` | `JwtCookieGuard` | any authed | **404-no-leak** | `:id` opaque | OK |
| 11 | `POST /bookings/:id/cancel` | `JwtCookieGuard` | any authed | **404-no-leak** (in handler) | ✅ `cancelBookingRequest` | OK |
| 12 | `GET /host/bookings` | `JwtCookieGuard + RolesGuard` | `host` | host-scoped query (no param to leak) | n/a (no input) | OK |
| 13 | `POST /bookings/:id/pay` | `JwtCookieGuard` | any authed | **404-no-leak** (ownership in service) | `:id` opaque | OK |
| 14 | `POST /webhooks/stripe` | **public — no guard** | — | n/a | raw body, **Stripe signature verified** in ACL | OK — intentional; see Note B. `@SkipThrottle` |
| 15 | `POST /host/listings` | `JwtCookieGuard + RolesGuard` | `host` | owner set **from cookie** | ✅ `hostListingUpsert` | OK |
| 16 | `GET /host/listings` | `JwtCookieGuard + RolesGuard` | `host` | host-scoped query | n/a (no input) | OK |
| 17 | `GET /host/listings/:id` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** (in query) | `:id` opaque | OK |
| 18 | `PATCH /host/listings/:id` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** (in handler) | ✅ `hostListingUpsert` | OK |
| 19 | `POST /host/listings/:id/publish` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** | `:id` opaque | OK |
| 20 | `POST /host/listings/:id/unpublish` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** | `:id` opaque | OK |
| 21 | `GET /host/listings/:id/blocks` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** | `:id` opaque | OK |
| 22 | `POST /host/listings/:id/blocks` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** | ✅ `availabilityBlockRequest` | OK |
| 23 | `DELETE /host/listings/:id/blocks/:blockId` | `JwtCookieGuard + RolesGuard` | `host` | **404-no-leak** | `:id`/`:blockId` opaque | OK |
| 24 | `GET /health` | public | — | n/a | n/a (no input) | OK — intentional liveness probe. `@SkipThrottle` |

**Result: 24 routes. No route is missing a guard, an ownership check, or input
validation where it needs one.** The three unguarded routes (`/auth/*` beyond `/me`,
`/webhooks/stripe`, `/health`) are intentionally public and documented below. No
route-level authorization gap was found, so **no authz fix was required in S7a**.

## Notes

**Note A — `GET /listings/:id` `from`/`to` query params (route 6). FIXED in S7a.**
These two optional ISO-date strings were previously read raw. They are now parsed by
the shared `listingDetailQuery` Zod schema via `ZodValidationPipe`, so every inbound
query in the API is schema-validated with no asterisk. (It was never a security gap —
the route is read-only, Published-only, and the values reach Prisma as parameterized
inputs — but validating it keeps the "Zod on every input" claim clean.)

**Note B — `POST /webhooks/stripe` is deliberately unguarded (route 14).** Stripe cannot
send our session cookie, so trust comes from **HMAC signature verification over the raw
request body** (`STRIPE_WEBHOOK_SECRET`, checked in the payment ACL), not a Nest guard.
An attacker cannot forge a valid event without the signing secret, and the dedup ledger
makes Stripe's automatic retries idempotent. It also carries `@SkipThrottle` because
Stripe legitimately bursts/retries events — a rate limit would drop real payment
confirmations. This is the correct design; a guard here would be wrong.

## Cross-cutting defences added in S7a (OWASP mapping)

| Control | What | OWASP |
|---|---|---|
| helmet | Secure response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options`, HSTS, `Referrer-Policy`, …). CSP intentionally **off** here — owned by the web tier. | A05 Security Misconfiguration |
| CORS allow-list | Only the configured web origin(s) may call with credentials; disallowed origins get **no** `Access-Control-Allow-Origin`; **never** `*` with credentials. | A05 / A01 |
| Rate limiting | Global ~100/min/IP (`ThrottlerGuard` as `APP_GUARD`); **tighter ~10/min on `/auth/*`**; `/health` + `/webhooks/stripe` opt out. Exceed → 429. | A07 Auth Failures (brute force / credential stuffing) |
| Body-size cap | JSON body limited (default `100kb`), preserving the webhook's raw body. | A05 (cheap DoS hardening) |
| `x-powered-by` off | Framework fingerprint removed (helmet + explicit Express `disable`). | A05 |

## Secrets sweep

- **No secrets are hard-coded.** Stripe keys (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`) and JWT secrets are read from config/env (SSM in prod). A
  scan for `sk_*` / `pk_*` / `whsec_*` literals found **none**. (The S4 Stripe-key
  incident is already documented separately.)
- ✅ **FIXED in S7a — JWT secret dev fallbacks (`identity/infra/adapters/jwt-auth-token.adapter.ts`).**
  `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` previously fell back to the **well-known
  literals** `'dev-access-secret'` / `'dev-refresh-secret'` when the env var was absent —
  dangerous if it ever reached production, since a missing env var would silently boot on
  a public secret and let anyone forge valid session tokens (auth bypass). Now the
  adapter's `requireSecret` helper **fails fast**: when `NODE_ENV === 'production'` and
  either secret is unset it **throws at construction**, so the service refuses to boot
  rather than running on a forgeable default. The friendly dev fallback is kept only for
  non-production (local runs / unit tests). Covered by new unit tests (missing-in-prod →
  throws; present-in-prod → constructs; non-prod → dev fallback works). Worth a line in
  ADR-0014.

## Input-validation summary

Every request **body** is parsed with its shared Zod schema via `ZodValidationPipe`
(routes 1, 2, 8, 11, 15, 18, 22). Every request **query** is Zod-validated too — search
(5), listing detail (6, `listingDetailQuery` — added in S7a), and availability (7). No
unvalidated input remains. Path params are opaque, parameterized Prisma inputs and
intentionally not shape-validated (an unknown id resolves to 404; no injection risk).
