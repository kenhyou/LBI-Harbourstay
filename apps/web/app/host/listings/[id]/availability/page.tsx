import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireHost } from '@/lib/auth/session';
import {
  HostListingNotFoundError,
  getHostListing,
  getListingBlocks,
} from '@/lib/api/host-listings';
import { AvailabilityManager } from '@/components/availability-manager';

// Protected + per-request: role-guarded, never cached.
export const dynamic = 'force-dynamic';

/**
 * Manage-availability page for one of the host's OWN listings. Server Component:
 * role-guarded with requireHost() BEFORE any fetch, then fetches the listing
 * (for its title) and its current blocks on the server, forwarding the httpOnly
 * cookie so the API scopes + ownership-checks by this host. An unknown id or
 * another host's listing → 404 → Next notFound() (no-leak).
 *
 * The interactive add/remove lives in the client AvailabilityManager, seeded with
 * the server-fetched blocks — the classic server-fetch / client-mutate split.
 */
export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireHost(`/host/listings/${id}/availability`);

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  // Fetch the listing (title) and blocks together. Both throw
  // HostListingNotFoundError for an unknown/other-host id → notFound().
  let title: string;
  let blocks;
  try {
    const [listing, listingBlocks] = await Promise.all([
      getHostListing(id, cookieHeader),
      getListingBlocks(id, cookieHeader),
    ]);
    title = listing.title;
    blocks = listingBlocks;
  } catch (err) {
    if (err instanceof HostListingNotFoundError) notFound();
    throw err; // real fault → error boundary
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/host/listings"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Your listings
        </Link>
        <h1 className="text-2xl font-bold">Availability</h1>
        <p className="text-sm text-gray-500" data-testid="availability-listing-title">
          {title}
        </p>
      </header>

      <AvailabilityManager listingId={id} initialBlocks={blocks} />
    </main>
  );
}
