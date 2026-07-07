import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { EventBus } from '@nestjs/cqrs';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { OutboxRelay } from './outbox-relay';
import { OutboxEventPublished } from './outbox-event-published.event';
import type { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Proves the Transactional Outbox relay delivers unsent rows and stamps them so
 * they are not re-delivered. Real Postgres via Testcontainers; the EventBus is a
 * spy. GREEN now — does not depend on any fill file. Requires Docker.
 */
jest.setTimeout(180_000);

describe('OutboxRelay (integration, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let publish: jest.Mock;
  let relay: OutboxRelay;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    const apiRoot = join(__dirname, '..', '..', '..');
    execFileSync(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
      { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
    );

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
    publish = jest.fn();
    relay = new OutboxRelay(
      prisma as unknown as PrismaService,
      { publish } as unknown as EventBus,
    );
  });

  it('publishes an unsent row, stamps publishedAt, and does not re-deliver it', async () => {
    const aggregateId = randomUUID();
    const row = await prisma.outboxEvent.create({
      data: {
        aggregateId,
        type: 'BookingConfirmed',
        payload: { bookingId: aggregateId, priceSnapshot: 33_000 },
      },
    });

    const firstCount = await relay.publishPending();
    expect(firstCount).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);

    const published = publish.mock.calls[0][0] as OutboxEventPublished;
    expect(published).toBeInstanceOf(OutboxEventPublished);
    expect(published.id).toBe(row.id);
    expect(published.type).toBe('BookingConfirmed');
    expect(published.aggregateId).toBe(aggregateId);
    expect(published.payload).toMatchObject({ bookingId: aggregateId });

    const stamped = await prisma.outboxEvent.findUnique({ where: { id: row.id } });
    expect(stamped?.publishedAt).not.toBeNull();

    // A second tick finds nothing unsent — no duplicate publish.
    publish.mockClear();
    const secondCount = await relay.publishPending();
    expect(secondCount).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
