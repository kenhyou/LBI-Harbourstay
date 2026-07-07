import { BookingConfirmedNotificationHandler } from './booking-confirmed.notification-handler';
import { MailerPort } from '@/notifications/application/ports/mailer.port';
import { NotificationLogPort } from '@/notifications/application/ports/notification-log.port';
import { OutboxEventPublished } from '@/shared/outbox/outbox-event-published.event';
import { BOOKING_CONFIRMED } from '@/booking/domain/events/booking-confirmed.event';

/**
 * Unit spec for the Notifications outbox consumer. Ports mocked. Proves it sends on
 * BookingConfirmed, ignores other types, and is IDEMPOTENT on the outbox row id.
 */
describe('BookingConfirmedNotificationHandler', () => {
  let mailer: jest.Mocked<MailerPort>;
  let log: jest.Mocked<NotificationLogPort>;
  let handler: BookingConfirmedNotificationHandler;

  const payload = {
    bookingId: 'b-1',
    guestId: 'g-1',
    listingId: 'l-1',
    checkIn: '2026-08-01',
    checkOut: '2026-08-04',
    priceSnapshot: 33_000,
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
    handler = new BookingConfirmedNotificationHandler(mailer, log);
  });

  it('sends the confirmation email and records delivery for a fresh BookingConfirmed', async () => {
    await handler.handle(event(BOOKING_CONFIRMED));
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith(
      'g-1',
      'booking-confirmed',
      expect.objectContaining({ bookingId: 'b-1' }),
    );
    expect(log.markProcessed).toHaveBeenCalledWith('outbox-1', BOOKING_CONFIRMED);
  });

  it('ignores outbox events of other types', async () => {
    await handler.handle(event('SomethingElse'));
    expect(mailer.send).not.toHaveBeenCalled();
    expect(log.markProcessed).not.toHaveBeenCalled();
  });

  it('is idempotent — does NOT re-send an already-processed event id', async () => {
    log.alreadyProcessed.mockResolvedValue(true);
    await handler.handle(event(BOOKING_CONFIRMED));
    expect(mailer.send).not.toHaveBeenCalled();
    expect(log.markProcessed).not.toHaveBeenCalled();
  });
});
