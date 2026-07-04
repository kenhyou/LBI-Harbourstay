import { PrismaClient, ListingType, ListingStatus } from '@prisma/client';

/**
 * S1 demo seed — ~7 listings (6 Published + 1 Unpublished to prove the filter),
 * varied locations/prices/types, a couple with images, plus availability blocks.
 *
 * Listing ids are DETERMINISTIC UUIDs so integration tests and Playwright can
 * deep-link (`/listings/<id>`) without first querying for one.
 */

const prisma = new PrismaClient();

// Deterministic UUIDs (v4-shaped, hand-fixed) — stable across re-seeds.
const IDS = {
  harbourLoft: '11111111-1111-4111-8111-111111111111',
  cliffCabin: '22222222-2222-4222-8222-222222222222',
  cityStudio: '33333333-3333-4333-8333-333333333333',
  vineyardVilla: '44444444-4444-4444-8444-444444444444',
  kayakTour: '55555555-5555-4555-8555-555555555555',
  lighthouseWalk: '66666666-6666-4666-8666-666666666666',
  hiddenDraft: '77777777-7777-4777-8777-777777777777',
} as const;

const HOST_ID = '00000000-0000-4000-8000-000000000001';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  // Idempotent: FK cascade clears blocks when listings go.
  await prisma.availabilityBlock.deleteMany();
  await prisma.listing.deleteMany();

  await prisma.listing.createMany({
    data: [
      {
        id: IDS.harbourLoft,
        hostId: HOST_ID,
        title: 'Harbour Loft with Sea View',
        description:
          'A bright top-floor loft overlooking the marina. Floor-to-ceiling windows, walkable to the ferry.',
        type: ListingType.stay,
        location: 'Wellington',
        capacity: 4,
        basePrice: 18000,
        images: [
          'https://picsum.photos/seed/harbour-loft-1/800/600',
          'https://picsum.photos/seed/harbour-loft-2/800/600',
        ],
        status: ListingStatus.Published,
      },
      {
        id: IDS.cliffCabin,
        hostId: HOST_ID,
        title: 'Cliffside Cabin',
        description:
          'Off-grid cabin perched above the bay. Wood stove, outdoor bath, endless quiet.',
        type: ListingType.stay,
        location: 'Kaikoura',
        capacity: 2,
        basePrice: 12500,
        images: ['https://picsum.photos/seed/cliff-cabin-1/800/600'],
        status: ListingStatus.Published,
      },
      {
        id: IDS.cityStudio,
        hostId: HOST_ID,
        title: 'Central City Studio',
        description:
          'Compact modern studio in the heart of the CBD. Perfect base for a short city break.',
        type: ListingType.stay,
        location: 'Auckland',
        capacity: 2,
        basePrice: 9900,
        images: [],
        status: ListingStatus.Published,
      },
      {
        id: IDS.vineyardVilla,
        hostId: HOST_ID,
        title: 'Vineyard Villa',
        description:
          'Spacious villa among the vines with a large deck and BBQ. Sleeps a group comfortably.',
        type: ListingType.stay,
        location: 'Marlborough',
        capacity: 8,
        basePrice: 32000,
        images: ['https://picsum.photos/seed/vineyard-villa-1/800/600'],
        status: ListingStatus.Published,
      },
      {
        id: IDS.kayakTour,
        hostId: HOST_ID,
        title: 'Sunrise Kayak Tour',
        description:
          'Guided two-hour sea-kayak tour at sunrise. All gear provided; suitable for beginners.',
        type: ListingType.tour,
        location: 'Abel Tasman',
        capacity: 6,
        basePrice: 8500,
        images: ['https://picsum.photos/seed/kayak-tour-1/800/600'],
        status: ListingStatus.Published,
      },
      {
        id: IDS.lighthouseWalk,
        hostId: HOST_ID,
        title: 'Historic Lighthouse Walk',
        description:
          'A guided coastal walk to the historic lighthouse with local history along the way.',
        type: ListingType.tour,
        location: 'Wellington',
        capacity: 12,
        basePrice: 4500,
        images: [],
        status: ListingStatus.Published,
      },
      {
        // Unpublished — must NEVER appear in search or detail results.
        id: IDS.hiddenDraft,
        hostId: HOST_ID,
        title: 'Unlisted Draft Retreat',
        description: 'A work-in-progress listing that is not yet live.',
        type: ListingType.stay,
        location: 'Queenstown',
        capacity: 3,
        basePrice: 15000,
        images: [],
        status: ListingStatus.Unpublished,
      },
    ],
  });

  // Availability blocks feed the indicative-availability hint.
  // harbourLoft has a BLOCKED range (looks unavailable for those dates);
  // cliffCabin is open (a non-blocked block, i.e. offered availability).
  await prisma.availabilityBlock.createMany({
    data: [
      {
        listingId: IDS.harbourLoft,
        checkIn: d('2026-08-01'),
        checkOut: d('2026-08-05'),
        isBlocked: true,
      },
      {
        listingId: IDS.cliffCabin,
        checkIn: d('2026-08-01'),
        checkOut: d('2026-08-31'),
        price: 13000,
        isBlocked: false,
      },
    ],
  });

  const count = await prisma.listing.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded ${count} listings (6 Published + 1 Unpublished).`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
