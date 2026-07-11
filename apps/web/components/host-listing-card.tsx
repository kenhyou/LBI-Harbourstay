import Link from 'next/link';
import type { HostListingSummary } from '@harbourstay/shared';
import { formatPrice } from '@/lib/format';
import { HostListingStatusBadge } from './host-listing-status-badge';
import { PublishToggle } from './publish-toggle';

/**
 * One row on the host dashboard. Server Component: renders the listing summary
 * (title, status badge, meta, price) plus an Edit link and the client-side
 * PublishToggle. `basePrice` arrives in minor units and is formatted to dollars
 * at the display edge via `formatPrice` (ADR-0005).
 */
export function HostListingCard({ listing }: { listing: HostListingSummary }) {
  return (
    <article
      data-testid="host-listing-card"
      data-status={listing.status}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          className="font-semibold leading-snug text-gray-900"
          data-testid="host-listing-title"
        >
          {listing.title}
        </h2>
        <HostListingStatusBadge status={listing.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
        <span className="capitalize">{listing.type}</span>
        <span aria-hidden="true">·</span>
        <span>{listing.location}</span>
        <span aria-hidden="true">·</span>
        <span>
          {listing.capacity} {listing.capacity === 1 ? 'guest' : 'guests'}
        </span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-gray-900">
          {formatPrice(listing.basePrice)}/night
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <Link
          href={`/host/listings/${listing.id}/edit`}
          data-testid="host-listing-edit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          Edit
        </Link>
        <PublishToggle listing={listing} />
      </div>
    </article>
  );
}
