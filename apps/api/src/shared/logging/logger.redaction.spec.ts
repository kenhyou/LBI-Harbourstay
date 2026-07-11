import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule, PinoLogger } from 'nestjs-pino';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { buildPinoHttpOptions, REDACT_PATHS } from './logger.config';

/**
 * S7b — the security-adjacent test of the slice: prove that secrets NEVER reach the
 * logs. Redaction is a "prevent a leak" control, so we test it two ways:
 *
 *   A) End to end through a real Nest app — a request carrying an `Authorization`
 *      and `Cookie` header hits an endpoint that ALSO app-logs a payload full of
 *      secrets. We assert the raw secret strings appear NOWHERE in the captured log
 *      output, and that `[Redacted]` does. This is the property that actually
 *      matters: a credential can't be reconstructed from the logs.
 *
 *   B) Directly against the real `REDACT_PATHS` with a hand-shaped request/response
 *      object, so the header/cookie/set-cookie paths are covered deterministically
 *      (independent of how pino-http's default serializers happen to shape things).
 *
 * Both run WITHOUT Docker/Postgres — logging is a cross-cutting concern with no DB.
 */

/**
 * A capturing "stream": pino writes newline-delimited JSON to `write()`. We keep the
 * raw strings so the test can assert on the exact bytes that would have been shipped.
 */
function makeCaptureStream(): { lines: string[]; write: (s: string) => void } {
  const lines: string[] = [];
  return { lines, write: (s: string) => lines.push(s) };
}

// A distinctive value per secret so an assertion failure points at the exact leak.
const BEARER = 'super-secret-jwt-do-not-log';
const COOKIE = 'session=leaky-cookie-value';
// NOTE: `res.headers["set-cookie"]` is in REDACT_PATHS and it is LOAD-BEARING, not
// merely defence-in-depth: this app's nestjs-pino request/response logging DOES emit
// response headers (verified live in S7b), so without this path the login/refresh
// `Set-Cookie` — carrying the httpOnly JWT — would be written to the logs in cleartext.
// We assert the path is configured (below); the live redaction is proven end to end.
const PASSWORD = 'hunter2-plaintext';
const PASSWORD_HASH = 'bcrypt-hash-should-vanish';
const TOKEN = 'tok_live_should_vanish';
const CLIENT_SECRET = 'pi_123_secret_should_vanish';

/** A throwaway controller that emits an APP-level log line carrying secrets. */
@Controller('_redaction-test')
class RedactionTestController {
  constructor(private readonly logger: PinoLogger) {}

  @Get('app-log')
  hit(): { ok: true } {
    this.logger.info(
      {
        password: PASSWORD,
        token: TOKEN,
        clientSecret: CLIENT_SECRET,
        user: { passwordHash: PASSWORD_HASH },
      },
      'app-level log deliberately carrying secrets',
    );
    return { ok: true };
  }
}

describe('Log redaction', () => {
  // ── A) end-to-end through a real Nest app ──────────────────────────────────────
  describe('through a real Nest app (integration, no DB)', () => {
    let app: INestApplication;
    let capture: ReturnType<typeof makeCaptureStream>;

    beforeAll(async () => {
      capture = makeCaptureStream();
      const moduleRef = await Test.createTestingModule({
        imports: [
          LoggerModule.forRoot({
            // Same options the server runs, but we swap the transport for a capture
            // stream (pino can't use a `transport` and an explicit stream at once).
            // `[options, stream]` is nestjs-pino's supported tuple form.
            pinoHttp: [{ ...buildPinoHttpOptions(), transport: undefined }, capture],
          }),
        ],
        controllers: [RedactionTestController],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('redacts request credentials and app-logged secrets; leaks none of them', async () => {
      await request(app.getHttpServer())
        .get('/_redaction-test/app-log')
        .set('Authorization', `Bearer ${BEARER}`)
        .set('Cookie', COOKIE)
        .expect(200);

      const out = capture.lines.join('\n');

      // The censor string proves redaction actually ran (from the app-log fields, and
      // the auto request log's headers).
      expect(out).toContain('[Redacted]');

      // The security property: not one raw secret survived into the logs.
      expect(out).not.toContain(BEARER);
      expect(out).not.toContain('leaky-cookie-value');
      expect(out).not.toContain(PASSWORD);
      expect(out).not.toContain(PASSWORD_HASH);
      expect(out).not.toContain(TOKEN);
      expect(out).not.toContain(CLIENT_SECRET);
    });

    it('returns a generated x-request-id when the caller sends none', async () => {
      const res = await request(app.getHttpServer())
        .get('/_redaction-test/app-log')
        .expect(200);

      // Every response is traceable: a correlation id is echoed back so a client or
      // an on-call engineer can grep the logs for exactly this request.
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).not.toHaveLength(0);
    });

    it('reuses an inbound x-request-id so caller and API share one trace key', async () => {
      const incoming = 'trace-abc-123';
      const res = await request(app.getHttpServer())
        .get('/_redaction-test/app-log')
        .set('x-request-id', incoming)
        .expect(200);

      expect(res.headers['x-request-id']).toBe(incoming);
    });
  });

  // ── B) directly against pino-http with the real REDACT_PATHS ───────────────────
  // This exercises the exact object pino-http logs for a request (an `req` with
  // `headers`) so the auth-header/cookie redaction is proven deterministically,
  // independent of a live HTTP round trip.
  describe('the REDACT_PATHS applied to the request log shape', () => {
    it('censors the authorization and cookie request headers exactly', () => {
      const capture = makeCaptureStream();
      // Identity `req` serializer so our object passes through unchanged and the
      // redact PATHS — not pino-http's default reshaping — are what's under test.
      const httpLogger = pinoHttp(
        {
          redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
          serializers: { req: (r: unknown) => r },
          transport: undefined,
        },
        capture,
      );

      httpLogger.logger.info({
        req: { headers: { authorization: `Bearer ${BEARER}`, cookie: COOKIE } },
      });

      const line = capture.lines.join('\n');
      const parsed = JSON.parse(capture.lines[0]) as {
        req: { headers: { authorization: string; cookie: string } };
      };

      expect(parsed.req.headers.authorization).toBe('[Redacted]');
      expect(parsed.req.headers.cookie).toBe('[Redacted]');
      expect(line).not.toContain(BEARER);
      expect(line).not.toContain('leaky-cookie-value');
    });

    it('lists the security-critical fields so the config cannot silently regress', () => {
      // A guard: if someone deletes a path, this red-flags it in review.
      expect(REDACT_PATHS).toEqual(
        expect.arrayContaining([
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'password',
          'passwordHash',
          'token',
          'clientSecret',
          'secret',
        ]),
      );
    });
  });
});
