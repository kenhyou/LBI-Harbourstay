'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">Can’t reach the API</h1>
      <p className="text-sm text-gray-600">{error.message}</p>
      <p className="text-xs text-gray-400">
        Is the API running on <code>http://localhost:3001</code>? Start it with{' '}
        <code>pnpm --filter @harbourstay/api dev</code>.
      </p>
      <button
        onClick={reset}
        className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
      >
        Retry
      </button>
    </main>
  );
}
