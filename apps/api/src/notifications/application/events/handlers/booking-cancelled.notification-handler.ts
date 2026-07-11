import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OutboxEventPublished } from '@/shared/outbox/outbox-event-published.event';
import {
  BOOKING_CANCELLED,
  type BookingCancelledPayload,
} from '@/booking/domain/events/booking-cancelled.event';
import { MailerPort } from '@/notifications/application/ports/mailer.port';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';

/**
 * BC-8 outbox consumer for `BookingCancelled`. Reacts to the relay's
 * `OutboxEventPublished`, filters to `BookingCancelled`, and sends the cancellation
 * email — IDEMPOTENTLY on the outbox row id (at-least-once delivery must not
 * double-send). A send failure retries and must NEVER roll back the cancellation
 * (its txn already committed). Mirrors the S4 `BookingConfirmed` consumer.
 *
 * NOTE(MVP): the recipient here is the guestId; resolving the guest's real email
 * (a lookup into Identity) is a follow-up — the test mailer only logs/stores. The
 * `refundAmount` in the payload is what the email would show ("refunded $X").
 */
@EventsHandler(OutboxEventPublished)
export class BookingCancelledNotificationHandler
  implements IEventHandler<OutboxEventPublished>
{
  constructor(
    private readonly mailer: MailerPort,
    private readonly log: NotificationLogPort,
  ) {}

  async handle(event: OutboxEventPublished): Promise<void> {
    if (event.type !== BOOKING_CANCELLED) {
      return; // not our event type
    }
    if (await this.log.alreadyProcessed(event.id)) {
      return; // duplicate delivery — already emailed
    }

    const payload = event.payload as unknown as BookingCancelledPayload;
    await this.mailer.send(payload.guestId, 'booking-cancelled', event.payload);
    await this.log.markProcessed(event.id, event.type);
  }
}
