import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
import { BookingModule } from '@/booking/booking.module';
import { TransactionModule } from '@/shared/transaction/transaction.module';
import { OutboxModule } from '@/shared/outbox/outbox.module';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * `GET /host/bookings` HTTP journey against a REAL Postgres (Testcontainers).
 * Proves the two things the endpoint must guarantee:
 *   - RBAC: anon → 401, signed-in guest → 403, host → 200 (RolesGuard + @Roles).
 *   - Ownership scoping: a host sees ONLY bookings on their own listings — host A
 *     never sees a booking made on host B's listing.
 * Bookings/listings are seeded directly via Prisma (a read endpoint, no domain
 * needed). Requires Docker.
 */
jest.setTimeout(180_000);

describe('Host bookings HTTP journey (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

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
        OutboxModule,
        IdentityModule,
        InventoryModule,
        BookingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  const server = () => app.getHttpServer();
  const cookies = (res: request.Response): string[] =>
    res.headers['set-cookie'] as unknown as string[];

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

  async function whoAmI(sessionCookies: string[]): Promise<string> {
    const res = await request(server())
      .get('/auth/me')
      .set('Cookie', sessionCookies)
      .expect(200);
    return res.body.id;
  }

  async function seedListing(hostId: string, title: string): Promise<string> {
    const id = randomUUID();
    await prisma.listing.create({
      data: {
        id,
        hostId,
        title,
        description: 'x',
        location: 'Harbour',
        capacity: 4,
        basePrice: 10_000,
        status: 'Published',
      },
    });
    return id;
  }

  async function seedBooking(listingId: string): Promise<string> {
    const id = randomUUID();
    await prisma.booking.create({
      data: {
        id,
        guestId: randomUUID(),
        listingId,
        holdId: randomUUID(),
        checkIn: new Date('2026-07-01T00:00:00.000Z'),
        checkOut: new Date('2026-07-04T00:00:00.000Z'),
        partySize: 2,
        status: 'Confirmed',
        priceSnapshot: 33_000,
        holdExpiresAt: new Date('2026-06-30T12:00:00.000Z'),
        createdAt: new Date('2026-06-29T00:00:00.000Z'),
      },
    });
    return id;
  }

  let hostACookies: string[];
  let hostBCookies: string[];
  let guestCookies: string[];
  let bookingOnA: string;

  it('registers two hosts and a guest, and seeds a booking on each host\'s listing', async () => {
    hostACookies = await registerAndLogin('hb-host-a@harbourstay.test', 'host');
    hostBCookies = await registerAndLogin('hb-host-b@harbourstay.test', 'host');
    guestCookies = await registerAndLogin('hb-guest@harbourstay.test', 'guest');

    const hostAId = await whoAmI(hostACookies);
    const hostBId = await whoAmI(hostBCookies);

    const listingA = await seedListing(hostAId, 'A Cabin');
    const listingB = await seedListing(hostBId, 'B Cabin');
    bookingOnA = await seedBooking(listingA);
    await seedBooking(listingB);
  });

  it('rejects an anonymous request with 401', async () => {
    await request(server()).get('/host/bookings').expect(401);
  });

  it('rejects a signed-in guest with 403 (RBAC)', async () => {
    await request(server())
      .get('/host/bookings')
      .set('Cookie', guestCookies)
      .expect(403);
  });

  it('returns only host A\'s bookings (never host B\'s)', async () => {
    const res = await request(server())
      .get('/host/bookings')
      .set('Cookie', hostACookies)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: bookingOnA,
      listingTitle: 'A Cabin',
      totalPrice: 33_000,
      status: 'Confirmed',
    });
  });

  it('returns host B\'s own single booking (disjoint from A)', async () => {
    const res = await request(server())
      .get('/host/bookings')
      .set('Cookie', hostBCookies)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].listingTitle).toBe('B Cabin');
    expect(res.body[0].id).not.toBe(bookingOnA);
  });
});
