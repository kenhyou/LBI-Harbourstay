import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';

/** Prisma unique-violation code (duplicate key). */
const PG_UNIQUE_VIOLATION = 'P2002';

/**
 * Prisma-backed delivery ledger for BC-8. The PK on `eventId` is the idempotency
 * guarantee: `markProcessed` swallows a duplicate-key error so a racing redelivery
 * cannot double-record (and therefore cannot double-send).
 */
@Injectable()
export class NotificationLogRepository extends NotificationLogPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async alreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.notificationLog.findUnique({
      where: { eventId },
    });
    return row !== null;
  }

  async markProcessed(eventId: string, type: string): Promise<void> {
    try {
      await this.prisma.notificationLog.create({ data: { eventId, type } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PG_UNIQUE_VIOLATION
      ) {
        return; // already logged by a concurrent delivery — idempotent no-op
      }
      throw error;
    }
  }
}
