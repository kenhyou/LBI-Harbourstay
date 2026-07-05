import { NextResponse } from 'next/server';
import { loginRequest } from '@harbourstay/shared';
import { InvalidCredentialsError, loginToApi } from '@/lib/api/auth';
import { relayAuthCookies } from '@/lib/auth/cookies';

/**
 * Cookie bridge for login. The browser calls this SAME-ORIGIN route handler,
 * which proxies to the cross-origin API, then relays the API's httpOnly JWT
 * Set-Cookie onto the web-origin response so the cookie is stored for the web
 * app (a cookie set directly by the API's origin wouldn't be sent to the web
 * origin in production). Returns the safe AuthUser JSON, or a clean error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = loginRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { user, setCookies } = await loginToApi(parsed.data);
    const res = NextResponse.json(user);
    relayAuthCookies(res, setCookies);
    return res;
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Unable to sign in right now' },
      { status: 502 },
    );
  }
}
