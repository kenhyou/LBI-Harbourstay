'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  bookingSummary,
  listingAvailability,
  type CreateBookingRequest,
} from '@harbourstay/shared';
import { AvailabilityCalendar } from './availability-calendar';
import {
  addMonths,
  longDateLabel,
  nightsInStay,
  startOfMonth,
  takenNights as expandTakenNights,
  todayISO,
} from '@/lib/dates';
import { formatPrice } from '@/lib/format';

export interface BookingWidgetProps {
  listingId: string;
  /** Max party size for this listing (nightly price applies per stay). */
  capacity: number;
  /** Nightly base price in minor units (cents), for an indicative total. */
  basePrice: number;
  /** Server-read session state — signed-out users go straight to /login. */
  isAuthenticated: boolean;
}

type ReserveResult =
  | { status: 'ok'; id: string }
  | { status: 'auth' }
  | { status: 'conflict' }
  | { status: 'invalid'; message: string };

/**
 * Reserve widget on the listing detail page. Owns the check-in/check-out/party
 * selection, fetches indicative availability with TanStack Query (through the
 * same-origin proxy), and submits the hold through the cookie-forwarding
 * /api/bookings route. On success it lands on the pending-payment page; a 409
 * (dates just taken) refetches the calendar; a 401 sends a signed-out guest to
 * /login. Availability is only indicative, so the server EXCLUDE constraint —
 * surfaced here as 409 — is the real arbiter.
 */
export function BookingWidget({
  listingId,
  capacity,
  basePrice,
  isAuthenticated,
}: BookingWidgetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const firstMonth = startOfMonth(todayISO());
  const [monthStart, setMonthStart] = useState(firstMonth);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  // Fetch a two-month window from the visible month so a stay that crosses the
  // month boundary still validates against taken nights on both sides.
  const from = monthStart;
  const to = addMonths(monthStart, 2);

  const availability = useQuery({
    queryKey: ['availability', listingId, from, to],
    queryFn: async () => {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(listingId)}/availability?from=${from}&to=${to}`,
      );
      if (!res.ok) throw new Error(`availability responded ${res.status}`);
      return listingAvailability.parse(await res.json());
    },
  });

  const nights = useMemo(
    () => expandTakenNights(availability.data?.unavailable ?? []),
    [availability.data],
  );

  function resetSelection(nextCheckIn: string | null) {
    setCheckIn(nextCheckIn);
    setCheckOut(null);
    setNotice(null);
  }

  function handleSelectDay(iso: string) {
    // The calendar only calls this for non-disabled days.
    if (!checkIn || checkOut) {
      resetSelection(iso);
      return;
    }
    if (iso <= checkIn) {
      resetSelection(iso);
      return;
    }
    // Choosing a checkout: the whole stay must contain no taken night.
    const blocked = nightsInStay(checkIn, iso).some((n) => nights.has(n));
    if (blocked) {
      // Restart at the clicked day when it is itself a valid check-in; a taken
      // night can only ever be a checkout, so clear selection instead.
      resetSelection(nights.has(iso) ? null : iso);
      return;
    }
    setCheckOut(iso);
    setNotice(null);
  }

  const stayNights =
    checkIn && checkOut ? nightsInStay(checkIn, checkOut).length : 0;
  const indicativeTotal = stayNights * basePrice;
  const partyValid = partySize >= 1 && partySize <= capacity;
  const canReserve = Boolean(checkIn && checkOut && partyValid);

  const reserve = useMutation({
    mutationFn: async (): Promise<ReserveResult> => {
      const body: CreateBookingRequest = {
        listingId,
        checkIn: checkIn as string,
        checkOut: checkOut as string,
        partySize,
      };
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) return { status: 'auth' };
      if (res.status === 409) return { status: 'conflict' };
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        return {
          status: 'invalid',
          message: detail?.error ?? 'Those booking details are not valid.',
        };
      }
      const summary = bookingSummary.parse(await res.json());
      return { status: 'ok', id: summary.id };
    },
    onSuccess: (result) => {
      switch (result.status) {
        case 'ok':
          router.push(`/bookings/${result.id}`);
          return;
        case 'auth':
          router.push(
            `/login?next=${encodeURIComponent(`/listings/${listingId}`)}`,
          );
          return;
        case 'conflict':
          setNotice(
            'Those dates were just taken. We refreshed the calendar — please pick again.',
          );
          resetSelection(null);
          void queryClient.invalidateQueries({
            queryKey: ['availability', listingId],
          });
          return;
        case 'invalid':
          setNotice(result.message);
          return;
      }
    },
    onError: () => {
      setNotice('Something went wrong reserving. Please try again.');
    },
  });

  function handleReserve() {
    setNotice(null);
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`);
      return;
    }
    if (!canReserve) return;
    reserve.mutate();
  }

  const allOpen =
    availability.data !== undefined && availability.data.unavailable.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xl font-bold text-gray-900">
        {formatPrice(basePrice)}
        <span className="text-sm font-normal text-gray-500"> / night</span>
      </p>

      {availability.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p className="font-medium">Couldn’t load availability.</p>
          <button
            type="button"
            onClick={() => void availability.refetch()}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {allOpen && (
            <p
              className="rounded-md bg-green-50 px-3 py-2 text-xs text-green-700"
              role="status"
            >
              All dates are currently open.
            </p>
          )}
          <AvailabilityCalendar
            monthStart={monthStart}
            takenNights={nights}
            checkIn={checkIn}
            checkOut={checkOut}
            onSelectDay={handleSelectDay}
            onPrevMonth={() => setMonthStart((m) => addMonths(m, -1))}
            onNextMonth={() => setMonthStart((m) => addMonths(m, 1))}
            canGoPrev={monthStart > firstMonth}
            loading={availability.isLoading}
          />
        </>
      )}

      <dl className="flex flex-col gap-1 text-sm" data-testid="selection-summary">
        <div className="flex justify-between">
          <dt className="text-gray-500">Check-in</dt>
          <dd className="font-medium">
            {checkIn ? longDateLabel(checkIn) : 'Select a date'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Check-out</dt>
          <dd className="font-medium">
            {checkOut ? longDateLabel(checkOut) : 'Select a date'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <label htmlFor="partySize" className="text-xs font-medium text-gray-600">
          Guests (max {capacity})
        </label>
        <input
          id="partySize"
          type="number"
          min={1}
          max={capacity}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          aria-invalid={partyValid ? undefined : 'true'}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        />
        {!partyValid && (
          <span role="alert" className="text-xs text-red-600">
            Enter between 1 and {capacity} guests.
          </span>
        )}
      </div>

      {stayNights > 0 && (
        <div className="flex justify-between border-t border-gray-100 pt-3 text-sm">
          <span className="text-gray-500">
            {formatPrice(basePrice)} × {stayNights}{' '}
            {stayNights === 1 ? 'night' : 'nights'}
          </span>
          <span className="font-semibold" data-testid="indicative-total">
            {formatPrice(indicativeTotal)}
          </span>
        </div>
      )}

      {notice && (
        <p
          role="alert"
          data-testid="booking-notice"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={handleReserve}
        disabled={reserve.isPending || (isAuthenticated && !canReserve)}
        data-testid="reserve-button"
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {reserve.isPending
          ? 'Reserving…'
          : isAuthenticated
            ? 'Reserve'
            : 'Log in to reserve'}
      </button>

      <p className="text-xs text-gray-400">
        You won’t be charged yet — reserving holds the dates while you review.
      </p>
    </div>
  );
}
