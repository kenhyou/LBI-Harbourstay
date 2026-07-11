import Link from 'next/link';
import { cookies } from 'next/headers';
import { getHostListings } from '@/lib/api/host-listings';
import { requireHost } from '@/lib/auth/session';
import { HostListingCard } from '@/components/host-listing-card';

// Protected + per-request: read the live list on every load, never cache.
export const dynamic = 'force-dynamic';

/**
 * The host dashboard — a host's own listings (Published + Unpublished). Server
 * Component: role-guarded with requireHost() (signed-out → /login, guest →
 * /host/forbidden) BEFORE any data is fetched, then fetches the list on the
 * server, forwarding the httpOnly cookie so the API scopes it to this host.
 */
export default async function HostListingsPage() {
  await requireHost('/host/listings');

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const listings = await getHostListings(cookieHeader);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Your listings</h1>
          <p className="text-sm text-gray-500">
            Create, edit, and publish the places you host.
          </p>
        </div>
        <Link
          href="/host/listings/new"
          data-testid="new-listing-link"
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          New listing
        </Link>
      </header>

      {listings.length === 0 ? (
        <section
          data-testid="host-listings-empty"
          className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-gray-300 p-8"
        >
          <h2 className="text-lg font-semibold">No listings yet</h2>
          <p className="text-sm text-gray-600">
            Create your first listing to start hosting.
          </p>
          <Link
            href="/host/listings/new"
            className="w-fit rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            Create a listing
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {listings.map((listing) => (
            <li key={listing.id}>
              <HostListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
