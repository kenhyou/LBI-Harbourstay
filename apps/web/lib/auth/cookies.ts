import type { NextResponse } from 'next/server';

/**
 * Names of the httpOnly auth cookies the API issues. These are the single
 * source of truth on the web side for (a) detecting a session cheaply before
 * calling /auth/me and (b) clearing the session on logout.
 *
 * ASSUMPTION (must match the backend JWT cookie config): the API sets an
 * access-token cookie and a refresh-token cookie under these names. If the
 * backend picks different names or a single cookie, update this list — nothing
 * else in the web app hardcodes cookie names.
 */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const AUTH_COOKIE_NAMES = [ACCESS_COOKIE, REFRESH_COOKIE] as const;

/**
 * Strip any `Domain=` attribute from a Set-Cookie string so the relayed cookie
 * binds to the WEB host, not the API host. In production the API and web are
 * different origins; a cookie scoped to the API's domain would be rejected by
 * the browser when set on a web-origin response. Host-only (no Domain) is what
 * we want for the web app's own cookie.
 */
export function stripCookieDomain(setCookie: string): string {
  return setCookie.replace(/;\s*Domain=[^;]*/i, '');
}

/**
 * The cookie bridge: relay the API's Set-Cookie header(s) onto the web-origin
 * response verbatim (minus Domain). Uses append so an access+refresh split
 * (two Set-Cookie headers) is preserved. httpOnly / Path / SameSite / Secure
 * are kept exactly as the API set them.
 */
export function relayAuthCookies(
  res: NextResponse,
  setCookies: readonly string[],
): void {
  for (const raw of setCookies) {
    res.headers.append('set-cookie', stripCookieDomain(raw));
  }
}
