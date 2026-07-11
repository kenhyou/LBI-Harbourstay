import { Listing, type NewListingProps } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';
import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';
import { InvalidListingStateException } from '@/inventory/domain/exceptions/invalid-listing-state.exception';

const HOST = 'host-aaaa-0000-0000-000000000001';

function validProps(overrides: Partial<NewListingProps> = {}): NewListingProps {
  return {
    hostId: HOST,
    title: 'Harbour Loft',
    description: 'A bright loft over the marina.',
    type: ListingType.Stay,
    location: 'Wellington',
    capacity: 4,
    basePrice: 18_000,
    images: ['https://img.test/a.jpg'],
    ...overrides,
  };
}

describe('Listing (aggregate)', () => {
  describe('create', () => {
    it('mints an id, stamps the host, and starts Unpublished by default', () => {
      const listing = Listing.create(validProps());

      expect(listing.id).toEqual(expect.any(String));
      expect(listing.hostId).toBe(HOST);
      expect(listing.status).toBe(ListingStatus.Unpublished); // never live by accident
      expect(listing.title).toBe('Harbour Loft');
      expect(listing.capacity).toBe(4);
      expect(listing.basePrice).toBe(18_000);
      expect(listing.type).toBe(ListingType.Stay);
      expect(listing.images).toEqual(['https://img.test/a.jpg']);
      expect(listing.createdAt).toBeInstanceOf(Date);
    });

    it('gives each created listing a distinct id', () => {
      expect(Listing.create(validProps()).id).not.toBe(
        Listing.create(validProps()).id,
      );
    });

    it('rejects an empty title', () => {
      expect(() => Listing.create(validProps({ title: '   ' }))).toThrow(
        InvalidListingDetailsException,
      );
    });

    it('rejects a capacity below 1 (via the Capacity VO)', () => {
      expect(() => Listing.create(validProps({ capacity: 0 }))).toThrow(
        InvalidListingDetailsException,
      );
    });

    it('rejects a negative base price (via the Money VO)', () => {
      expect(() => Listing.create(validProps({ basePrice: -1 }))).toThrow();
    });

    it('does not alias the caller-supplied images array', () => {
      const images = ['https://img.test/a.jpg'];
      const listing = Listing.create(validProps({ images }));
      images.push('https://img.test/injected.jpg');
      expect(listing.images).toHaveLength(1); // internal copy is unaffected
    });
  });

  describe('updateDetails', () => {
    it('full-replaces the editable fields, leaving id/host/status/createdAt intact', () => {
      const listing = Listing.create(validProps());
      const { id, hostId, status, createdAt } = {
        id: listing.id,
        hostId: listing.hostId,
        status: listing.status,
        createdAt: listing.createdAt,
      };

      listing.updateDetails({
        title: 'Renamed Loft',
        description: 'Updated copy.',
        type: ListingType.Tour,
        location: 'Auckland',
        capacity: 2,
        basePrice: 9_900,
        images: [],
      });

      expect(listing.title).toBe('Renamed Loft');
      expect(listing.type).toBe(ListingType.Tour);
      expect(listing.location).toBe('Auckland');
      expect(listing.capacity).toBe(2);
      expect(listing.basePrice).toBe(9_900);
      expect(listing.images).toEqual([]);

      // Untouched by an edit:
      expect(listing.id).toBe(id);
      expect(listing.hostId).toBe(hostId);
      expect(listing.status).toBe(status);
      expect(listing.createdAt).toEqual(createdAt);
    });

    it('re-enforces the invariants on edit (empty title rejected)', () => {
      const listing = Listing.create(validProps());
      expect(() =>
        listing.updateDetails({
          title: '',
          description: 'x',
          type: ListingType.Stay,
          location: 'Wellington',
          capacity: 4,
          basePrice: 18_000,
          images: [],
        }),
      ).toThrow(InvalidListingDetailsException);
    });

    it('re-enforces capacity on edit (capacity < 1 rejected)', () => {
      const listing = Listing.create(validProps());
      expect(() =>
        listing.updateDetails({
          title: 'Still Valid',
          description: 'x',
          type: ListingType.Stay,
          location: 'Wellington',
          capacity: 0,
          basePrice: 18_000,
          images: [],
        }),
      ).toThrow(InvalidListingDetailsException);
    });
  });

  describe('publish / unpublish (state machine)', () => {
    it('publishes an Unpublished listing', () => {
      const listing = Listing.create(validProps());
      listing.publish();
      expect(listing.status).toBe(ListingStatus.Published);
    });

    it('rejects publishing an already-Published listing (idempotency is a guard, not a no-op)', () => {
      const listing = Listing.create(validProps());
      listing.publish();
      expect(() => listing.publish()).toThrow(InvalidListingStateException);
    });

    it('unpublishes a Published listing', () => {
      const listing = Listing.create(validProps());
      listing.publish();
      listing.unpublish();
      expect(listing.status).toBe(ListingStatus.Unpublished);
    });

    it('rejects unpublishing an already-Unpublished listing', () => {
      const listing = Listing.create(validProps()); // starts Unpublished
      expect(() => listing.unpublish()).toThrow(InvalidListingStateException);
    });
  });

  describe('reconstitute', () => {
    it('faithfully restores a persisted snapshot (round-trips getters)', () => {
      const createdAt = new Date('2026-01-02T03:04:05.000Z');
      const listing = Listing.reconstitute({
        id: '33333333-3333-4333-8333-333333333333',
        hostId: HOST,
        title: 'Restored Villa',
        description: 'From the DB.',
        type: ListingType.Stay,
        location: 'Marlborough',
        capacity: 8,
        basePrice: 32_000,
        images: ['https://img.test/v.jpg'],
        status: ListingStatus.Published,
        createdAt,
      });

      expect(listing.id).toBe('33333333-3333-4333-8333-333333333333');
      expect(listing.hostId).toBe(HOST);
      expect(listing.status).toBe(ListingStatus.Published);
      expect(listing.capacity).toBe(8);
      expect(listing.basePrice).toBe(32_000);
      expect(listing.createdAt).toEqual(createdAt);
    });

    it('a reconstituted Published listing can be unpublished (state machine still holds)', () => {
      const listing = Listing.reconstitute({
        id: '44444444-4444-4444-8444-444444444444',
        hostId: HOST,
        title: 'Live Listing',
        description: 'x',
        type: ListingType.Stay,
        location: 'Wellington',
        capacity: 2,
        basePrice: 10_000,
        images: [],
        status: ListingStatus.Published,
        createdAt: new Date(),
      });
      listing.unpublish();
      expect(listing.status).toBe(ListingStatus.Unpublished);
    });
  });
});
