import type { Response } from 'express';
import type { IssuedTokens } from '@/identity/application/ports/auth-token.port';

/**
 * Cookie plumbing for the session. Tokens live in httpOnly cookies (never
 * JS-readable, never in the JSON body) — the browser attaches them
 * automatically and the API reads them server-side (ADR-0006).
 */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production';

/** Base flags: httpOnly + sameSite lax; secure only in production (localhost is http). */
const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

// Cookie max-age loosely tracks token TTLs (15m access / 7d refresh). The JWT's
// own `exp` remains the source of truth for validity.
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Write both session cookies onto the response. */
export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

/** Clear both session cookies (logout / invalid refresh). */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
}
