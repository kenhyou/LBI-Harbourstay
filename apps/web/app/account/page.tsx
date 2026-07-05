import { requireUser } from '@/lib/auth/session';

// Protected + per-request: read the live session on every load, never cache.
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  // Server-side guard: redirects to /login?next=/account when signed out.
  const user = await requireUser('/account');

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="text-sm text-gray-500">
          You’re signed in to Harbourstay.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 p-6 shadow-sm">
        <dl className="grid grid-cols-[6rem_1fr] gap-y-3 text-sm">
          <dt className="text-gray-500">Email</dt>
          <dd className="font-medium" data-testid="account-email">
            {user.email}
          </dd>
          <dt className="text-gray-500">Role</dt>
          <dd className="font-medium capitalize" data-testid="account-role">
            {user.role}
          </dd>
          <dt className="text-gray-500">User ID</dt>
          <dd className="font-mono text-xs text-gray-600">{user.id}</dd>
        </dl>
      </section>
    </main>
  );
}
