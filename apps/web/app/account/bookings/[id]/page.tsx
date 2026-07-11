import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getBookingDetail, BookingNotFoundError } from '@/lib/api/bookings';
import { requireUser } from '@/lib/auth/session';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { CancelBookingDialog } from '@/components/cancel-booking-dialog';
import { formatPrice } from '@/lib/format';
import { longDateLabel } from '@/lib/dates';

// Always fetch the live booking so the status + cancellation fields are current.
export const dynamic = 'force-dynamic';

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Server-side guard: a signed-out guest is bounced to /login?next=here.
  await requireUser(`/account/bookings/${id}`);

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let booking;
  try {
    booking = await getBookingDetail(id, cookieHeader);
  } catch (err) {
    if (err instanceof BookingNotFoundError) notFound();
    throw err;
  }

  // Coarse, status-based decision to MOUNT the cancel dialog. The dialog itself
  // does the fine-grained time-tier preview (and may say "can no longer be
  // cancelled"); the backend policy is the final authority on confirm.
  const isCancellable =
    booking.status === 'PendingPayment' || booking.status === 'Confirmed';
  const isCancelled =
    booking.status === 'Cancelled' && booking.cancelledAt !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <nav>
        <Link
          href="/account/bookings"
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          ← Back to your bookings
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold" data-testid="booking-detail-title">
            {booking.listingTitle}
          </h1>
          <BookingStatusBadge status={booking.status} />
        </div>
        <Link
          href={`/listings/${booking.listingId}`}
          className="w-fit text-sm text-gray-500 underline hover:text-gray-900"
        >
          View the listing
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 p-5 text-sm">
        <div>
          <dt className="text-gray-500">Check-in</dt>
          <dd className="font-medium" data-testid="booking-checkin">
            {longDateLabel(booking.checkIn)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Check-out</dt>
          <dd className="font-medium" data-testid="booking-checkout">
            {longDateLabel(booking.checkOut)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Guests</dt>
          <dd className="font-medium">{booking.partySize}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Nights</dt>
          <dd className="font-medium">{booking.nights}</dd>
        </div>
        <div className="col-span-2 flex justify-between border-t border-gray-100 pt-4">
          <dt className="text-gray-500">Total</dt>
          <dd className="text-lg font-bold" data-testid="booking-total">
            {formatPrice(booking.priceSnapshot)}
          </dd>
        </div>
      </dl>

      {isCancelled ? (
        <section
          data-testid="booking-cancelled-notice"
          className="flex flex-col gap-1 rounded-xl border border-red-200 bg-red-50 p-5 text-sm"
        >
          <h2 className="font-semibold text-red-800">Booking cancelled</h2>
          <p className="text-red-700">
            Cancelled on {longDateLabel(booking.cancelledAt!.slice(0, 10))}.
          </p>
          <p className="flex justify-between border-t border-red-100 pt-3 text-red-800">
            <span>Refunded</span>
            <span className="font-bold" data-testid="booking-refund">
              {formatPrice(booking.refundAmount ?? 0)}
            </span>
          </p>
        </section>
      ) : isCancellable ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Need to cancel?</h2>
          {/* KEN'S FILL: the confirm dialog is a stub until implemented. */}
          <CancelBookingDialog booking={booking} />
        </section>
      ) : null}
    </main>
  );
}
