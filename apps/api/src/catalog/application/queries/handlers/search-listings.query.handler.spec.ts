import type { ListingSummary } from '@harbourstay/shared';
import { ListingQueryPort } from '@/catalog/application/ports/listing.query.port';
import { SearchListingsQuery } from '@/catalog/application/queries/search-listings.query';
import { SearchListingsQueryHandler } from './search-listings.query.handler';

describe('SearchListingsQueryHandler', () => {
  const card: ListingSummary = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Harbour Loft',
    location: 'Wellington',
    basePrice: 18000,
    thumbnailUrl: null,
  };

  it('delegates the filters to the port and returns its cards', async () => {
    const port: ListingQueryPort = {
      search: jest.fn().mockResolvedValue([card]),
      getDetail: jest.fn(),
    };
    const handler = new SearchListingsQueryHandler(port);

    const result = await handler.execute(
      new SearchListingsQuery({ location: 'Wellington' }),
    );

    expect(port.search).toHaveBeenCalledWith({ location: 'Wellington' });
    expect(result).toEqual([card]);
  });
});
