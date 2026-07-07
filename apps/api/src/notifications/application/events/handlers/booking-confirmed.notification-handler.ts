import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OutboxEventPublished } from '@/shared/outbox/outbox-event-published.event';
import {
  BOOKING_CONFIRMED,
  type BookingConfirmedPayload,
} from '@/booking/domain/events/booking-confirmed.event';
import { MailerPort } from '@/notifications/application/ports/mailer.port';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';

/**
 * BC-8 outbox consumer. Reacts to the relay's `OutboxEventPublished`, filters to
 * `BookingConfirmed`, and sends the confirmation email — IDEMPOTENTLY on the outbox
 * row id (at-least-once delivery must not double-send). A send failure retries and
 * must NEVER roll back a confirmed booking (the booking txn already committed).
 *
 * NOTE(MVP): the recipient here is the guestId; resolving the guest's real email
 * (a lookup into Identity) is a follow-up — the test mailer only logs/stores.
 */
@EventsHandler(OutboxEventPublished)
export class BookingConfirmedNotificationHandler
  implements IEventHandler<OutboxEventPublished>
{
  constructor(
    private readonly mailer: MailerPort,
    private readonly log: NotificationLogPort,
  ) {}

  async handle(event: OutboxEventPublished): Promise<void> {
    if (event.type !== BOOKING_CONFIRMED) {
      return; // not our event type
    }
    if (await this.log.alreadyProcessed(event.id)) {
      return; // duplicate delivery — already emailed
    }

    const payload = event.payload as unknown as BookingConfirmedPayload;
    await this.mailer.send(payload.guestId, 'booking-confirmed', event.payload);
    await this.log.markProcessed(event.id, event.type);
  }
}
