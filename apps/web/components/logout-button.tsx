'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Logout control. Posts to the same-origin /api/auth/logout cookie bridge to
 * expire the httpOnly session cookie(s), then navigates home and refreshes so
 * the server components (header, guarded pages) re-render as signed-out.
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort: even if the network call fails, still send the user home.
    }
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={pending}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-60"
    >
      {pending ? 'Logging out…' : 'Log out'}
    </button>
  );
}
