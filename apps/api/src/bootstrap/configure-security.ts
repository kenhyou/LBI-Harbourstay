import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Applies the cross-cutting HTTP security baseline (S7a) to a Nest app: secure
 * response headers (helmet), a strict CORS allow-list, and removal of the
 * `x-powered-by` fingerprint.
 *
 * Pulled OUT of `main.ts` into a reusable function on purpose: `bootstrap()` runs
 * it against the real app, and the security e2e test runs the SAME function against
 * its test app. That guarantees the tests exercise the real configuration rather
 * than a hand-rolled copy that could drift out of sync.
 *
 * This is presenter/infrastructure concern only — no domain code is touched. It
 * stays out of the hexagon on purpose.
 */
export function configureSecurity(app: INestApplication): void {
  // ── helmet: secure response headers (OWASP A05 "Security Misconfiguration") ──
  // Sets a sensible bundle of defensive headers: `X-Content-Type-Options: nosniff`
  // (no MIME sniffing), `X-Frame-Options: SAMEORIGIN` (clickjacking), a strict
  // `Referrer-Policy`, HSTS (honoured only over HTTPS — behind the ALB in prod),
  // `X-DNS-Prefetch-Control`, and it strips `X-Powered-By`.
  //
  // We DISABLE helmet's Content-Security-Policy here: this process only serves a
  // JSON API + Swagger, and the browser-facing CSP that actually protects users is
  // owned by the WEB app (Next.js, the frontend engineer's parallel S7 work). A CSP
  // emitted by the API would either be pointless (JSON isn't rendered) or would
  // break Swagger UI's inline assets — so it belongs on the web tier, not here.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // ── CORS: only the web origin may call us WITH credentials (the httpOnly cookie) ──
  // Reading the allow-list from env (comma-separated) means prod points at the real
  // web origin while dev keeps `http://localhost:3000`. `CORS_ORIGIN` wins over the
  // older `WEB_ORIGIN` name if both are set.
  //
  // We use an ORIGIN CALLBACK rather than a static string so that:
  //   • an allowed browser origin is REFLECTED back into `Access-Control-Allow-Origin`
  //     (required — you may NOT combine a `*` wildcard with `credentials: true`), and
  //   • a disallowed origin gets NO `Access-Control-Allow-Origin` header at all, so
  //     the browser blocks the response.
  // Requests with no `Origin` header (curl, server-to-server, same-origin, health
  // checks) are allowed through — CORS is a browser protection, not an auth gate.
  const allowList = (process.env.CORS_ORIGIN ?? process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || allowList.includes(origin)) {
        callback(null, true); // reflect this origin into ACAO
      } else {
        callback(null, false); // no ACAO header → browser blocks it
      }
    },
    // Send `Access-Control-Allow-Credentials: true` so the browser will attach and
    // accept our httpOnly access/refresh cookies on cross-origin XHR/fetch.
    credentials: true,
  });

  // ── Remove the framework fingerprint (cheap hardening, defence-in-depth) ──
  // helmet already strips `X-Powered-By`, but we disable it at the Express level too
  // so it's gone even if helmet's option ever changes. Less version info for an
  // attacker to fingerprint.
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as { disable?: (setting: string) => void };
  instance.disable?.('x-powered-by');
}
