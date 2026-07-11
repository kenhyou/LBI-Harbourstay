import type { BookingStatus } from '@harbourstay/shared';

/**
 * Presentational status pill for a booking. Server Component (no interactivity).
 * Maps each lifecycle status to a human label + a colour scheme; falls back to a
 * neutral style for any status not in the map so an unexpected value never
 * renders unstyled.
 */
const STATUS_STYLES: Record<BookingStatus, { label: string; className: string }> =
  {
    PendingPayment: {
      label: 'Pending payment',
      className: 'bg-amber-100 text-amber-800',
    },
    Confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800' },
    Completed: { label: 'Completed', className: 'bg-gray-100 text-gray-700' },
    Cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800' },
    Expired: { label: 'Expired', className: 'bg-gray-100 text-gray-500' },
    NoShow: { label: 'No show', className: 'bg-gray-100 text-gray-500' },
  };

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      data-testid="booking-status"
      data-status={status}
      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}
