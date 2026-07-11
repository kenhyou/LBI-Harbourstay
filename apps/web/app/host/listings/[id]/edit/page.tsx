import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireHost } from '@/lib/auth/session';
import {
  HostListingNotFoundError,
  getHostListing,
} from '@/lib/api/host-listings';
import {
  ListingEditorForm,
  type ListingEditorInitial,
} from '@/components/listing-editor-form';

// Protected + per-request: role-guarded, never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-listing page. Server Component: role-guarded, then prefills the shared
 * ListingEditorForm in "edit" mode from the host's stored listing.
 *
 * Prefills LOSSLESSLY from `GET /host/listings/:id` (HostListingDetail — every
 * editable field incl. `description` + `images`, and it returns Unpublished
 * DRAFTS too). This matters because PATCH is a full-replace: a blank field would
 * be persisted, so every field must be seeded from the stored listing. Ownership
 * is enforced by the API from the cookie; an unknown id or another host's
 * listing → 404 → Next notFound() (no-leak).
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireHost(`/host/listings/${id}/edit`);

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let detail;
  try {
    detail = await getHostListing(id, cookieHeader);
  } catch (err) {
    if (err instanceof HostListingNotFoundError) notFound();
    throw err; // real fault → error boundary
  }

  const initial: ListingEditorInitial = {
    title: detail.title,
    description: detail.description,
    type: detail.type,
    location: detail.location,
    capacity: detail.capacity,
    basePrice: detail.basePrice, // minor units; the form converts to dollars
    images: detail.images,
  };

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/host/listings"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Your listings
        </Link>
        <h1 className="text-2xl font-bold">Edit listing</h1>
      </header>

      <ListingEditorForm mode="edit" listingId={id} initial={initial} />
    </main>
  );
}
