import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ListingQuery } from './listing.query';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Integration test for the BC-5 read projection against a REAL Postgres
 * (Testcontainers). Proves the query path filters/projects correctly and
 * imports NO domain models (there are none in this BC — see the assertion at
 * the bottom). Requires Docker to be running.
 */

// UUIDs — kept local so the test does not depend on the seed script.
const PUBLISHED_LOFT = '11111111-1111-4111-8111-111111111111';
const PUBLISHED_CABIN = '22222222-2222-4222-8222-222222222222';
const UNPUBLISHED = '77777777-7777-4777-8777-777777777777';
const HOST = '00000000-0000-4000-8000-000000000001';

jest.setTimeout(180_000);

describe('ListingQuery (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let query: ListingQuery;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    // Apply the committed migrations to the throwaway DB.
    const apiRoot = join(__dirname, '..', '..', '..', '..');
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
    );

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
    query = new ListingQuery(prisma as unknown as PrismaService);

    await prisma.listing.createMany({
      data: [
        {
          id: PUBLISHED_LOFT,
          hostId: HOST,
          title: 'Harbour Loft',
          description: 'A loft with a view.',
          type: 'stay',
          location: 'Wellington',
          capacity: 4,
          basePrice: 18000,
          images: ['https://cdn.test/loft/1.jpg', 'https://cdn.test/loft/2.jpg'],
          status: 'Published',
        },
        {
          id: PUBLISHED_CABIN,
          hostId: HOST,
          title: 'Cliff Cabin',
          description: 'A quiet cabin.',
          type: 'stay',
          location: 'Kaikoura',
          capacity: 2,
          basePrice: 12500,
          images: [],
          status: 'Published',
        },
        {
          id: UNPUBLISHED,
          hostId: HOST,
          title: 'Hidden Draft',
          description: 'Not live yet.',
          type: 'stay',
          location: 'Wellington',
          capacity: 6,
          basePrice: 9900,
          images: [],
          status: 'Unpublished',
        },
      ],
    });

    // Loft is host-blocked for early August; cabin is untouched (open).
    await prisma.availabilityBlock.create({
      data: {
        listingId: PUBLISHED_LOFT,
        checkIn: new Date('2026-08-01T00:00:00.000Z'),
        checkOut: new Date('2026-08-05T00:00:00.000Z'),
        isBlocked: true,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('search returns only Published listings', async () => {
    const results = await query.search({});
    const ids = results.map((r) => r.id);

    expect(ids).toContain(PUBLISHED_LOFT);
    expect(ids).toContain(PUBLISHED_CABIN);
    expect(ids).not.toContain(UNPUBLISHED);
  });

  it('projects the summary shape with a thumbnail (first image or null)', async () => {
    const results = await query.search({ location: 'Wellington' });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: PUBLISHED_LOFT,
      title: 'Harbour Loft',
      location: 'Wellington',
      basePrice: 18000,
      thumbnailUrl: 'https://cdn.test/loft/1.jpg',
    });
  });

  it('location filter is case-insensitive and matches substrings', async () => {
    const results = await query.search({ location: 'welling' });
    expect(results.map((r) => r.id)).toEqual([PUBLISHED_LOFT]);
  });

  it('excludes listings whose capacity is below the requested guests', async () => {
    const results = await query.search({ guests: 4 });
    const ids = results.map((r) => r.id);

    expect(ids).toContain(PUBLISHED_LOFT); // capacity 4 >= 4
    expect(ids).not.toContain(PUBLISHED_CABIN); // capacity 2 < 4
  });

  it('getDetail returns the full detail shape for a Published listing', async () => {
    const detail = await query.getDetail(PUBLISHED_LOFT);

    expect(detail).toEqual({
      id: PUBLISHED_LOFT,
      title: 'Harbour Loft',
      location: 'Wellington',
      basePrice: 18000,
      thumbnailUrl: 'https://cdn.test/loft/1.jpg',
      description: 'A loft with a view.',
      capacity: 4,
      type: 'stay',
      images: ['https://cdn.test/loft/1.jpg', 'https://cdn.test/loft/2.jpg'],
    });
  });

  it('getDetail returns null for an unknown id (→ 404)', async () => {
    const detail = await query.getDetail('99999999-9999-4999-8999-999999999999');
    expect(detail).toBeNull();
  });

  it('getDetail returns null for an Unpublished listing (→ 404)', async () => {
    const detail = await query.getDetail(UNPUBLISHED);
    expect(detail).toBeNull();
  });

  it('indicativeAvailable is false when the dates overlap a blocked range', async () => {
    const detail = await query.getDetail(PUBLISHED_LOFT, {
      from: '2026-08-02',
      to: '2026-08-04',
    });
    expect(detail?.indicativeAvailable).toBe(false);
  });

  it('indicativeAvailable is true when the dates clear all blocked ranges', async () => {
    const detail = await query.getDetail(PUBLISHED_LOFT, {
      from: '2026-09-01',
      to: '2026-09-03',
    });
    expect(detail?.indicativeAvailable).toBe(true);
  });

  it('indicativeAvailable is absent when no dates are queried', async () => {
    const detail = await query.getDetail(PUBLISHED_CABIN);
    expect(detail).not.toHaveProperty('indicativeAvailable');
  });

  it('the read projection imports no domain models', () => {
    // BC-5 has no domain layer; the source must not reference one.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('node:fs').readFileSync(
      join(__dirname, 'listing.query.ts'),
      'utf8',
    ) as string;
    expect(src).not.toMatch(/\/domain\//);
    expect(src).not.toMatch(/reconstitute/);
  });
});
