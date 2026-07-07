import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getBooking, BookingNotFoundError } from '@/lib/api/bookings';
import { requireUser } from '@/lib/auth/session';
import { PaymentConfirmation } from '@/components/payment-confirmation';

// Always fetch the live booking so the confirmation status is current on load.
export const dynamic = 'force-dynamic';

/**
 * Post-payment confirmation route. Stripe redirects here (return_url) after the
 * Payment Element, appending its own `payment_intent` / `redirect_status` query
 * params — we ignore those and trust the backend as the source of truth: the
 * booking flips to `Confirmed` only when the Stripe webhook drives Ken's saga.
 *
 * Server-first: guard the route, fetch an initial snapshot, then hand off to a
 * client poller (PaymentConfirmation) that polls until the status settles, since
 * webhook confirmation is asynchronous.
 */
export default async function BookingConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await requireUser(`/bookings/${id}/confirmed`);

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

      <PaymentConfirmation
        bookingId={id}
        listingHref={listingHref}
        initialBooking={booking}
      />
    </main>
  );
}
