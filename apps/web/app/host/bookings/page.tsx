import { cookies } from 'next/headers';
import type { HostBookingSummary } from '@harbourstay/shared';
import { requireHost } from '@/lib/auth/session';
import { getHostBookings } from '@/lib/api/host-bookings';
import { BookingStatusBadge } from '@/components/booking-status-badge';
import { formatPrice } from '@/lib/format';
import { parseISODate } from '@/lib/dates';

// Protected + per-request: role-guarded, read the live list on every load.
export const dynamic = 'force-dynamic';

/** Compact date, e.g. "Jul 3, 2026". Pinned to UTC so a calendar day never drifts. */
function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The host's bookings across all their listings. Server Component: role-guarded
 * with requireHost() BEFORE any fetch, then server-fetches GET /host/bookings
 * (cookie forwarded → API scopes to this host) and renders a table. Money is in
 * minor units on the wire and formatted to dollars at the display edge
 * (formatPrice, ADR-0005). Empty state for a host with no bookings yet; loading
 * + error handled by the sibling loading.tsx / error.tsx.
 */
export default async function HostBookingsPage() {
  await requireHost('/host/bookings');

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const bookings = await getHostBookings(cookieHeader);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-sm text-gray-500">
          Every booking across the places you host, newest first.
        </p>
      </header>

      {bookings.length === 0 ? (
        <section
          data-testid="host-bookings-empty"
          className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-gray-300 p-8"
        >
          <h2 className="text-lg font-semibold">No bookings yet</h2>
          <p className="text-sm text-gray-600">
            When a guest books one of your listings, it’ll show up here.
          </p>
        </section>
      ) : (
        // Cards on small screens, a table on wider ones. The table is
        // horizontally scrollable if it ever overflows so nothing is clipped.
        <div className="overflow-x-auto">
          <table
            data-testid="host-bookings-table"
            className="w-full min-w-[640px] border-collapse text-sm"
          >
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-4 font-medium">Listing</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
                <th className="py-2 pr-4 font-medium">Guests</th>
                <th className="py-2 pr-4 font-medium">Guest</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-0 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking: HostBookingSummary) => (
                <tr
                  key={booking.id}
                  data-testid="host-booking-row"
                  data-booking-id={booking.id}
                  className="border-b border-gray-100 align-top"
                >
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {booking.listingTitle}
                  </td>
                  <td className="py-3 pr-4 text-gray-700">
                    {shortDate(booking.checkIn)} → {shortDate(booking.checkOut)}
                  </td>
                  <td className="py-3 pr-4 text-gray-700">{booking.partySize}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                    {/* Guest id only — no PII crosses into the host view. Shortened
                        to the first block for readability. */}
                    {booking.guestId.slice(0, 8)}
                  </td>
                  <td className="py-3 pr-4">
                    <BookingStatusBadge status={booking.status} />
                  </td>
                  <td className="py-3 pr-0 text-right font-medium text-gray-900">
                    {formatPrice(booking.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
