import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      data-testid="listing-not-found"
      className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-4 p-8"
    >
      <h1 className="text-2xl font-bold">Listing not found</h1>
      <p className="text-sm text-gray-600">
        This listing doesn’t exist or is no longer published.
      </p>
      <Link
        href="/listings"
        className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
      >
        Back to search
      </Link>
    </main>
  );
}
