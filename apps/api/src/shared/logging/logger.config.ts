import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';

/**
 * S7b — Structured logging configuration (the security-adjacent core of this slice).
 *
 * `nestjs-pino` has been wired since P0; this module HARDENS it into a
 * production-grade, safe-to-log setup. It is pulled out of `app.module.ts` into a
 * plain function so a test can build the SAME options and prove redaction works
 * (see `logger.redaction.spec.ts`) — the config the server runs is the config the
 * test asserts, so the two can't drift.
 *
 * Three things happen here:
 *   1. Transport — pretty, human-readable lines in dev; raw JSON (one object per
 *      line) in production so a log shipper / CloudWatch can parse it.
 *   2. Correlation id — every log line carries a request id, echoed back on the
 *      response header so a single request is traceable end to end.
 *   3. Redaction — sensitive fields (auth headers, cookies, passwords, tokens,
 *      Stripe secrets) are replaced with `[Redacted]` before anything is written,
 *      so credentials can never leak into the logs.
 *
 * NOTE (out of scope this slice): an OpenTelemetry tracer / Sentry exporter would
 * plug in around here — pino can feed a transport that forwards to an OTLP
 * collector, and `genReqId` below is exactly the correlation id a span would carry.
 * PRD §13 marks tracing as a stretch goal; we deliberately do NOT add the
 * dependency now, only mark the seam.
 */

/**
 * The name of the header we use to carry a correlation id in and out of the API.
 * `x-request-id` is the de-facto standard (ALBs, proxies, and many clients already
 * speak it), so honouring an inbound one lets a caller stitch our logs to theirs.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Fields that must NEVER reach the logs. pino applies these paths to the final
 * serialized object and swaps the value for the censor string (`[Redacted]` by
 * default) — the shape of the log is preserved, but the secret is gone.
 *
 * Path syntax notes:
 *   • `req.headers.authorization` targets the auto-logged request object (pino-http
 *     serializes the request, headers included) — this is where a `Bearer <jwt>`
 *     or Basic credential would otherwise land.
 *   • `res.headers["set-cookie"]` uses bracket syntax because the key contains a
 *     hyphen — this is where our httpOnly session cookie is set on login/refresh.
 *   • A bare key (`password`) redacts it at the top level of a logged object; the
 *     `*.` variant redacts it one level deep (e.g. `logger.info({ user: { password }})`).
 *     Between the two we cover the shapes we actually log app-side.
 *
 * Exported so the redaction test can assert against the exact same list.
 */
export const REDACT_PATHS: string[] = [
  // ── HTTP credentials carried on the request (auth: login / me / any Bearer call) ──
  'req.headers.authorization',
  'req.headers.cookie',
  // ── The session cookie we set on the response (login / register / refresh) ──
  'res.headers["set-cookie"]',
  // ── Passwords — the register/login bodies and any user projection ──
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  // ── Bearer / refresh / CSRF-style tokens anywhere in a logged payload ──
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  // ── Stripe: the PaymentIntent client secret and any secret/api-key field ──
  'clientSecret',
  '*.clientSecret',
  'client_secret',
  '*.client_secret',
  'secret',
  '*.secret',
  'webhookSecret',
  '*.webhookSecret',
  'stripeSecretKey',
  '*.stripeSecretKey',
  'apiKey',
  '*.apiKey',
];

/**
 * Generate (or reuse) the per-request correlation id AND echo it on the response.
 *
 * If the caller already sent an `x-request-id` we honour it (so their logs and ours
 * share a key); otherwise we mint a UUID. Either way we set it back on the response
 * header — so a client, a proxy, or an on-call engineer can copy the id off a
 * response and grep every log line for that one request.
 *
 * `genReqId` runs before the handler, while the response is still open, so
 * `res.setHeader` is safe here.
 */
function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Build the `pino-http` options the LoggerModule runs with.
 *
 * Gated on `NODE_ENV`: in production `transport` is left undefined so pino writes
 * raw JSON to stdout (fast, and machine-parseable by the log platform). In dev we
 * route through `pino-pretty` for readable, single-line, colourised output.
 */
export function buildPinoHttpOptions(): Options {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    // The correlation id (see above). pino-http stamps it on every line as `reqId`
    // and includes it in the serialized `req`, so all logs for one request share it.
    genReqId,

    // Security: strip secrets before anything is written. This is the key win of the
    // slice — it applies to the auto request/response logs AND to any app-level log
    // that happens to include one of these fields.
    redact: {
      paths: REDACT_PATHS,
      // `censor` defaults to '[Redacted]'; we state it explicitly so the intent — and
      // the string our test asserts on — is obvious at the call site.
      censor: '[Redacted]',
    },

    // Pretty in dev, JSON in prod.
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
  };
}
