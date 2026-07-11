import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ListingRepository } from './listing.repository';
import { ListingRepositoryPort } from '@/inventory/application/ports/listing.repository.port';
import { HostListingsQuery } from '@/inventory/infra/queries/host-listings.query';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Listing } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';

/** A half-open `[in, out)` inventory range from two `YYYY-MM-DD` strings. */
function range(checkIn: string, checkOut: string): DateRange {
  return DateRange.create(
    new Date(`${checkIn}T00:00:00.000Z`),
    new Date(`${checkOut}T00:00:00.000Z`),
  );
}

/**
 * S6a `Listing` write side against a REAL Postgres (Testcontainers): the REAL
 * repository saves/round-trips the aggregate, an update writes back the mutable
 * columns, and the host-listings read query projects the owner's rows straight
 * into the contract DTO (drafts included, scoped to the host). Requires Docker.
 */
jest.setTimeout(180_000);

const HOST_A = randomUUID();
const HOST_B = randomUUID();

function newListing(hostId: string, title: string): Listing {
  return Listing.create({
    hostId,
    title,
    description: 'A test listing.',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: ['https://img.test/a.jpg'],
  });
}

describe('ListingRepository + HostListingsQuery (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: ListingRepository;
  let query: HostListingsQuery;

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

    const prismaModule: DynamicModule = {
      module: class TestPrismaModule {},
      providers: [{ provide: PrismaService, useValue: prisma }],
      exports: [PrismaService],
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        prismaModule,
        ClsModule.forRoot({
          global: true,
          plugins: [
            new ClsPluginTransactional({
              imports: [prismaModule],
              adapter: new TransactionalAdapterPrisma({
                prismaInjectionToken: PrismaService,
              }),
            }),
          ],
        }),
      ],
      providers: [{ provide: ListingRepositoryPort, useClass: ListingRepository }],
    }).compile();

    repo = moduleRef.get(ListingRepositoryPort);
    query = new HostListingsQuery(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('round-trips a created listing through save → findById', async () => {
    const listing = newListing(HOST_A, 'Harbour Loft');
    await repo.save(listing);

    const found = await repo.findById(listing.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(listing.id);
    expect(found?.hostId).toBe(HOST_A);
    expect(found?.title).toBe('Harbour Loft');
    expect(found?.capacity).toBe(4);
    expect(found?.basePrice).toBe(18_000);
    expect(found?.status).toBe(ListingStatus.Unpublished);
  });

  it('persists mutations (updateDetails + publish) on a second save', async () => {
    const listing = newListing(HOST_A, 'Draft Cabin');
    await repo.save(listing);

    listing.updateDetails({
      title: 'Published Cabin',
      description: 'Now live.',
      type: ListingType.Tour,
      location: 'Kaikoura',
      capacity: 2,
      basePrice: 12_500,
      images: [],
    });
    listing.publish();
    await repo.save(listing);

    const found = await repo.findById(listing.id);
    expect(found?.title).toBe('Published Cabin');
    expect(found?.type).toBe(ListingType.Tour);
    expect(found?.capacity).toBe(2);
    expect(found?.basePrice).toBe(12_500);
    expect(found?.status).toBe(ListingStatus.Published);
  });

  it('returns null for an unknown id', async () => {
    expect(await repo.findById(randomUUID())).toBeNull();
  });

  it('projects only the host\'s own listings (drafts included), newest first', async () => {
    await repo.save(newListing(HOST_B, 'B-one'));
    await repo.save(newListing(HOST_B, 'B-two'));
    // A listing owned by A must NOT appear in B's dashboard.
    await repo.save(newListing(HOST_A, 'A-only'));

    const forB = await query.listForHost(HOST_B);
    const titles = forB.map((l) => l.title);
    expect(titles).toContain('B-one');
    expect(titles).toContain('B-two');
    expect(titles).not.toContain('A-only');
    // Every row carries the host summary shape incl. status (unfiltered).
    expect(forB.every((l) => l.status === 'Unpublished')).toBe(true);
  });

  it('detail read round-trips a DRAFT with description + images, scoped to the owner', async () => {
    const draft = newListing(HOST_A, 'Draft With Detail'); // Unpublished
    await repo.save(draft);

    const detail = await query.getDetailForHost(draft.id, HOST_A);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(draft.id);
    expect(detail?.status).toBe('Unpublished'); // drafts are returned
    expect(detail?.description).toBe('A test listing.');
    expect(detail?.images).toEqual(['https://img.test/a.jpg']);
    expect(detail?.capacity).toBe(4);
    expect(detail?.basePrice).toBe(18_000);

    // A different host cannot read it — null (→ 404 no-leak at the handler).
    expect(await query.getDetailForHost(draft.id, HOST_B)).toBeNull();
    // An unknown id is likewise null.
    expect(await query.getDetailForHost(randomUUID(), HOST_A)).toBeNull();
  });

  describe('availability blocks (S6b) — collection persistence', () => {
    it('inserts new blocks on save and rehydrates them on findById', async () => {
      const listing = newListing(HOST_A, 'Blockable Loft');
      listing.block(range('2026-09-01', '2026-09-05'));
      listing.block(range('2026-09-10', '2026-09-12'));
      await repo.save(listing);

      const found = await repo.findById(listing.id);
      expect(found?.blocks).toHaveLength(2);

      // The DB holds exactly the two isBlocked rows for this listing.
      const dbRows = await prisma.availabilityBlock.count({
        where: { listingId: listing.id, isBlocked: true },
      });
      expect(dbRows).toBe(2);
    });

    it('deletes a removed block on the next save (collection diff), keeping the rest', async () => {
      const listing = newListing(HOST_A, 'Diff Loft');
      const first = listing.block(range('2026-10-01', '2026-10-05'));
      listing.block(range('2026-10-10', '2026-10-12'));
      await repo.save(listing);

      // Reload, remove one block, save again — the repo must DELETE just that row.
      const reloaded = await repo.findById(listing.id);
      reloaded!.unblock(first.id);
      await repo.save(reloaded!);

      const after = await repo.findById(listing.id);
      expect(after?.blocks).toHaveLength(1);
      expect(after?.blocks[0].range.checkIn).toEqual(
        new Date('2026-10-10T00:00:00.000Z'),
      );

      const dbRows = await prisma.availabilityBlock.count({
        where: { listingId: listing.id, isBlocked: true },
      });
      expect(dbRows).toBe(1);
    });

    it('an unrelated save (publish) preserves the existing blocks', async () => {
      const listing = newListing(HOST_A, 'Publish-With-Blocks');
      listing.block(range('2026-11-01', '2026-11-03'));
      await repo.save(listing);

      const reloaded = await repo.findById(listing.id);
      reloaded!.publish(); // does not touch blocks
      await repo.save(reloaded!);

      const after = await repo.findById(listing.id);
      expect(after?.status).toBe(ListingStatus.Published);
      expect(after?.blocks).toHaveLength(1); // block survived the publish save
    });

    it('projects a listing\'s blocks (calendar order), scoped to the owner (404-no-leak)', async () => {
      const listing = newListing(HOST_A, 'Block-Read Loft');
      listing.block(range('2026-12-10', '2026-12-12'));
      listing.block(range('2026-12-01', '2026-12-03'));
      await repo.save(listing);

      const blocks = await query.listBlocksForHost(listing.id, HOST_A);
      expect(blocks).not.toBeNull();
      // Ordered by check-in ascending.
      expect(blocks!.map((b) => b.checkIn)).toEqual(['2026-12-01', '2026-12-10']);

      // Another host reading it → null (→ 404 no-leak). Unknown id → null too.
      expect(await query.listBlocksForHost(listing.id, HOST_B)).toBeNull();
      expect(await query.listBlocksForHost(randomUUID(), HOST_A)).toBeNull();
    });
  });
});
