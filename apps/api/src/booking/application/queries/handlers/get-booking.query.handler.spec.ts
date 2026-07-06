import { GetBookingHandler } from './get-booking.query.handler';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';
import type { BookingQueryPort } from '@/booking/application/ports/booking.query.port';
import type { BookingSummary } from '@harbourstay/shared';

/**
 * `GetBookingHandler` spec (scaffold-owned, GREEN now — no domain). Port mocked;
 * the handler is a pure ownership-scoped pass-through. Returns `null` when the
 * port reports the booking is unknown or not owned by the guest.
 */
describe('GetBookingHandler', () => {
  const summary: BookingSummary = {
    id: '44444444-4444-4444-8444-444444444444',
    listingId: '22222222-2222-4222-8222-222222222222',
    status: 'PendingPayment',
    checkIn: '2026-07-01',
    checkOut: '2026-07-04',
    partySize: 2,
    priceSnapshot: 33_000,
    holdExpiresAt: '2026-06-30T00:00:00.000Z',
  };

  function build() {
    const port: jest.Mocked<BookingQueryPort> = {
      findByIdForGuest: jest.fn(),
    };
    return { port, handler: new GetBookingHandler(port) };
  }

  it('returns the summary for the owning guest, forwarding id + guestId', async () => {
    const { handler, port } = build();
    port.findByIdForGuest.mockResolvedValue(summary);

    const result = await handler.execute(
      new GetBookingQuery(summary.id, 'guest-1'),
    );

    expect(port.findByIdForGuest).toHaveBeenCalledWith(summary.id, 'guest-1');
    expect(result).toBe(summary);
  });

  it('returns null when the port finds nothing (unknown or not owned)', async () => {
    const { handler, port } = build();
    port.findByIdForGuest.mockResolvedValue(null);

    await expect(
      handler.execute(new GetBookingQuery('nope', 'guest-1')),
    ).resolves.toBeNull();
  });
});
