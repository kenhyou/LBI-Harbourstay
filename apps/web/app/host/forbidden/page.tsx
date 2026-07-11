import Link from 'next/link';

/**
 * The 403 landing for a signed-in NON-host who tried to reach a /host route.
 * requireHost() redirects here (rather than to /login, which would be a
 * pointless loop — the user is already authenticated; they just lack the host
 * role). A guest can reach this page; that's fine, it only says "you need a host
 * account", it exposes no host data.
 */
export default function HostForbiddenPage() {
  return (
    <main
      data-testid="host-forbidden"
      className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center gap-4 p-8"
    >
      <h1 className="text-2xl font-bold">Host account required</h1>
      <p className="text-sm text-gray-600">
        The host dashboard is only available to host accounts. Your account isn’t
        a host account, so you can’t manage listings here.
      </p>
      <div className="flex gap-2">
        <Link
          href="/account"
          className="w-fit rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Back to your account
        </Link>
        <Link
          href="/listings"
          className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Browse stays
        </Link>
      </div>
    </main>
  );
}
