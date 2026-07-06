import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getBooking, BookingNotFoundError } from '@/lib/api/bookings';
import { requireUser } from '@/lib/auth/session';
import { HoldCountdown } from '@/components/hold-countdown';
import { formatPrice } from '@/lib/format';
import { longDateLabel, nightsInStay } from '@/lib/dates';

// Always fetch the live booking so status + remaining TTL are current.
export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  PendingPayment: 'Pending payment',
  Confirmed: 'Confirmed',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Expired: 'Expired',
  NoShow: 'No show',
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Server-side guard: a signed-out guest is bounced to /login?next=here.
  await requireUser(`/bookings/${id}`);

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let booking;
  try {
    booking = await getBooking(id, cookieHeader);
  } catch (err) {
    if (err instanceof BookingNotFoundError) notFound();
    throw err;
  }

  const listingHref = `/listings/${booking.listingId}`;
  const nights = nightsInStay(booking.checkIn, booking.checkOut).length;
  const isPending = booking.status === 'PendingPayment';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <nav>
        <Link
          href="/listings"
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          ← Back to search
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Your reservation</h1>
        <p className="text-sm text-gray-500">
          Status:{' '}
          <span
            className="font-medium text-gray-900"
            data-testid="booking-status"
          >
            {statusLabel[booking.status] ?? booking.status}
          </span>
        </p>
      </header>

      {isPending && (
        <HoldCountdown
          holdExpiresAt={booking.holdExpiresAt}
          listingHref={listingHref}
        />
      )}

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
          <dd className="font-medium">{nights}</dd>
        </div>
        <div className="col-span-2 flex justify-between border-t border-gray-100 pt-4">
          <dt className="text-gray-500">Total</dt>
          <dd className="text-lg font-bold" data-testid="booking-total">
            {formatPrice(booking.priceSnapshot)}
          </dd>
        </div>
      </dl>

      {isPending ? (
        <button
          type="button"
          disabled
          className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white opacity-60"
          title="Payment arrives in the next slice (S4)"
        >
          Continue to payment
        </button>
      ) : (
        <Link
          href={listingHref}
          className="w-fit rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
        >
          Back to listing
        </Link>
      )}

      <p className="text-xs text-gray-400">
        Payment is wired up in the next step. For now this confirms the dates are
        held for you.
      </p>
    </main>
  );
}
