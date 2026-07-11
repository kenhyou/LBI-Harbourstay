import { GetBookingHandler } from './get-booking.query.handler';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';
import type { BookingQueryPort } from '@/booking/application/ports/booking.query.port';
import type { BookingDetail } from '@harbourstay/shared';

/**
 * `GetBookingHandler` spec (scaffold-owned, GREEN now — no domain). Port mocked;
 * the handler is a pure ownership-scoped pass-through returning the full
 * `bookingDetail`. Returns `null` when the port reports the booking is unknown or
 * not owned by the guest.
 */
describe('GetBookingHandler', () => {
  const detail: BookingDetail = {
    id: '44444444-4444-4444-8444-444444444444',
    listingId: '22222222-2222-4222-8222-222222222222',
    listingTitle: 'Harbour Loft',
    status: 'PendingPayment',
    checkIn: '2026-07-01',
    checkOut: '2026-07-04',
    nights: 3,
    partySize: 2,
    priceSnapshot: 33_000,
    currency: 'USD',
    createdAt: '2026-06-29T00:00:00.000Z',
    cancelledAt: null,
    refundAmount: null,
  };

  function build() {
    const port: jest.Mocked<BookingQueryPort> = {
      findDetailByIdForGuest: jest.fn(),
      listForGuest: jest.fn(),
    };
    return { port, handler: new GetBookingHandler(port) };
  }

  it('returns the detail for the owning guest, forwarding id + guestId', async () => {
    const { handler, port } = build();
    port.findDetailByIdForGuest.mockResolvedValue(detail);

    const result = await handler.execute(
      new GetBookingQuery(detail.id, 'guest-1'),
    );

    expect(port.findDetailByIdForGuest).toHaveBeenCalledWith(detail.id, 'guest-1');
    expect(result).toBe(detail);
  });

  it('returns null when the port finds nothing (unknown or not owned)', async () => {
    const { handler, port } = build();
    port.findDetailByIdForGuest.mockResolvedValue(null);

    await expect(
      handler.execute(new GetBookingQuery('nope', 'guest-1')),
    ).resolves.toBeNull();
  });
});
