import { getHealth } from '@/lib/api/health';

// Always fetch fresh so the page reflects the live API on every load.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await getHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Harbourstay</h1>

      <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          API health
        </h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-gray-500">status</dt>
          <dd className="flex items-center gap-2 font-mono">
            <span
              className="inline-block h-2 w-2 rounded-full bg-green-500"
              aria-hidden
            />
            {health.status}
          </dd>
          <dt className="text-gray-500">service</dt>
          <dd className="font-mono">{health.service}</dd>
          <dt className="text-gray-500">timestamp</dt>
          <dd className="font-mono">{health.timestamp}</dd>
        </dl>
      </section>

      <p className="text-xs text-gray-400">
        Rendered by a React Server Component fetching the NestJS API through the{' '}
        <code className="rounded bg-gray-100 px-1">@harbourstay/shared</code> contract.
      </p>
    </main>
  );
}
