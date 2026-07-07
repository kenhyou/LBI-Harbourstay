'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef } from 'react';
import { bookingSummary, type BookingSummary } from '@harbourstay/shared';
import { formatPrice } from '@/lib/format';
import { longDateLabel, nightsInStay } from '@/lib/dates';

export interface PaymentConfirmationProps {
  bookingId: string;
  listingHref: string;
  /** Server-rendered snapshot so the first paint is instant, not a spinner. */
  initialBooking: BookingSummary;
}

const POLL_INTERVAL_MS = 2000;
// Cap the wait so the page never spins forever if the webhook/saga is delayed
// or dropped: ~30s of polling, then a "still processing" fallback.
const MAX_POLLS = 15;

/**
 * Confirmation screen shown after Stripe redirects back from the Payment
 * Element. Payment capture is confirmed on the backend ASYNCHRONOUSLY (Stripe
 * webhook → Ken's saga flips the booking to `Confirmed`), so we poll the
 * same-origin GET /api/bookings/:id until the status is terminal or the poll cap
 * is hit. States:
 *   - PendingPayment           → "confirming your booking…" (keep polling)
 *   - Confirmed/Completed      → success screen with the booking summary
 *   - Expired/Cancelled/NoShow → failed/expired screen with a re-book link
 *   - cap reached, still pending → "still processing, check My Bookings"
 */
export function PaymentConfirmation({
  bookingId,
  listingHref,
  initialBooking,
}: PaymentConfirmationProps) {
  const pollCount = useRef(0);

  const { data: booking } = useQuery({
    queryKey: ['booking-confirmation', bookingId],
    initialData: initialBooking,
    queryFn: async (): Promise<BookingSummary> => {
      pollCount.current += 1;
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`);
      if (!res.ok) throw new Error(`booking responded ${res.status}`);
      return bookingSummary.parse(await res.json());
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const settled =
        status === 'Confirmed' ||
        status === 'Completed' ||
        status === 'Cancelled' ||
        status === 'Expired' ||
        status === 'NoShow';
      if (settled) return false;
      if (pollCount.current >= MAX_POLLS) return false;
      return POLL_INTERVAL_MS;
    },
    // Don't refetch on window focus — the interval owns the polling cadence.
    refetchOnWindowFocus: false,
  });

  const status = booking.status;

  if (status === 'Confirmed' || status === 'Completed') {
    const nights = nightsInStay(booking.checkIn, booking.checkOut).length;
    return (
      <section
        data-testid="confirmation-success"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-1">
          <span
            className="w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
            data-testid="confirmation-status"
          >
            Confirmed
          </span>
          <h1 className="text-2xl font-bold">You’re booked!</h1>
          <p className="text-sm text-gray-600">
            Payment received and your reservation is confirmed. A summary is
            below.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-gray-200 p-5 text-sm">
          <div>
            <dt className="text-gray-500">Check-in</dt>
            <dd className="font-medium">{longDateLabel(booking.checkIn)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Check-out</dt>
            <dd className="font-medium">{longDateLabel(booking.checkOut)}</dd>
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
            <dt className="text-gray-500">Total paid</dt>
            <dd className="text-lg font-bold" data-testid="confirmation-total">
              {formatPrice(booking.priceSnapshot)}
            </dd>
          </div>
        </dl>

        <Link
          href="/listings"
          className="w-fit rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          Browse more stays
        </Link>
      </section>
    );
  }

  if (status === 'Expired' || status === 'Cancelled' || status === 'NoShow') {
    return (
      <section
        role="alert"
        data-testid="confirmation-failed"
        className="flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-red-800">
            This booking wasn’t confirmed
          </h1>
          <p className="text-sm text-red-700">
            {status === 'Expired'
              ? 'The hold expired before payment completed, so the dates were released.'
              : 'This booking is no longer active.'}
          </p>
        </div>
        <Link
          href={listingHref}
          className="w-fit rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Pick your dates again
        </Link>
      </section>
    );
  }

  // Still PendingPayment. Either we are within the poll window, or we hit the
  // cap and the webhook hasn't landed yet.
  const timedOut = pollCount.current >= MAX_POLLS;

  if (timedOut) {
    return (
      <section
        data-testid="confirmation-timeout"
        role="status"
        className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-amber-900">
            Still processing your payment
          </h1>
          <p className="text-sm text-amber-800">
            Your card went through, but we’re still waiting on final
            confirmation. This can take a moment. You can safely leave this page
            — your reservation will appear under your bookings once confirmed.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/bookings/${bookingId}`}
            className="w-fit rounded-md border border-amber-300 bg-white px-5 py-2.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Check this booking
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="confirmation-pending"
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 p-8 text-center"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Confirming your booking…</h1>
        <p className="text-sm text-gray-600">
          Payment received. We’re finalising your reservation — this usually only
          takes a few seconds.
        </p>
      </div>
    </section>
  );
}
