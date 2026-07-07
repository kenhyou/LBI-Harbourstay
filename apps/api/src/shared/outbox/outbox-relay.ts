import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { OutboxEventPublished } from '@/shared/outbox/outbox-event-published.event';

/** Max rows drained per relay tick (keeps a single cycle bounded). */
const BATCH_SIZE = 100;

/**
 * Polling relay for the Transactional Outbox. On an interval it drains rows where
 * `publishedAt IS NULL`, publishes each on the CQRS `EventBus`, then stamps
 * `publishedAt`. Publish-then-stamp gives AT-LEAST-ONCE delivery: a crash between
 * the two re-publishes next tick, so consumers MUST be idempotent (Notifications
 * dedups on the outbox row id).
 *
 * `publishPending()` is public + returns a count so integration tests can drive it
 * deterministically instead of waiting for the timer.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  @Interval(5000)
  async publishPending(): Promise<number> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of rows) {
      this.eventBus.publish(
        new OutboxEventPublished(
          row.id,
          row.type,
          row.aggregateId,
          (row.payload ?? {}) as Record<string, unknown>,
        ),
      );
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { publishedAt: new Date() },
      });
    }

    if (rows.length > 0) {
      this.logger.debug(`Relayed ${rows.length} outbox event(s)`);
    }
    return rows.length;
  }
}
