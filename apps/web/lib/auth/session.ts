import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authUser, type AuthUser } from '@harbourstay/shared';
import { AUTH_COOKIE_NAMES } from './cookies';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Server-side session read. Reads the httpOnly auth cookie(s) via next/headers,
 * forwards them to the protected GET /auth/me, and runtime-validates the result
 * against the shared `authUser` schema. Returns null (never throws) for the
 * unauthenticated / expired / unreachable cases so it is safe to call from a
 * layout or header without breaking every page.
 *
 * This is the server-side guard primitive — protected routes call requireUser()
 * below, which builds on this. Never trust a client-only check for auth.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const all = store.getAll();

  // Cheap short-circuit: no auth cookie present → definitely signed out. Avoids
  // a network round-trip to /auth/me on every anonymous request.
  const names: readonly string[] = AUTH_COOKIE_NAMES;
  if (!all.some((c) => names.includes(c.name))) return null;

  // Forward the full cookie header so we don't depend on knowing exactly which
  // cookie the API validates (access vs refresh).
  const cookieHeader = all.map((c) => `${c.name}=${c.value}`).join('; ');

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch {
    // API unreachable — treat as signed out for rendering purposes rather than
    // throwing from a layout. Data routes surface real faults via error.tsx.
    return null;
  }

  if (!res.ok) return null;

  const parsed = authUser.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/**
 * Server-side route guard. Redirects to /login (preserving where the user was
 * headed via ?next=) when there is no valid session. Returns the AuthUser on
 * success so protected pages can render it directly.
 */
export async function requireUser(nextPath?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login',
    );
  }
  return user;
}
