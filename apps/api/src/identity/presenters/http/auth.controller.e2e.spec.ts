import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { IdentityModule } from '@/identity/identity.module';

/**
 * Full HTTP journey for BC-7 against a REAL Postgres (Testcontainers):
 * register → login → /me → refresh, plus the negative paths (duplicate email,
 * bad password, unauthenticated). Exercises the entire stack INCLUDING Ken's
 * domain fill, so it is RED until `Email` + `User` are implemented. Requires
 * Docker.
 */
jest.setTimeout(180_000);

describe('Auth HTTP journey (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;

    const apiRoot = join(__dirname, '..', '..', '..', '..');
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), IdentityModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  const server = () => app.getHttpServer();

  // supertest types `set-cookie` as string; at runtime it is a string[].
  const cookies = (res: request.Response): string[] =>
    res.headers['set-cookie'] as unknown as string[];

  it('registers a new host and returns the safe user (no passwordHash)', async () => {
    const res = await request(server())
      .post('/auth/register')
      .send({ email: 'journey@example.com', password: 'password123', role: 'host' })
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'journey@example.com',
      role: 'host',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(cookies(res).join(';')).toMatch(/access_token=/);
    expect(cookies(res).join(';')).toMatch(/refresh_token=/);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(server())
      .post('/auth/register')
      .send({ email: 'journey@example.com', password: 'password123', role: 'guest' })
      .expect(409);
  });

  it('rejects a short password at the contract boundary with 400', async () => {
    await request(server())
      .post('/auth/register')
      .send({ email: 'short@example.com', password: 'tiny', role: 'guest' })
      .expect(400);
  });

  it('logs in with correct credentials and sets cookies', async () => {
    const res = await request(server())
      .post('/auth/login')
      .send({ email: 'journey@example.com', password: 'password123' })
      .expect(200);
    expect(res.body.email).toBe('journey@example.com');
    expect(cookies(res).join(';')).toMatch(/access_token=/);
  });

  it('rejects a wrong password with 401', async () => {
    await request(server())
      .post('/auth/login')
      .send({ email: 'journey@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me returns 401 without a session cookie', async () => {
    await request(server()).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns the current user with the access cookie', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email: 'journey@example.com', password: 'password123' })
      .expect(200);
    const sessionCookies = cookies(login);

    const me = await request(server())
      .get('/auth/me')
      .set('Cookie', sessionCookies)
      .expect(200);
    expect(me.body).toEqual({
      id: expect.any(String),
      email: 'journey@example.com',
      role: 'host',
    });
  });

  it('POST /auth/refresh rotates tokens using the refresh cookie', async () => {
    const login = await request(server())
      .post('/auth/login')
      .send({ email: 'journey@example.com', password: 'password123' })
      .expect(200);
    const sessionCookies = cookies(login);

    const refreshed = await request(server())
      .post('/auth/refresh')
      .set('Cookie', sessionCookies)
      .expect(200);
    expect(refreshed.body.email).toBe('journey@example.com');
    expect(cookies(refreshed).join(';')).toMatch(/access_token=/);
  });

  it('POST /auth/refresh without a cookie is a 400', async () => {
    await request(server()).post('/auth/refresh').expect(400);
  });
});
