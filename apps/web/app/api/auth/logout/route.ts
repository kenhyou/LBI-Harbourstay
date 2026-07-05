import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAMES } from '@/lib/auth/cookies';

/**
 * Logout clears the web-origin auth cookie(s). There is no server-side session
 * to revoke here (the JWT is stateless); expiring the cookies signs the browser
 * out. We expire at Path=/ to match how the API sets them.
 *
 * ASSUMPTION: the auth cookies are set at Path=/. If the backend scopes them to
 * a different path, expiring must use that same path — flag for the verifier.
 */
export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  for (const name of AUTH_COOKIE_NAMES) {
    res.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true });
  }
  return res;
}
