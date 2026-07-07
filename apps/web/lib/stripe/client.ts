import { loadStripe, type Stripe } from '@stripe/stripe-js';

/**
 * Lazy, memoised Stripe.js loader for the browser. The publishable key is a
 * PUBLIC build-time env var (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — a
 * `pk_test_…` value the user supplies; it is safe to ship to the client.
 *
 * `loadStripe` is only ever called here, at RUNTIME in the browser, so a missing
 * key does NOT crash `next build` — we return `null` and let the payment UI show
 * a clear "payment unavailable" message instead. The promise is created once and
 * reused so Stripe.js is fetched a single time per page load.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
