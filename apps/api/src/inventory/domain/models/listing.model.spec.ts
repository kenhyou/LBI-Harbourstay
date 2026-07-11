import { Listing, type NewListingProps } from '@/inventory/domain/models/listing.model';
import { ListingType } from '@/inventory/domain/enums/listing-type.enum';
import { ListingStatus } from '@/inventory/domain/enums/listing-status.enum';
import { DateRange } from '@/inventory/domain/vo/date-range.vo';
import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';
import { InvalidListingStateException } from '@/inventory/domain/exceptions/invalid-listing-state.exception';
import { InvalidDateRangeException } from '@/inventory/domain/exceptions/invalid-date-range.exception';
import { OverlappingBlockException } from '@/inventory/domain/exceptions/overlapping-block.exception';
import { BlockNotFoundException } from '@/inventory/domain/exceptions/block-not-found.exception';

/** A half-open `[in, out)` inventory range from two `YYYY-MM-DD` strings. */
function range(checkIn: string, checkOut: string): DateRange {
  return DateRange.create(
    new Date(`${checkIn}T00:00:00.000Z`),
    new Date(`${checkOut}T00:00:00.000Z`),
  );
}

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

  describe('block / unblock (availability blocks — S6b)', () => {
    it('a new listing starts with no blocks', () => {
      expect(Listing.create(validProps()).blocks).toEqual([]);
    });

    it('adds a block over a valid range and returns the new child entity', () => {
      const listing = Listing.create(validProps());

      const block = listing.block(range('2026-07-01', '2026-07-05'));

      expect(block.id).toEqual(expect.any(String));
      expect(listing.blocks).toHaveLength(1);
      expect(listing.blocks[0].id).toBe(block.id);
      expect(listing.blocks[0].range.checkIn).toEqual(
        new Date('2026-07-01T00:00:00.000Z'),
      );
    });

    it('allows two non-overlapping blocks', () => {
      const listing = Listing.create(validProps());
      listing.block(range('2026-07-01', '2026-07-05'));
      listing.block(range('2026-07-10', '2026-07-12'));
      expect(listing.blocks).toHaveLength(2);
    });

    it('allows a back-to-back block (half-open: touching ranges do NOT overlap)', () => {
      const listing = Listing.create(validProps());
      listing.block(range('2026-07-01', '2026-07-05'));
      // Starts exactly where the first ends — no overlap under [in, out).
      listing.block(range('2026-07-05', '2026-07-08'));
      expect(listing.blocks).toHaveLength(2);
    });

    it('rejects a block that overlaps an existing block (and does not add it)', () => {
      const listing = Listing.create(validProps());
      listing.block(range('2026-07-01', '2026-07-05'));

      expect(() => listing.block(range('2026-07-04', '2026-07-08'))).toThrow(
        OverlappingBlockException,
      );
      // The failed block was not appended.
      expect(listing.blocks).toHaveLength(1);
    });

    it('rejects an inverted/zero-night range at the DateRange VO (before the aggregate)', () => {
      // The range guard lives in the VO, so an invalid range can't even be built
      // to hand to block().
      expect(() => range('2026-07-05', '2026-07-05')).toThrow(
        InvalidDateRangeException,
      );
    });

    it('removes a block by id', () => {
      const listing = Listing.create(validProps());
      const block = listing.block(range('2026-07-01', '2026-07-05'));

      listing.unblock(block.id);

      expect(listing.blocks).toEqual([]);
    });

    it('after unblocking, the freed range can be blocked again (no ghost overlap)', () => {
      const listing = Listing.create(validProps());
      const first = listing.block(range('2026-07-01', '2026-07-05'));
      listing.unblock(first.id);
      // Would have thrown OverlappingBlockException if the old block lingered.
      expect(() => listing.block(range('2026-07-01', '2026-07-05'))).not.toThrow();
    });

    it('throws BlockNotFoundException when unblocking an unknown id', () => {
      const listing = Listing.create(validProps());
      expect(() => listing.unblock('no-such-block')).toThrow(
        BlockNotFoundException,
      );
    });

    it('does not let a caller add a block by mutating the getter result', () => {
      const listing = Listing.create(validProps());
      listing.blocks.push(
        // @ts-expect-error — deliberately abusing the returned copy in the test
        { id: 'x', range: range('2026-07-01', '2026-07-05') },
      );
      expect(listing.blocks).toEqual([]); // internal collection untouched
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

    it('rehydrates persisted blocks and enforces overlap against them', () => {
      const listing = Listing.reconstitute({
        id: '55555555-5555-4555-8555-555555555555',
        hostId: HOST,
        title: 'Blocked Villa',
        description: 'x',
        type: ListingType.Stay,
        location: 'Wellington',
        capacity: 2,
        basePrice: 10_000,
        images: [],
        status: ListingStatus.Published,
        createdAt: new Date(),
        blocks: [
          {
            id: 'block-1',
            checkIn: new Date('2026-08-01T00:00:00.000Z'),
            checkOut: new Date('2026-08-10T00:00:00.000Z'),
          },
        ],
      });

      expect(listing.blocks).toHaveLength(1);
      // A new block overlapping the rehydrated one is still rejected.
      expect(() => listing.block(range('2026-08-05', '2026-08-07'))).toThrow(
        OverlappingBlockException,
      );
    });
  });
});
