import Link from 'next/link';
import type { ListingSummary } from '@harbourstay/shared';
import { formatPrice } from '@/lib/format';

/**
 * A single search-result card. Server Component — no interactivity beyond the
 * link. Gracefully falls back to a placeholder when thumbnailUrl is null.
 */
export function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      data-testid="listing-card"
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {listing.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote hosts not configured for next/image in S1
          <img
            src={listing.thumbnailUrl}
            alt={`Photo of ${listing.title}`}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-sm text-gray-400"
            role="img"
            aria-label="No photo available"
          >
            No photo
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <h2 className="font-semibold leading-snug text-gray-900" data-testid="listing-card-title">
          {listing.title}
        </h2>
        <p className="text-sm text-gray-500">{listing.location}</p>
        <p className="mt-auto pt-2 text-sm text-gray-900">
          <span className="text-gray-500">from </span>
          <span className="font-semibold">{formatPrice(listing.basePrice)}</span>
        </p>
      </div>
    </Link>
  );
}
