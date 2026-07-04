import { Suspense } from 'react';
import { listingSearchQuery } from '@harbourstay/shared';
import { searchListings } from '@/lib/api/listings';
import { ListingCard } from '@/components/listing-card';
import { ListingSearchForm } from '@/components/listing-search-form';

// Always fetch fresh so results reflect the live read model on every load.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Normalize raw URL searchParams into the shared ListingSearchQuery. Unknown or
 * malformed params are dropped (partial parse) rather than throwing — a bad URL
 * should still browse, not crash. Returns {} on total failure.
 */
function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
) {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const candidate = {
    location: first(raw.location) || undefined,
    from: first(raw.from) || undefined,
    to: first(raw.to) || undefined,
    guests: first(raw.guests) || undefined,
  };
  const parsed = listingSearchQuery.safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = parseSearchParams(await searchParams);
  const listings = await searchListings(query);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 p-6 sm:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">Find your stay</h1>
        <p className="text-sm text-gray-500">
          Search short-stay accommodation and tours.
        </p>
      </header>

      {/* useSearchParams in the form needs a Suspense boundary in App Router. */}
      <Suspense fallback={null}>
        <ListingSearchForm />
      </Suspense>

      <section aria-label="Search results">
        {listings.length === 0 ? (
          <div
            data-testid="listings-empty"
            className="rounded-xl border border-dashed border-gray-300 p-12 text-center"
          >
            <p className="text-base font-medium text-gray-900">
              No listings match your search
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Try widening your dates, guest count, or clearing the location.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500" data-testid="listings-count">
              {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
            </p>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => (
                <li key={listing.id}>
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
