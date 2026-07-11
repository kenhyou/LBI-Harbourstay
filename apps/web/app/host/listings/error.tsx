'use client';

import Link from 'next/link';

/**
 * Error boundary for the whole /host/listings subtree (dashboard, new, edit).
 * Client component per Next's error-boundary contract.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Couldn’t load your listings</h1>
      <p className="text-sm text-gray-600">{error.message}</p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Retry
        </button>
        <Link
          href="/host/listings"
          className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Back to your listings
        </Link>
      </div>
    </main>
  );
}
