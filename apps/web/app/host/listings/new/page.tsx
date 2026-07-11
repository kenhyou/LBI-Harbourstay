import Link from 'next/link';
import { requireHost } from '@/lib/auth/session';
import {
  ListingEditorForm,
  type ListingEditorInitial,
} from '@/components/listing-editor-form';

// Protected + per-request: role-guarded, never cached.
export const dynamic = 'force-dynamic';

// Blank seed for a brand-new listing. `type` defaults to 'stay'; basePrice is 0
// cents so the dollars field starts at 0.
const BLANK: ListingEditorInitial = {
  title: '',
  description: '',
  type: 'stay',
  location: '',
  capacity: 1,
  basePrice: 0,
  images: [],
};

/**
 * Create-a-listing page. Server Component: role-guarded with requireHost(), then
 * renders the shared ListingEditorForm in "create" mode. All interactivity lives
 * in that client child; this page is a thin server shell.
 */
export default async function NewListingPage() {
  await requireHost('/host/listings/new');

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/host/listings"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Your listings
        </Link>
        <h1 className="text-2xl font-bold">New listing</h1>
      </header>

      <ListingEditorForm mode="create" initial={BLANK} />
    </main>
  );
}
