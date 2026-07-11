import { BookingCancelledNotificationHandler } from './booking-cancelled.notification-handler';
import { MailerPort } from '@/notifications/application/ports/mailer.port';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';
import { OutboxEventPublished } from '@/shared/outbox/outbox-event-published.event';
import { BOOKING_CANCELLED } from '@/booking/domain/events/booking-cancelled.event';

/**
 * Unit spec for the Notifications outbox consumer of `BookingCancelled` (scaffold —
 * GREEN now; ports mocked). Proves it sends on BookingCancelled, ignores other
 * types, and is IDEMPOTENT on the outbox row id.
 */
describe('BookingCancelledNotificationHandler', () => {
  let mailer: jest.Mocked<MailerPort>;
  let log: jest.Mocked<NotificationLogPort>;
  let handler: BookingCancelledNotificationHandler;

  const payload = {
    bookingId: 'b-1',
    guestId: 'g-1',
    listingId: 'l-1',
    cancelledAt: '2026-07-11T12:00:00.000Z',
    refundAmount: 16_500,
  };

  function event(type: string, id = 'outbox-1'): OutboxEventPublished {
    return new OutboxEventPublished(id, type, 'b-1', payload);
  }

  beforeEach(() => {
    mailer = { send: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MailerPort>;
    log = {
      alreadyProcessed: jest.fn().mockResolvedValue(false),
      markProcessed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationLogPort>;
    handler = new BookingCancelledNotificationHandler(mailer, log);
  });

  it('sends the cancellation email and records delivery for a fresh BookingCancelled', async () => {
    await handler.handle(event(BOOKING_CANCELLED));
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      'g-1',
      'booking-cancelled',
      expect.objectContaining({ bookingId: 'b-1', refundAmount: 16_500 }),
    );
    expect(log.markProcessed).toHaveBeenCalledWith('outbox-1', BOOKING_CANCELLED);
  });

  it('ignores outbox events of other types', async () => {
    await handler.handle(event('SomethingElse'));
    expect(mailer.send).not.toHaveBeenCalled();
    expect(log.markProcessed).not.toHaveBeenCalled();
  });

  it('is idempotent — does NOT re-send an already-processed event id', async () => {
    log.alreadyProcessed.mockResolvedValue(true);
    await handler.handle(event(BOOKING_CANCELLED));
    expect(mailer.send).not.toHaveBeenCalled();
    expect(log.markProcessed).not.toHaveBeenCalled();
  });
});
