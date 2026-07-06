import { GetAvailabilityHandler } from './get-availability.query.handler';
import { GetAvailabilityQuery } from '@/inventory/application/queries/get-availability.query';
import type { AvailabilityQueryPort } from '@/inventory/application/ports/availability.query.port';
import type { ListingAvailability } from '@harbourstay/shared';

/**
 * `GetAvailabilityHandler` spec (scaffold-owned, GREEN now). Port mocked; the
 * handler is a pure pass-through to the read projection.
 */
describe('GetAvailabilityHandler', () => {
  it('delegates to the query port and returns the read model', async () => {
    const expected: ListingAvailability = {
      listingId: '11111111-1111-4111-8111-111111111111',
      unavailable: [
        { checkIn: '2026-07-01', checkOut: '2026-07-04', reason: 'held' },
      ],
    };
    const port: jest.Mocked<AvailabilityQueryPort> = {
      getUnavailable: jest.fn().mockResolvedValue(expected),
    };
    const handler = new GetAvailabilityHandler(port);

    const result = await handler.execute(
      new GetAvailabilityQuery(expected.listingId, '2026-07-01', '2026-07-31'),
    );

    expect(port.getUnavailable).toHaveBeenCalledWith(
      expected.listingId,
      '2026-07-01',
      '2026-07-31',
    );
    expect(result).toBe(expected);
  });
});
