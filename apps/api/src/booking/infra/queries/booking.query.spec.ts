import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { BookingQuery } from './booking.query';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * `BookingQuery` read projection against a REAL Postgres (Testcontainers).
 * Scaffold-owned, GREEN now: it reads raw `booking` rows joined to `listing`, so
 * the test seeds rows DIRECTLY via Prisma (no domain aggregate needed). Covers the
 * `bookingDetail` projection shape (incl. `listingTitle`, `nights`, and the S5
 * cancellation fields), ownership scoping, the 404 (null) paths, and the
 * newest-first list. The happy-path that a REAL Booking persists correctly lives in
 * `create-booking.integration.spec` (which needs Ken's domain). Requires Docker.
 */
jest.setTimeout(180_000);

const GUEST = '11111111-1111-4111-8111-111111111111';
const OTHER_GUEST = '99999999-9999-4999-8999-999999999999';

async function seedListing(
  prisma: PrismaClient,
  title = 'Harbour Loft',
  hostId: string = randomUUID(),
): Promise<string> {
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
    },
  });
  return id;
}

async function seedBooking(
  prisma: PrismaClient,
  listingId: string,
  overrides: {
    id?: string;
    guestId?: string;
    createdAt?: Date;
    status?: 'PendingPayment' | 'Cancelled';
    cancelledAt?: Date | null;
    refundAmount?: number | null;
  } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  await prisma.booking.create({
    data: {
      id,
      guestId: overrides.guestId ?? GUEST,
      listingId,
      holdId: randomUUID(),
      checkIn: new Date('2026-07-01T00:00:00.000Z'),
      checkOut: new Date('2026-07-04T00:00:00.000Z'),
      partySize: 2,
      status: overrides.status ?? 'PendingPayment',
      priceSnapshot: 33_000,
      holdExpiresAt: new Date('2026-06-30T12:00:00.000Z'),
      createdAt: overrides.createdAt ?? new Date('2026-06-29T00:00:00.000Z'),
      cancelledAt: overrides.cancelledAt ?? null,
      refundAmount: overrides.refundAmount ?? null,
    },
  });
  return id;
}

describe('BookingQuery (integration, real Postgres — read projection)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let query: BookingQuery;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    const apiRoot = join(__dirname, '..', '..', '..', '..');
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
    );

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
    query = new BookingQuery(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('projects a booking row into the bookingDetail contract shape (joins the listing title)', async () => {
    const listingId = await seedListing(prisma, 'Seaside Cabin');
    const id = await seedBooking(prisma, listingId);

    const detail = await query.findDetailByIdForGuest(id, GUEST);

    expect(detail).toEqual({
      id,
      listingId,
      listingTitle: 'Seaside Cabin',
      status: 'PendingPayment',
      checkIn: '2026-07-01',
      checkOut: '2026-07-04',
      nights: 3,
      partySize: 2,
      priceSnapshot: 33_000, // minor units (cents)
      currency: 'USD',
      createdAt: '2026-06-29T00:00:00.000Z', // ISO-8601
      cancelledAt: null,
      refundAmount: null,
    });
  });

  it('surfaces the S5 cancellation fields for a cancelled booking', async () => {
    const listingId = await seedListing(prisma);
    const id = await seedBooking(prisma, listingId, {
      status: 'Cancelled',
      cancelledAt: new Date('2026-07-05T10:00:00.000Z'),
      refundAmount: 16_500,
    });

    const detail = await query.findDetailByIdForGuest(id, GUEST);

    expect(detail?.status).toBe('Cancelled');
    expect(detail?.cancelledAt).toBe('2026-07-05T10:00:00.000Z');
    expect(detail?.refundAmount).toBe(16_500);
  });

  it('returns null when the booking belongs to another guest (ownership)', async () => {
    const listingId = await seedListing(prisma);
    const id = await seedBooking(prisma, listingId, { guestId: OTHER_GUEST });

    // Same id, but the requesting guest is not the owner → not found (never 403).
    expect(await query.findDetailByIdForGuest(id, GUEST)).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await query.findDetailByIdForGuest(randomUUID(), GUEST)).toBeNull();
  });

  it('lists the guest\'s own bookings newest-first, and excludes others', async () => {
    const guest = randomUUID();
    const listingId = await seedListing(prisma, 'List Cabin');
    const older = await seedBooking(prisma, listingId, {
      guestId: guest,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const newer = await seedBooking(prisma, listingId, {
      guestId: guest,
      createdAt: new Date('2026-06-20T00:00:00.000Z'),
    });
    // Another guest's booking on the same listing must NOT appear.
    await seedBooking(prisma, listingId, { guestId: randomUUID() });

    const list = await query.listForGuest(guest);

    expect(list.map((b) => b.id)).toEqual([newer, older]);
    expect(list[0].listingTitle).toBe('List Cabin');
  });

  it('returns an empty array for a guest with no bookings', async () => {
    expect(await query.listForGuest(randomUUID())).toEqual([]);
  });

  describe('listForHost (S6b) — host-scoped across their listings', () => {
    it('returns only bookings on the host\'s own listings; host A never sees host B\'s', async () => {
      const hostA = randomUUID();
      const hostB = randomUUID();
      const listingA = await seedListing(prisma, 'A Cabin', hostA);
      const listingB = await seedListing(prisma, 'B Cabin', hostB);

      const bookingOnA = await seedBooking(prisma, listingA, {
        guestId: randomUUID(),
        createdAt: new Date('2026-06-10T00:00:00.000Z'),
      });
      // A second, newer booking on A to assert ordering.
      const newerOnA = await seedBooking(prisma, listingA, {
        guestId: randomUUID(),
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
      });
      // A booking on B must NEVER appear in A's host view.
      await seedBooking(prisma, listingB, { guestId: randomUUID() });

      const forA = await query.listForHost(hostA);

      expect(forA.map((b) => b.id)).toEqual([newerOnA, bookingOnA]); // newest-first
      expect(forA.every((b) => b.listingId === listingA)).toBe(true);
      expect(forA[0]).toMatchObject({
        listingTitle: 'A Cabin',
        totalPrice: 33_000, // frozen priceSnapshot, minor units
        partySize: 2,
        status: 'PendingPayment',
        checkIn: '2026-07-01',
        checkOut: '2026-07-04',
      });
      expect(forA[0].guestId).toEqual(expect.any(String));
    });

    it('returns an empty array for a host with no listings (or no bookings)', async () => {
      expect(await query.listForHost(randomUUID())).toEqual([]);
    });
  });
});
