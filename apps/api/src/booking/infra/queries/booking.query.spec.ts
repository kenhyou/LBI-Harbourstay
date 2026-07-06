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
 * Scaffold-owned, GREEN now: it reads raw `booking` rows, so the test seeds rows
 * DIRECTLY via Prisma (no FK to satisfy, no domain aggregate needed). Covers the
 * projection shape, ownership scoping, and the 404 (null) paths. The happy-path
 * that a REAL Booking persists correctly lives in `create-booking.integration.spec`
 * (which needs Ken's domain). Requires Docker.
 */
jest.setTimeout(180_000);

const GUEST = '11111111-1111-4111-8111-111111111111';
const OTHER_GUEST = '99999999-9999-4999-8999-999999999999';

async function seedBooking(
  prisma: PrismaClient,
  overrides: { id?: string; guestId?: string } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  await prisma.booking.create({
    data: {
      id,
      guestId: overrides.guestId ?? GUEST,
      listingId: randomUUID(),
      holdId: randomUUID(),
      checkIn: new Date('2026-07-01T00:00:00.000Z'),
      checkOut: new Date('2026-07-04T00:00:00.000Z'),
      partySize: 2,
      status: 'PendingPayment',
      priceSnapshot: 33_000,
      holdExpiresAt: new Date('2026-06-30T12:00:00.000Z'),
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

  it('projects a booking row into the bookingSummary contract shape', async () => {
    const id = await seedBooking(prisma);

    const summary = await query.findByIdForGuest(id, GUEST);

    expect(summary).not.toBeNull();
    expect(summary).toEqual({
      id,
      listingId: expect.any(String),
      status: 'PendingPayment',
      checkIn: '2026-07-01',
      checkOut: '2026-07-04',
      partySize: 2,
      priceSnapshot: 33_000, // minor units (cents)
      holdExpiresAt: '2026-06-30T12:00:00.000Z', // ISO-8601
    });
  });

  it('returns null when the booking belongs to another guest (ownership)', async () => {
    const id = await seedBooking(prisma, { guestId: OTHER_GUEST });

    // Same id, but the requesting guest is not the owner → not found (never 403).
    expect(await query.findByIdForGuest(id, GUEST)).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await query.findByIdForGuest(randomUUID(), GUEST)).toBeNull();
  });
});
