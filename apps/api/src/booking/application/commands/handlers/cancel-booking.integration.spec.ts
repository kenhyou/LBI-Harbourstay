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
import { CancelBookingHandler } from './cancel-booking.command.handler';
import { CancelBookingCommand } from '@/booking/application/commands/cancel-booking.command';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingRepository } from '@/booking/infra/repositories/booking.repository';
import { BookingQuery } from '@/booking/infra/queries/booking.query';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { HoldRepository } from '@/inventory/infra/repositories/hold.repository';
import { CancellationPolicyProviderPort } from '@/booking/application/ports/cancellation-policy.provider.port';
import { StandardCancellationPolicyProvider } from '@/booking/infra/adapters/standard-cancellation-policy.provider';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ClsTransactionManager } from '@/shared/transaction/cls-transaction-manager';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { PrismaOutbox } from '@/shared/outbox/prisma-outbox';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';
import { BOOKING_CANCELLED } from '@/booking/domain/events/booking-cancelled.event';

/**
 * S5 Cancel-Booking end-to-end against a REAL Postgres (Testcontainers): the REAL
 * handler runs `booking.cancel()` + `hold.release()` + `outbox.enqueue(...)` in ONE
 * transaction, and the read side (`BookingQuery`) then surfaces the cancelled
 * booking. Goes through Ken's `Booking.cancel` and the handler `execute`, so it is
 * RED until both are implemented. Requires Docker.
 */
jest.setTimeout(180_000);

const GUEST = '11111111-1111-4111-8111-111111111111';
// Far enough ahead that the standard policy grants a 100% refund at test time.
const CHECK_IN = '2026-09-01';
const CHECK_OUT = '2026-09-04';
const PRICE = 33_000;

async function seedListing(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.listing.create({
    data: {
      id,
      hostId: randomUUID(),
      title: 'Cancel Cabin',
      description: 'x',
      location: 'Harbour',
      capacity: 4,
      basePrice: 10_000,
    },
  });
  return id;
}

async function seedConfirmedBooking(
  prisma: PrismaClient,
  listingId: string,
): Promise<{ bookingId: string; holdId: string }> {
  const holdId = randomUUID();
  await prisma.hold.create({
    data: {
      id: holdId,
      listingId,
      checkIn: new Date(`${CHECK_IN}T00:00:00.000Z`),
      checkOut: new Date(`${CHECK_OUT}T00:00:00.000Z`),
      status: 'committed',
      expiresAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  });
  const bookingId = randomUUID();
  await prisma.booking.create({
    data: {
      id: bookingId,
      guestId: GUEST,
      listingId,
      holdId,
      checkIn: new Date(`${CHECK_IN}T00:00:00.000Z`),
      checkOut: new Date(`${CHECK_OUT}T00:00:00.000Z`),
      partySize: 2,
      status: 'Confirmed',
      priceSnapshot: PRICE,
      holdExpiresAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  });
  return { bookingId, holdId };
}

describe('CancelBooking (integration, real Postgres, one transaction)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let handler: CancelBookingHandler;
  let query: BookingQuery;

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
        CancelBookingHandler,
        { provide: TransactionManagerPort, useClass: ClsTransactionManager },
        { provide: BookingRepositoryPort, useClass: BookingRepository },
        { provide: HoldRepositoryPort, useClass: HoldRepository },
        { provide: OutboxPort, useClass: PrismaOutbox },
        {
          provide: CancellationPolicyProviderPort,
          useClass: StandardCancellationPolicyProvider,
        },
      ],
    }).compile();

    handler = moduleRef.get(CancelBookingHandler);
    query = new BookingQuery(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('cancels a confirmed booking: booking Cancelled, hold Released, outbox row enqueued — atomically', async () => {
    const listingId = await seedListing(prisma);
    const { bookingId, holdId } = await seedConfirmedBooking(prisma, listingId);

    const result = await handler.execute(new CancelBookingCommand(bookingId, GUEST));

    expect(result.status).toBe('Cancelled');
    expect(result.refundAmount).toBe(PRICE); // ≥7 days out → 100% refund
    expect(typeof result.cancelledAt).toBe('string');

    const bookingRow = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(bookingRow.status).toBe('Cancelled');
    expect(bookingRow.cancelledAt).toBeInstanceOf(Date);
    expect(bookingRow.refundAmount).toBe(PRICE);

    const holdRow = await prisma.hold.findUniqueOrThrow({ where: { id: holdId } });
    expect(holdRow.status).toBe('released');

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: bookingId, type: BOOKING_CANCELLED },
    });
    expect(outbox).toHaveLength(1);

    // Read side surfaces the cancellation for the owning guest.
    const detail = await query.findDetailByIdForGuest(bookingId, GUEST);
    expect(detail?.status).toBe('Cancelled');
    expect(detail?.refundAmount).toBe(PRICE);
    expect(detail?.listingTitle).toBe('Cancel Cabin');

    const mine = await query.listForGuest(GUEST);
    expect(mine.some((b) => b.id === bookingId)).toBe(true);
  });

  it('rejects a cancel for a booking the guest does not own (404 no-leak), leaving it untouched', async () => {
    const listingId = await seedListing(prisma);
    const { bookingId } = await seedConfirmedBooking(prisma, listingId);

    await expect(
      handler.execute(new CancelBookingCommand(bookingId, randomUUID())),
    ).rejects.toBeInstanceOf(BookingNotFoundException);

    const bookingRow = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(bookingRow.status).toBe('Confirmed');
    expect(bookingRow.cancelledAt).toBeNull();
  });
});
