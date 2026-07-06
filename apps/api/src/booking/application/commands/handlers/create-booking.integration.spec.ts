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
import { OverlappingHoldException } from '@/inventory/domain/exceptions/overlapping-hold.exception';

/**
 * THE DoD headline: two overlapping `CreateBooking` calls race on the same
 * listing+dates through the REAL handler → one transaction → Hold + Booking
 * against a REAL Postgres with the EXCLUDE constraint. Asserts EXACTLY ONE wins
 * and the other fails with `OverlappingHoldException`, and the DB ends with a
 * single active hold and a single booking (the loser's transaction rolled back —
 * no orphan booking).
 *
 * Goes through Ken's `Booking` aggregate/VOs, so it is RED until the Booking
 * domain is implemented. Requires Docker.
 */
jest.setTimeout(180_000);

async function seedListing(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.listing.create({
    data: {
      id,
      hostId: randomUUID(),
      title: 'Race Cabin',
      description: 'x',
      location: 'Harbour',
      capacity: 4,
      basePrice: 10_000,
    },
  });
}

describe('CreateBooking (integration, real Postgres + EXCLUDE, one transaction)', () => {
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

  it('creates a booking on a happy path (hold + booking committed together)', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    const summary = await handler.execute(
      new CreateBookingCommand(
        randomUUID(),
        listingId,
        '2026-07-01',
        '2026-07-04',
        2,
      ),
    );

    expect(summary.status).toBe('PendingPayment');
    expect(summary.priceSnapshot).toBe(33_000);

    const bookings = await prisma.booking.count({ where: { listingId } });
    const holds = await prisma.hold.count({
      where: { listingId, status: 'active' },
    });
    expect(bookings).toBe(1);
    expect(holds).toBe(1);
  });

  it('lets exactly ONE of two overlapping concurrent bookings win', async () => {
    const listingId = randomUUID();
    await seedListing(prisma, listingId);

    const results = await Promise.allSettled([
      handler.execute(
        new CreateBookingCommand(randomUUID(), listingId, '2026-08-01', '2026-08-05', 2),
      ),
      handler.execute(
        new CreateBookingCommand(randomUUID(), listingId, '2026-08-03', '2026-08-07', 2),
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      OverlappingHoldException,
    );

    // The loser's transaction rolled back: one active hold, one booking, no orphan.
    const activeHolds = await prisma.hold.count({
      where: { listingId, status: 'active' },
    });
    const bookings = await prisma.booking.count({ where: { listingId } });
    expect(activeHolds).toBe(1);
    expect(bookings).toBe(1);
  });
});
