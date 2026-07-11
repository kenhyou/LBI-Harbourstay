import type { ListingStatus } from '@harbourstay/shared';

/**
 * Presentational publication-status pill for a host listing. Server Component
 * (no interactivity). Published = live/guest-visible (green); Unpublished =
 * hidden draft (gray). Falls back to a neutral style for any unexpected value so
 * it never renders unstyled.
 */
const STATUS_STYLES: Record<ListingStatus, { label: string; className: string }> =
  {
    Published: { label: 'Published', className: 'bg-green-100 text-green-800' },
    Unpublished: { label: 'Unpublished', className: 'bg-gray-100 text-gray-600' },
  };

export function HostListingStatusBadge({ status }: { status: ListingStatus }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      data-testid="listing-status"
      data-status={status}
      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}
