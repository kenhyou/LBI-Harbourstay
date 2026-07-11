import type { ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';

/**
 * Rate-limiting policy for the whole API (OWASP A04 "Insecure Design" / brute-force
 * & credential-stuffing resistance, part of the S7a security baseline).
 *
 * There are TWO tiers:
 *
 *   1. A GLOBAL default (this file's `throttlerRootOptions`) applied to EVERY route
 *      by the `ThrottlerGuard` registered as an `APP_GUARD` in `AppModule`. This is
 *      the coarse "nobody hammers us" limit — generous enough that a normal browser
 *      session never notices it (~100 requests / minute / IP).
 *
 *   2. A TIGHTER per-route override for the auth endpoints (`AUTH_THROTTLE`, applied
 *      with `@Throttle(...)` on `AuthController`). Login / register / refresh are the
 *      classic brute-force and credential-stuffing targets, so they get ~10/min/IP.
 *      Exceeding either tier returns HTTP 429 (Too Many Requests) BEFORE the handler
 *      — and, importantly, before the DB is touched.
 *
 * All four numbers are env-overridable so ops can tune them per-environment (and so
 * tests can assert the behaviour) without a code change — 12-factor config. The
 * defaults below are the production-sane values.
 *
 * NOTE for the ADR / future work: the default `ThrottlerStorage` is IN-MEMORY, so on
 * a multi-task ECS deployment each task counts independently (effective limit ≈
 * limit × task-count). That is acceptable for this baseline; a shared Redis storage
 * (`ThrottlerStorageRedisService`) is the upgrade path when we scale out or need a
 * strict global limit. Recorded for ADR-0014.
 */

/** Parse an env var as a positive integer, falling back to `fallback`. */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Global default: 100 requests per 60s window, per client IP. */
export function throttlerRootOptions(): ThrottlerModuleOptions {
  return [
    {
      // The `default` throttler — the name the `@Throttle({ default: ... })`
      // overrides key off of. `ttl` is in MILLISECONDS in throttler v6.
      name: 'default',
      ttl: intFromEnv('THROTTLE_DEFAULT_TTL_SEC', 60) * 1000,
      limit: intFromEnv('THROTTLE_DEFAULT_LIMIT', 100),
    },
  ];
}

/**
 * Tighter override for the auth endpoints. Shaped as `{ default: { ... } }` so it
 * overrides the `default` throttler defined above. Applied via
 * `@Throttle(AUTH_THROTTLE)` on `AuthController`.
 */
export const AUTH_THROTTLE: Record<string, Omit<ThrottlerOptions, 'name'>> = {
  default: {
    ttl: intFromEnv('THROTTLE_AUTH_TTL_SEC', 60) * 1000,
    limit: intFromEnv('THROTTLE_AUTH_LIMIT', 10),
  },
};
