import { NextResponse } from 'next/server';
import { registerRequest } from '@harbourstay/shared';
import { EmailInUseError, registerToApi } from '@/lib/api/auth';
import { relayAuthCookies } from '@/lib/auth/cookies';

/**
 * Cookie bridge for registration. Same shape as login: validate against the
 * shared schema, proxy to the API, relay the httpOnly JWT Set-Cookie onto the
 * web origin, return the AuthUser. 409 (email in use) becomes a clean 409.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = registerRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { user, setCookies } = await registerToApi(parsed.data);
    const res = NextResponse.json(user, { status: 201 });
    relayAuthCookies(res, setCookies);
    return res;
  } catch (err) {
    if (err instanceof EmailInUseError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Unable to create your account right now' },
      { status: 502 },
    );
  }
}
