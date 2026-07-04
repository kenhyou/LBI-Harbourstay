import type { ListingDetail } from '@harbourstay/shared';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';
import { GetListingDetailQuery } from '@/catalog/application/queries/get-listing-detail.query';
import { GetListingDetailQueryHandler } from './get-listing-detail.query.handler';

describe('GetListingDetailQueryHandler', () => {
  const detail: ListingDetail = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Harbour Loft',
    location: 'Wellington',
    basePrice: 18000,
    thumbnailUrl: null,
    description: 'A loft.',
    capacity: 4,
    type: 'stay',
    images: [],
  };

  it('returns the detail from the port, passing along dates', async () => {
    const port: ListingQueryPort = {
      search: jest.fn(),
      getDetail: jest.fn().mockResolvedValue(detail),
    };
    const handler = new GetListingDetailQueryHandler(port);

    const result = await handler.execute(
      new GetListingDetailQuery(detail.id, { from: '2026-08-01', to: '2026-08-05' }),
    );

    expect(port.getDetail).toHaveBeenCalledWith(detail.id, {
      from: '2026-08-01',
      to: '2026-08-05',
    });
    expect(result).toBe(detail);
  });

  it('propagates null for an unknown id (presenter turns this into 404)', async () => {
    const port: ListingQueryPort = {
      search: jest.fn(),
      getDetail: jest.fn().mockResolvedValue(null),
    };
    const handler = new GetListingDetailQueryHandler(port);

    const result = await handler.execute(new GetListingDetailQuery('missing'));

    expect(result).toBeNull();
  });
});
