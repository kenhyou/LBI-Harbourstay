import { expect, test } from '@playwright/test';

/**
 * S7a — Security baseline (web headers).
 *
 * Asserts the standard security response headers configured in
 * `next.config.ts` (`async headers()`) are present on a normal page response.
 * These are attached to every route via the `/:path*` matcher, so any served
 * page is a valid probe — we use the listings page.
 *
 * Requires the web server up (see playwright.config.ts). The API need not be
 * reachable for the header assertions themselves: the headers are set by the
 * Next server regardless of whether the RSC fetch succeeds.
 *
 * NOTE on HSTS: `Strict-Transport-Security` is only emitted/meaningful over
 * HTTPS. On the local http://localhost server it may be absent (browsers ignore
 * it on plain HTTP anyway), so we assert it only when the response was served
 * over https — otherwise we skip that one assertion rather than fail locally.
 */
test('security response headers are present on page responses', async ({
  request,
}) => {
  const res = await request.get('/listings');
  expect(res.ok()).toBeTruthy();

  const headers = res.headers();

  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe(
    'camera=(), microphone=(), geolocation=()',
  );

  // HSTS: only assert over HTTPS (inert on plain-HTTP localhost).
  const url = new URL(res.url());
  if (url.protocol === 'https:') {
    expect(headers['strict-transport-security']).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  }
});
