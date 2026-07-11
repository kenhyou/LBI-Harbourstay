import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { LogoutButton } from './logout-button';

/**
 * Global header. Server Component: reads the session server-side (never a
 * client-only auth check) and renders the signed-in user's email + logout when
 * authed, or login/signup links when not.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3"
      >
        <Link href="/" className="text-sm font-bold tracking-tight">
          Harbourstay
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/listings"
            className="text-gray-600 transition hover:text-gray-900"
          >
            Browse
          </Link>

          {user ? (
            <>
              {user.role === 'host' && (
                <>
                  <Link
                    href="/host/listings"
                    data-testid="header-host-link"
                    className="text-gray-600 transition hover:text-gray-900"
                  >
                    Host
                  </Link>
                  <Link
                    href="/host/bookings"
                    data-testid="header-host-bookings-link"
                    className="text-gray-600 transition hover:text-gray-900"
                  >
                    Bookings
                  </Link>
                </>
              )}
              <Link
                href="/account"
                data-testid="header-user-email"
                className="font-medium text-gray-900 hover:underline"
              >
                {user.email}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-600 transition hover:text-gray-900"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white shadow-sm transition hover:bg-gray-800"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
