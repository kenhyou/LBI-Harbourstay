import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getListing, ListingNotFoundError } from '@/lib/api/listings';
import { ListingGallery } from '@/components/listing-gallery';
import { BookingWidget } from '@/components/booking-widget';
import { getCurrentUser } from '@/lib/auth/session';

// Always fetch fresh from the live read model.
export const dynamic = 'force-dynamic';

const typeLabel: Record<'stay' | 'tour', string> = {
  stay: 'Stay',
  tour: 'Tour',
};

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Server-read session: signed-out guests get a "Log in to reserve" button that
  // routes to /login?next= rather than attempting a doomed POST.
  const user = await getCurrentUser();

  let listing;
  try {
    listing = await getListing(id);
  } catch (err) {
    // Unknown id → render the framework 404. Any other error bubbles to error.tsx.
    if (err instanceof ListingNotFoundError) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 sm:p-8">
      <nav>
        <Link
          href="/listings"
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          ← Back to search
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-600">
          {typeLabel[listing.type]}
        </span>
        <h1 className="text-3xl font-bold" data-testid="listing-detail-title">
          {listing.title}
        </h1>
        <p className="text-gray-500">{listing.location}</p>
      </header>

      <ListingGallery images={listing.images} title={listing.title} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_18rem]">
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="mb-2 text-lg font-semibold">About this {listing.type}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {listing.description}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6 text-sm sm:max-w-sm">
            <div>
              <dt className="text-gray-500">Sleeps / capacity</dt>
              <dd className="font-medium text-gray-900">
                {listing.capacity} {listing.capacity === 1 ? 'guest' : 'guests'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Type</dt>
              <dd className="font-medium text-gray-900">{typeLabel[listing.type]}</dd>
            </div>
          </dl>
        </section>

        <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <BookingWidget
            listingId={listing.id}
            capacity={listing.capacity}
            basePrice={listing.basePrice}
            isAuthenticated={user !== null}
          />
        </aside>
      </div>
    </main>
  );
}
