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
import { CreateBookingHandler } from './create-booking.command.handler';
import { CreateBookingCommand } from '@/booking/application/commands/create-booking.command';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingRepository } from '@/booking/infra/repositories/booking.repository';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { HoldRepository } from '@/inventory/infra/repositories/hold.repository';
import { ListingInventoryPort } from '@/inventory/application/ports/listing-inventory.port';
import { ListingInventoryQuery } from '@/inventory/infra/queries/listing-inventory.query';
import { PricingService } from '@/inventory/domain/services/pricing.service';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ClsTransactionManager } from '@/shared/transaction/cls-transaction-manager';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { DatesNotAvailableException } from '@/inventory/domain/exceptions/dates-not-available.exception';

/**
 * S6b: blocks have TEETH. Proves the create-booking / hold-placement path rejects
 * a guest whose dates overlap a host `AvailabilityBlock` (isBlocked), while an
 * unblocked (and a merely touching, half-open) range still books.
 *
 * S3 already wired the gate (`ListingInventoryPort.hasBlockingBlock` in the
 * handler) — but until S6b there was no way to CREATE a block, so nothing ever
 * exercised it. This test seeds an isBlocked `availability_block` row directly and
 * proves the rejection end-to-end through the REAL handler + Postgres. Requires
 * Docker.
 */
jest.setTimeout(180_000);

async function seedListing(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.listing.create({
    data: {
      id,
      hostId: randomUUID(),
      title: 'Blocked Cabin',
      description: 'x',
      location: 'Harbour',
      capacity: 4,
      basePrice: 10_000,
      status: 'Published', // create-booking only reads Published listings
    },
  });
}

async function seedBlock(
  prisma: PrismaClient,
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  await prisma.availabilityBlock.create({
    data: {
      id: randomUUID(),
      listingId,
      checkIn: new Date(`${checkIn}T00:00:00.000Z`),
      checkOut: new Date(`${checkOut}T00:00:00.000Z`),
      isBlocked: true,
    },
  });
}

describe('CreateBooking vs host block (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let handler: CreateBookingHandler;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    const apiRoot = join(__dirname, '..', '..', '..', '..', '..');
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
      providers: [
        CreateBookingHandler,
        PricingService,
        { provide: TransactionManagerPort, useClass: ClsTransactionManager },
        { provide: HoldRepositoryPort, useClass: HoldRepository },
        { provide: BookingRepositoryPort, useClass: BookingRepository },
        { provide: ListingInventoryPort, useClass: ListingInventoryQuery },
      ],
    }).compile();

    handler = moduleRef.get(CreateBookingHandler);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('rejects a booking whose dates overlap a host block, and writes nothing', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);
    await seedBlock(prisma, listingId, '2026-07-10', '2026-07-20');

    await expect(
      handler.execute(
        new CreateBookingCommand(randomUUID(), listingId, '2026-07-12', '2026-07-15', 2),
      ),
    ).rejects.toBeInstanceOf(DatesNotAvailableException);

    // The transaction rolled back — no hold, no booking on a blocked range.
    expect(await prisma.hold.count({ where: { listingId } })).toBe(0);
    expect(await prisma.booking.count({ where: { listingId } })).toBe(0);
  });

  it('allows a booking on a range that does not overlap the block', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);
    await seedBlock(prisma, listingId, '2026-07-10', '2026-07-20');

    const summary = await handler.execute(
      new CreateBookingCommand(randomUUID(), listingId, '2026-08-01', '2026-08-04', 2),
    );

    expect(summary.status).toBe('PendingPayment');
    expect(await prisma.hold.count({ where: { listingId, status: 'active' } })).toBe(1);
  });

  it('allows a booking that checks in exactly when the block ends (half-open, no overlap)', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);
    await seedBlock(prisma, listingId, '2026-07-10', '2026-07-20');

    // Block is [10, 20); a stay starting on the 20th does NOT overlap it.
    const summary = await handler.execute(
      new CreateBookingCommand(randomUUID(), listingId, '2026-07-20', '2026-07-22', 2),
    );

    expect(summary.status).toBe('PendingPayment');
    expect(await prisma.hold.count({ where: { listingId, status: 'active' } })).toBe(1);
  });
});
