import type { NextConfig } from 'next';

/**
 * S7a — Security baseline (web response headers).
 *
 * A light OWASP-flavoured hardening pass: we attach a small set of standard
 * security response headers to *every* route via Next's `async headers()`.
 * These are cheap, well-understood, and independent of any feature. Each header
 * below is commented with the attack it mitigates — this file is meant to be
 * read, not just run.
 *
 * NOTE ON X-Frame-Options vs Stripe: `X-Frame-Options: DENY` controls whether
 * *our* pages may be embedded in someone else's <iframe> (clickjacking). It has
 * NO effect on the iframes *we* embed — Stripe's Payment Element is a child
 * iframe served from js.stripe.com that our page hosts, i.e. the opposite
 * direction. So DENY does not block Stripe checkout. (What *would* govern the
 * frames we embed is a Content-Security-Policy `frame-src`, which we are
 * deliberately deferring — see the CSP scaffold at the bottom of this file.)
 */
const securityHeaders = [
  {
    // Clickjacking: forbid our pages from being rendered inside any <frame>/
    // <iframe>/<object>. We never embed our own UI elsewhere, so DENY (stricter
    // than SAMEORIGIN) is the right call. This constrains US being framed; it
    // does not touch Stripe's child iframes that WE host (see the note above).
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // MIME sniffing: stop browsers from second-guessing a response's declared
    // Content-Type. Blocks "upload a .txt that's really a script, get it run"
    // style attacks by making the server's Content-Type authoritative.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Referrer leakage: on cross-origin navigations send only the origin (no
    // path/query), and send nothing at all when downgrading HTTPS→HTTP. Keeps
    // booking ids, listing ids, and `?next=` redirect targets out of the
    // Referer header sent to third parties (e.g. Stripe, image CDNs).
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Powerful-feature lockdown: explicitly deny access to device APIs we never
    // use. An empty allowlist `()` means "no origin, not even us". Shrinks the
    // attack surface if a dependency (or an injected script) tries to reach for
    // the camera/mic/geolocation. Extend this list as features demand.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    // Transport security (HSTS): once seen over HTTPS, the browser refuses to
    // talk to this host over plain HTTP for two years, defeating SSL-strip /
    // downgrade MITM attacks. `includeSubDomains` extends that to every
    // subdomain; `preload` opts into the browser-baked HSTS preload list.
    //
    // IMPORTANT: this header only matters over HTTPS — browsers ignore it on
    // plain-HTTP responses, so it is inert (and harmless) on local `http://
    // localhost`. It takes effect in production, where Amplify terminates TLS.
    // Only ship `preload` if you're committed to HTTPS on this host + all
    // subdomains indefinitely; it is effectively hard to undo once submitted.
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  // @harbourstay/shared is prebuilt to dist (CJS), so no transpilePackages needed.
  // API base URL for server-side (RSC) fetches lives in process.env.API_URL.

  /**
   * Apply the security headers above to every route (`/:path*` matches all
   * paths). Next merges these onto both static assets and dynamic RSC/route
   * handler responses.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

/*
 * ---------------------------------------------------------------------------
 * Content-Security-Policy — DELIBERATELY DEFERRED (documented, not shipped).
 * ---------------------------------------------------------------------------
 *
 * A CSP is the highest-leverage header here (it's the real XSS mitigation), but
 * it is also the one most likely to SILENTLY break checkout if misconfigured:
 * a too-strict `script-src`/`frame-src`/`connect-src` will stop Stripe.js from
 * loading, block the Payment Element iframe, or drop the XHR to api.stripe.com —
 * often with only a console warning, no thrown error, and a broken pay button.
 * So we do NOT ship a blind strict CSP. Enable it deliberately in a follow-up,
 * against a running stack, watching the browser console for CSP violations.
 *
 * A correct CSP for THIS app must at minimum allow the following sources.
 * (Names in brackets are the directive that needs each entry.)
 *
 *   Stripe — Payment Element (S4 checkout):
 *     - https://js.stripe.com        [script-src]  Stripe.js loader
 *     - https://api.stripe.com       [connect-src] confirmPayment / tokenization XHR
 *     - https://js.stripe.com        [frame-src]   the Payment Element iframe
 *     - https://m.stripe.network     [frame-src / connect-src] Stripe fraud/metrics
 *       (Stripe occasionally serves telemetry from *.stripe.network — verify in
 *        the console at enable-time and add only what actually loads.)
 *
 *   Our own origin:
 *     - 'self'                        [default-src, script-src, connect-src]
 *                                     RSC payloads + the same-origin /api/* cookie
 *                                     bridges (auth, pay, cancel, host CRUD) all
 *                                     talk to 'self', so connect-src must include it.
 *     - process.env.API_URL          [connect-src] ONLY if any client component
 *                                     ever fetches the API directly. Today all
 *                                     browser calls go through same-origin /api/*
 *                                     route handlers, so 'self' is enough and the
 *                                     API origin can stay OUT of the CSP. Re-check
 *                                     this assumption before enabling.
 *
 *   Styles:
 *     - 'unsafe-inline'              [style-src]   Stripe's Payment Element injects
 *                                     inline styles into its iframe, and Tailwind/
 *                                     Next may emit inline <style>. A nonce-based
 *                                     style-src is the stricter alternative but is
 *                                     fiddly with Stripe — start with 'unsafe-inline'
 *                                     for styles only (NOT for scripts).
 *
 *   Images:
 *     - https://picsum.photos        [img-src]     seed/listing images (S1)
 *     - https://*.amplifyapp.com     [img-src]     Amplify-hosted assets, if any
 *     - data:                        [img-src]     inline data: URIs if used
 *       (When object-storage image upload lands — deferred since S6 — add that
 *        bucket/CDN origin here too.)
 *
 *   Scripts (Next.js App Router):
 *     - Next's inline bootstrap/hydration scripts need EITHER a per-request
 *       'nonce' (preferred) OR 'unsafe-inline' (weaker). A nonce requires
 *       generating it in middleware and threading it through — do that as its
 *       own task; don't bolt it on here.
 *
 * A starting-point policy to adapt (report-only FIRST, then enforce):
 *
 *   const csp = [
 *     "default-src 'self'",
 *     "script-src 'self' https://js.stripe.com",            // + a nonce for Next inline scripts
 *     "connect-src 'self' https://api.stripe.com https://m.stripe.network",
 *     "frame-src https://js.stripe.com https://m.stripe.network",
 *     "img-src 'self' data: https://picsum.photos https://*.amplifyapp.com",
 *     "style-src 'self' 'unsafe-inline'",
 *     "font-src 'self'",
 *     "base-uri 'self'",
 *     "form-action 'self'",
 *     "frame-ancestors 'none'",                             // CSP-level twin of X-Frame-Options: DENY
 *     "object-src 'none'",
 *   ].join('; ');
 *
 * Roll it out safely:
 *   1. Ship it first as `Content-Security-Policy-Report-Only` (browsers REPORT
 *      violations but do NOT block) and exercise the full pay + auth + host
 *      flows, collecting every violation.
 *   2. Widen the policy to cover the legitimate ones (and only those).
 *   3. Only then switch the header name to `Content-Security-Policy` to enforce.
 * ---------------------------------------------------------------------------
 */
