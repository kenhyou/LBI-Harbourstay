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
import { InventoryModule } from '@/inventory/inventory.module';
import { TransactionModule } from '@/shared/transaction/transaction.module';
import { PrismaModule } from '@/infra/prisma/prisma.module';

/**
 * Full HTTP journey for the S6a host-listings surface against a REAL Postgres
 * (Testcontainers). Proves the two authorization layers end-to-end:
 *   - RBAC (RolesGuard + @Roles('host')): a signed-in GUEST → 403; a HOST → 2xx;
 *     an anonymous request → 401.
 *   - Ownership (handler 404-no-leak): host B editing host A's listing → 404.
 * Plus the create → publish → list happy path. Requires Docker.
 */
jest.setTimeout(180_000);

const UPSERT = {
  title: 'Harbour Loft',
  description: 'A bright loft over the marina.',
  type: 'stay',
  location: 'Wellington',
  capacity: 4,
  basePrice: 18_000,
  images: [],
};

describe('Host listings HTTP journey (e2e, real Postgres)', () => {
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
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        TransactionModule,
        IdentityModule,
        InventoryModule,
      ],
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
  const cookies = (res: request.Response): string[] =>
    res.headers['set-cookie'] as unknown as string[];

  /** Register a fresh user and return their session cookies. */
  async function registerAndLogin(
    email: string,
    role: 'guest' | 'host',
  ): Promise<string[]> {
    const res = await request(server())
      .post('/auth/register')
      .send({ email, password: 'password123', role })
      .expect(201);
    return cookies(res);
  }

  let hostACookies: string[];
  let hostBCookies: string[];
  let guestCookies: string[];
  let listingId: string;

  it('registers a host, a second host, and a guest', async () => {
    hostACookies = await registerAndLogin('host-a@harbourstay.test', 'host');
    hostBCookies = await registerAndLogin('host-b@harbourstay.test', 'host');
    guestCookies = await registerAndLogin('guest@harbourstay.test', 'guest');
  });

  it('rejects an anonymous create with 401', async () => {
    await request(server()).post('/host/listings').send(UPSERT).expect(401);
  });

  it('rejects a signed-in GUEST hitting /host/* with 403 (RBAC)', async () => {
    await request(server())
      .post('/host/listings')
      .set('Cookie', guestCookies)
      .send(UPSERT)
      .expect(403);

    await request(server())
      .get('/host/listings')
      .set('Cookie', guestCookies)
      .expect(403);
  });

  it('lets a HOST create a listing (201, Unpublished)', async () => {
    const res = await request(server())
      .post('/host/listings')
      .set('Cookie', hostACookies)
      .send(UPSERT)
      .expect(201);

    expect(res.body).toMatchObject({
      title: 'Harbour Loft',
      status: 'Unpublished',
      capacity: 4,
      basePrice: 18_000,
    });
    expect(res.body.id).toEqual(expect.any(String));
    listingId = res.body.id;
  });

  it('rejects a create with an invalid body at the Zod boundary (400)', async () => {
    await request(server())
      .post('/host/listings')
      .set('Cookie', hostACookies)
      .send({ ...UPSERT, capacity: 0 }) // capacity < 1
      .expect(400);
  });

  it('lists the host\'s own listings (includes the draft)', async () => {
    const res = await request(server())
      .get('/host/listings')
      .set('Cookie', hostACookies)
      .expect(200);
    expect(res.body.some((l: { id: string }) => l.id === listingId)).toBe(true);
  });

  it('reads the host\'s own DRAFT in full detail (200, with description + images)', async () => {
    const res = await request(server())
      .get(`/host/listings/${listingId}`)
      .set('Cookie', hostACookies)
      .expect(200);
    expect(res.body).toMatchObject({
      id: listingId,
      title: 'Harbour Loft',
      description: 'A bright loft over the marina.',
      status: 'Unpublished', // a draft is returned — it's the edit-prefill source
    });
    expect(Array.isArray(res.body.images)).toBe(true);
  });

  it('404-no-leaks the detail read for host B (never 403)', async () => {
    await request(server())
      .get(`/host/listings/${listingId}`)
      .set('Cookie', hostBCookies)
      .expect(404);
  });

  it('403s a guest reading a host detail; 401 for anon', async () => {
    await request(server())
      .get(`/host/listings/${listingId}`)
      .set('Cookie', guestCookies)
      .expect(403);
    await request(server()).get(`/host/listings/${listingId}`).expect(401);
  });

  it('publishes the host\'s own listing (200, Published)', async () => {
    const res = await request(server())
      .post(`/host/listings/${listingId}/publish`)
      .set('Cookie', hostACookies)
      .expect(200);
    expect(res.body.status).toBe('Published');
  });

  it('409s on re-publishing an already-Published listing', async () => {
    await request(server())
      .post(`/host/listings/${listingId}/publish`)
      .set('Cookie', hostACookies)
      .expect(409);
  });

  it('404-no-leaks when host B edits host A\'s listing (never 403)', async () => {
    await request(server())
      .patch(`/host/listings/${listingId}`)
      .set('Cookie', hostBCookies)
      .send({ ...UPSERT, title: 'Hijacked' })
      .expect(404);

    // And publish/unpublish are equally opaque to a non-owner.
    await request(server())
      .post(`/host/listings/${listingId}/unpublish`)
      .set('Cookie', hostBCookies)
      .expect(404);
  });

  it('404s on an unknown listing id for the owner too', async () => {
    await request(server())
      .patch('/host/listings/00000000-0000-4000-8000-0000000000ff')
      .set('Cookie', hostACookies)
      .send(UPSERT)
      .expect(404);
  });

  it('lets host A unpublish their own Published listing (200)', async () => {
    const res = await request(server())
      .post(`/host/listings/${listingId}/unpublish`)
      .set('Cookie', hostACookies)
      .expect(200);
    expect(res.body.status).toBe('Unpublished');
  });
});
