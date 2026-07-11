import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { IdentityModule } from '@/identity/identity.module';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { configureSecurity } from '@/bootstrap/configure-security';
import { throttlerRootOptions } from '@/shared/throttler/throttler.config';

/**
 * S7a security-baseline e2e. Proves the three cross-cutting HTTP defences are wired
 * exactly as the server runs them:
 *   1. throttler → 429 when the tighter auth limit is exceeded,
 *   2. helmet → secure response headers present (and `x-powered-by` gone),
 *   3. CORS → allowed origin reflected + credentials; disallowed origin gets no ACAO.
 *
 * It runs WITHOUT Docker/Postgres on purpose: we override `PrismaService` with an
 * empty stub and exercise only paths that never touch the DB —
 *   • `POST /auth/refresh` with no cookie → 400 before the service is called, and
 *   • `GET  /auth/me`      with no cookie → 401 at the guard, before any query.
 * That keeps the suite fast while still exercising the REAL `AuthController`
 * (`@Throttle`), the REAL global `ThrottlerGuard`, and the REAL `configureSecurity`.
 *
 * A fresh app is built PER test so the in-memory throttler bucket starts empty each
 * time (the hammer test would otherwise poison the header/CORS tests).
 */
describe('Security baseline (e2e, no DB)', () => {
  async function createApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot(throttlerRootOptions()),
        IdentityModule,
      ],
      // The global rate-limit guard, exactly as AppModule registers it.
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    })
      // No real database: a minimal stub satisfies DI and lets the login path
      // resolve to a clean 401 (user not found) instead of a 500. The throttler
      // counts every request regardless, so the 429 assertion is unaffected.
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique: async (): Promise<null> => null } })
      .compile();

    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureSecurity(app);
    await app.init();
    return app;
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  it('throttles POST /auth/login past the tighter auth limit with 429', async () => {
    const app = await createApp();
    try {
      // Default auth limit is 10/min. Hammer 15 no-cookie logins from one IP; the
      // early ones bounce at the contract/handler (400), then the limiter kicks in.
      const statuses: number[] = [];
      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'nobody@example.com', password: 'password123' });
        statuses.push(res.status);
      }

      // The very first request must NOT be a 429 (limiter hasn't tripped yet)…
      expect(statuses[0]).not.toBe(429);
      // …and by the 15th we must have seen at least one 429.
      expect(statuses).toContain(429);
    } finally {
      await app.close();
    }
  });

  // ── helmet secure headers ────────────────────────────────────────────────────
  it('sets helmet security headers and hides x-powered-by', async () => {
    const app = await createApp();
    try {
      // GET /auth/me with no cookie → 401, but header middleware runs regardless.
      const res = await request(app.getHttpServer()).get('/auth/me');

      // MIME-sniffing protection — a canonical helmet header.
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      // Clickjacking protection.
      expect(res.headers['x-frame-options']).toBeDefined();
      // helmet also strips the framework fingerprint.
      expect(res.headers['x-powered-by']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  // ── CORS allow-list ──────────────────────────────────────────────────────────
  it('reflects the allowed web origin and allows credentials', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Origin', 'http://localhost:3000');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      await app.close();
    }
  });

  it('does not send ACAO for a disallowed origin', async () => {
    const app = await createApp();
    try {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Origin', 'http://evil.example.com');

      // No Access-Control-Allow-Origin → the browser blocks the cross-origin read.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
