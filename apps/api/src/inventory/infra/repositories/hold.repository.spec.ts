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
import { HoldRepository } from './hold.repository';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Hold } from '@/inventory/domain/models/hold.model';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { HoldStatus } from '@/inventory/domain/enums/hold-status.enum';
import { OverlappingHoldException } from '@/inventory/domain/exceptions/overlapping-hold.exception';

/**
 * Hold write-repository against a REAL Postgres (Testcontainers), exercising the
 * `no_overlapping_holds` EXCLUDE constraint end-to-end. Scaffold-owned, GREEN now
 * (does NOT depend on Ken's Booking domain). Requires Docker.
 *
 * This is the infra half of the overbooking proof: the CreateBooking race (which
 * goes through Ken's Booking aggregate) is in `create-booking.integration.spec.ts`
 * and stays RED until the Booking domain is filled.
 */
jest.setTimeout(180_000);

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

async function seedListing(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.listing.create({
    data: {
      id,
      hostId: randomUUID(),
      title: 'Test Cabin',
      description: 'x',
      location: 'Harbour',
      capacity: 4,
      basePrice: 10_000,
    },
  });
}

function newHold(listingId: string, from: string, to: string): Hold {
  return Hold.create({
    listingId,
    dateRange: DateRange.create(d(from), d(to)),
    ttlMinutes: 15,
  });
}

describe('HoldRepository (integration, real Postgres + EXCLUDE)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: HoldRepository;

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
      providers: [HoldRepository],
    }).compile();

    repo = moduleRef.get(HoldRepository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('saves a hold and finds it by id (round-trip through the mapper)', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);
    const hold = newHold(listingId, '2026-07-01', '2026-07-04');

    await repo.save(hold);
    const found = await repo.findById(hold.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(hold.id);
    expect(found!.status).toBe(HoldStatus.Active);
    expect(found!.dateRange.nights()).toBe(3);
  });

  it('rejects a second overlapping active hold with OverlappingHoldException', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    await repo.save(newHold(listingId, '2026-08-10', '2026-08-15'));

    await expect(
      repo.save(newHold(listingId, '2026-08-14', '2026-08-20')),
    ).rejects.toBeInstanceOf(OverlappingHoldException);
  });

  it('allows a touching (back-to-back) hold — half-open ranges do not overlap', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    await repo.save(newHold(listingId, '2026-09-01', '2026-09-05'));
    await expect(
      repo.save(newHold(listingId, '2026-09-05', '2026-09-10')),
    ).resolves.toBeUndefined();
  });

  it('allows overlapping dates once the prior hold is released', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    const first = newHold(listingId, '2026-10-01', '2026-10-05');
    await repo.save(first);
    first.release();
    await repo.save(first);

    // A released hold no longer participates in the EXCLUDE (WHERE status in active/committed).
    await expect(
      repo.save(newHold(listingId, '2026-10-01', '2026-10-05')),
    ).resolves.toBeUndefined();
  });

  it('lets exactly ONE of two concurrent overlapping holds win (the race)', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    const results = await Promise.allSettled([
      repo.save(newHold(listingId, '2026-11-01', '2026-11-05')),
      repo.save(newHold(listingId, '2026-11-02', '2026-11-06')),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      OverlappingHoldException,
    );

    const active = await prisma.hold.count({
      where: { listingId, status: 'active' },
    });
    expect(active).toBe(1);
  });
});
