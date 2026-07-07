import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { MailerPort } from '@/notifications/application/ports/mailer.port';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';
import { TestMailerAdapter } from '@/notifications/infra/adapters/test-mailer.adapter';
import { NotificationLogRepository } from '@/notifications/infra/repositories/notification-log.repository';
import { BookingConfirmedNotificationHandler } from '@/notifications/application/events/handlers/booking-confirmed.notification-handler';

/**
 * BC-8 Notifications (Generic — Outbox consumer). Binds the mailer + delivery
 * ledger ports to their impls and registers the `BookingConfirmed` outbox
 * consumer. No domain aggregate; reacts to the relay's `OutboxEventPublished`.
 */
@Module({
  imports: [CqrsModule, PrismaModule],
  providers: [
    { provide: MailerPort, useClass: TestMailerAdapter },
    { provide: NotificationLogPort, useClass: NotificationLogRepository },
    BookingConfirmedNotificationHandler,
  ],
})
export class NotificationsModule {}
