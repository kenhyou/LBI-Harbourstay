import Link from 'next/link';
import { cookies } from 'next/headers';
import type { BookingDetail } from '@harbourstay/shared';
import { getMyBookings } from '@/lib/api/bookings';
import { requireUser } from '@/lib/auth/session';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { formatPrice } from '@/lib/format';
import { longDateLabel } from '@/lib/dates';

// Protected + per-request: always read the live list, never cache.
export const dynamic = 'force-dynamic';

export default async function MyBookingsPage() {
  // Server-side guard: a signed-out guest is bounced to /login?next=here.
  await requireUser('/account/bookings');

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const bookings = await getMyBookings(cookieHeader);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Your bookings</h1>
        <p className="text-sm text-gray-500">
          Every stay you’ve reserved, newest first.
        </p>
      </header>

      {bookings.length === 0 ? (
        <section
          data-testid="bookings-empty"
          className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-gray-300 p-8"
        >
          <h2 className="text-lg font-semibold">No bookings yet</h2>
          <p className="text-sm text-gray-600">
            When you reserve a stay it’ll show up here.
          </p>
          <Link
            href="/listings"
            className="w-fit rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            Browse stays
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <BookingListCard booking={booking} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * One row in the my-bookings list. Server Component — links to the durable
 * "manage this booking" detail page. Shows the cancelled + refunded line only
 * when the booking has actually been cancelled (both fields non-null).
 */
function BookingListCard({ booking }: { booking: BookingDetail }) {
  const isCancelled =
    booking.status === 'Cancelled' && booking.refundAmount !== null;

  return (
    <Link
      href={`/account/bookings/${booking.id}`}
      data-testid="booking-card"
      data-status={booking.status}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          className="font-semibold leading-snug text-gray-900"
          data-testid="booking-card-title"
        >
          {booking.listingTitle}
        </h2>
        <BookingStatusBadge status={booking.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
        <span data-testid="booking-card-dates">
          {longDateLabel(booking.checkIn)} → {longDateLabel(booking.checkOut)}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {booking.nights} {booking.nights === 1 ? 'night' : 'nights'}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {booking.partySize} {booking.partySize === 1 ? 'guest' : 'guests'}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
        <span className="text-gray-500">Total</span>
        <span className="font-semibold text-gray-900" data-testid="booking-card-total">
          {formatPrice(booking.priceSnapshot)}
        </span>
      </div>

      {isCancelled && (
        <p
          data-testid="booking-card-refund"
          className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          Cancelled — refunded {formatPrice(booking.refundAmount ?? 0)}
        </p>
      )}
    </Link>
  );
}
