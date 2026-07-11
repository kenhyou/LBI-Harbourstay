import { GetHostListingDetailHandler } from './get-host-listing-detail.query.handler';
import { GetHostListingDetailQuery } from '@/inventory/application/queries/get-host-listing-detail.query';
import type { HostListingsQueryPort } from '@/inventory/application/ports/host-listings.query.port';
import type { HostListingDetail } from '@harbourstay/shared';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';

const HOST = 'aaaaaaaa-0000-4000-8000-000000000001';

const detail: HostListingDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Harbour Loft',
  description: 'A bright loft.',
  location: 'Wellington',
  type: 'stay',
  capacity: 4,
  basePrice: 18_000,
  images: ['https://img.test/a.jpg'],
  status: 'Unpublished',
  createdAt: new Date().toISOString(),
};

describe('GetHostListingDetailHandler', () => {
  let listings: jest.Mocked<HostListingsQueryPort>;
  let handler: GetHostListingDetailHandler;

  beforeEach(() => {
    listings = {
      listForHost: jest.fn(),
      getDetailForHost: jest.fn(),
    } as unknown as jest.Mocked<HostListingsQueryPort>;
    handler = new GetHostListingDetailHandler(listings);
  });

  it('returns the full detail when the host owns the listing', async () => {
    listings.getDetailForHost.mockResolvedValue(detail);

    const result = await handler.execute(
      new GetHostListingDetailQuery(HOST, detail.id),
    );

    expect(listings.getDetailForHost).toHaveBeenCalledWith(detail.id, HOST);
    expect(result).toBe(detail);
  });

  it('throws ListingNotFoundException (404 no-leak) when the port returns null', async () => {
    // The port returns null both for "unknown id" and "owned by another host" —
    // the handler cannot tell them apart, which is the point.
    listings.getDetailForHost.mockResolvedValue(null);

    await expect(
      handler.execute(new GetHostListingDetailQuery(HOST, 'someone-elses-id')),
    ).rejects.toBeInstanceOf(ListingNotFoundException);
  });
});
