import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventBus } from '@nestjs/cqrs';
import { PrismaClient } from '@prisma/client';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import { HandleStripeWebhookHandler } from './handle-stripe-webhook.command.handler';
import { HandleStripeWebhookCommand } from '@/payment/application/commands/handle-stripe-webhook.command';
import { BookingCheckoutSaga } from '@/payment/application/booking-checkout.saga';
import {
  PaymentGatewayPort,
  type TranslatedPaymentEvent,
} from '@/payment/application/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '@/payment/application/ports/payment.repository.port';
import { PaymentRepository } from '@/payment/infra/repositories/payment.repository';
import { ProcessedWebhookEventRepositoryPort } from '@/payment/application/ports/processed-webhook-event.repository.port';
import { ProcessedWebhookEventRepository } from '@/payment/infra/repositories/processed-webhook-event.repository';
import { PaymentLookupPort } from '@/payment/application/ports/payment-lookup.port';
import { PaymentLookupQuery } from '@/payment/infra/queries/payment-lookup.query';
import { BookingRepositoryPort } from '@/booking/application/ports/booking.repository.port';
import { BookingRepository } from '@/booking/infra/repositories/booking.repository';
import { HoldRepositoryPort } from '@/inventory/application/ports/hold.repository.port';
import { HoldRepository } from '@/inventory/infra/repositories/hold.repository';
import { OutboxPort } from '@/shared/outbox/outbox.port';
import { PrismaOutbox } from '@/shared/outbox/prisma-outbox';
import { TransactionManagerPort } from '@/shared/transaction/transaction-manager.port';
import { ClsTransactionManager } from '@/shared/transaction/cls-transaction-manager';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaymentSucceededEvent } from '@/payment/domain/events/payment-succeeded.event';

/**
 * WEBHOOK IDEMPOTENCY (DoD headline for S4). Delivers the SAME translated Stripe
 * event twice through the real handler against a real Postgres, then drives the
 * saga once for the single published event. Asserts exactly ONE of everything:
 * one Payment Succeeded, one processed-webhook row, one PaymentSucceeded publish,
 * one BookingConfirmed outbox row (+ booking Confirmed, hold committed).
 *
 * Goes through Ken's `Payment` / `ProcessedWebhookEvent` aggregates and his
 * `BookingCheckoutSaga`, so it is RED until those fill files are implemented.
 * Requires Docker.
 */
jest.setTimeout(180_000);

const INTENT_ID = 'pi_test_idempotency';
const EVENT_ID = 'evt_test_idempotency';

/** Fake ACL: signature already "verified", returns a fixed succeeded event. */
const fakeGateway: PaymentGatewayPort = {
  createIntent: jest.fn(),
  verifyAndParse: (): TranslatedPaymentEvent => ({
    eventId: EVENT_ID,
    type: 'succeeded',
    paymentIntentId: INTENT_ID,
  }),
};

describe('HandleStripeWebhook (integration — idempotent on event.id)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let handler: HandleStripeWebhookHandler;
  let saga: BookingCheckoutSaga;
  let publish: jest.Mock;

  const listingId = randomUUID();
  const holdId = randomUUID();
  const bookingId = randomUUID();
  const guestId = randomUUID();
  let paymentId: string;

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

    // Seed: a pending booking + active hold + pending payment for the intent.
    await prisma.hold.create({
      data: {
        id: holdId,
        listingId,
        checkIn: new Date('2026-09-01T00:00:00.000Z'),
        checkOut: new Date('2026-09-04T00:00:00.000Z'),
        status: 'active',
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    await prisma.booking.create({
      data: {
        id: bookingId,
        guestId,
        listingId,
        holdId,
        checkIn: new Date('2026-09-01T00:00:00.000Z'),
        checkOut: new Date('2026-09-04T00:00:00.000Z'),
        partySize: 2,
        status: 'PendingPayment',
        priceSnapshot: 33_000,
        holdExpiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    paymentId = randomUUID();
    await prisma.payment.create({
      data: {
        id: paymentId,
        bookingId,
        amount: 33_000,
        currency: 'USD',
        status: 'Pending',
        stripePaymentIntentId: INTENT_ID,
      },
    });

    publish = jest.fn();

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
        HandleStripeWebhookHandler,
        BookingCheckoutSaga,
        { provide: TransactionManagerPort, useClass: ClsTransactionManager },
        { provide: PaymentGatewayPort, useValue: fakeGateway },
        { provide: PaymentRepositoryPort, useClass: PaymentRepository },
        {
          provide: ProcessedWebhookEventRepositoryPort,
          useClass: ProcessedWebhookEventRepository,
        },
        { provide: PaymentLookupPort, useClass: PaymentLookupQuery },
        { provide: BookingRepositoryPort, useClass: BookingRepository },
        { provide: HoldRepositoryPort, useClass: HoldRepository },
        { provide: OutboxPort, useClass: PrismaOutbox },
        { provide: EventBus, useValue: { publish } },
      ],
    }).compile();

    handler = moduleRef.get(HandleStripeWebhookHandler);
    saga = moduleRef.get(BookingCheckoutSaga);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('processes a duplicate delivery exactly once and confirms via the saga once', async () => {
    const command = new HandleStripeWebhookCommand(Buffer.from('{}'), 'sig');

    // Deliver the SAME event twice.
    await handler.execute(command);
    await handler.execute(command);

    // Payment marked Succeeded once; ledger has a single row; published once.
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(payment?.status).toBe('Succeeded');
    const ledger = await prisma.processedWebhookEvent.count({
      where: { eventId: EVENT_ID },
    });
    expect(ledger).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);

    // Drive the saga for the single published event (mirrors the EventBus trigger).
    const published = publish.mock.calls[0][0] as PaymentSucceededEvent;
    await saga.onPaymentSucceeded(published.paymentId);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    const hold = await prisma.hold.findUnique({ where: { id: holdId } });
    expect(booking?.status).toBe('Confirmed');
    expect(hold?.status).toBe('committed');

    const outbox = await prisma.outboxEvent.findMany({
      where: { type: 'BookingConfirmed', aggregateId: bookingId },
    });
    expect(outbox).toHaveLength(1);
  });
});
