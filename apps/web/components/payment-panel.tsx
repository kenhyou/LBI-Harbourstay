'use client';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { useState, type FormEvent } from 'react';
import { createPaymentIntentResponse } from '@harbourstay/shared';
import { getStripe } from '@/lib/stripe/client';

export interface PaymentPanelProps {
  /** The pending-payment booking to pay for. */
  bookingId: string;
  /** Where to re-pick dates if the hold has lapsed (409 not-payable). */
  listingHref: string;
}

// Created once at module load: null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is
// unset, in which case we render an "unavailable" notice instead of crashing.
const stripePromise = getStripe();

type PayState =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'ready'; clientSecret: string }
  | { phase: 'error'; message: string; recoverable: boolean };

/**
 * The pay action on the pending-payment page. Two steps:
 *  1. Click "Pay now" → POST the same-origin /api/bookings/:id/pay bridge, which
 *     forwards the auth cookie and returns a Stripe PaymentIntent clientSecret.
 *  2. Mount Stripe's Payment Element bound to that clientSecret; on submit,
 *     stripe.confirmPayment redirects to /bookings/:id/confirmed, where we poll
 *     for the webhook-driven Confirmed status.
 *
 * A 409 (hold lapsed / already resolved) is surfaced as a non-recoverable state
 * with a re-book link; a 401 sends the guest to /login.
 */
export function PaymentPanel({ bookingId, listingHref }: PaymentPanelProps) {
  const [state, setState] = useState<PayState>({ phase: 'idle' });

  async function startPayment() {
    setState({ phase: 'creating' });
    let res: Response;
    try {
      res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/pay`, {
        method: 'POST',
      });
    } catch {
      setState({
        phase: 'error',
        message: 'Network error starting payment. Please try again.',
        recoverable: true,
      });
      return;
    }

    if (res.status === 401) {
      window.location.assign(
        `/login?next=${encodeURIComponent(`/bookings/${bookingId}`)}`,
      );
      return;
    }
    if (res.status === 409) {
      setState({
        phase: 'error',
        message:
          'This booking can no longer be paid for — the hold may have expired.',
        recoverable: false,
      });
      return;
    }
    if (!res.ok) {
      setState({
        phase: 'error',
        message: 'Unable to start payment right now. Please try again.',
        recoverable: true,
      });
      return;
    }

    const parsed = createPaymentIntentResponse.safeParse(
      await res.json().catch(() => null),
    );
    if (!parsed.success) {
      setState({
        phase: 'error',
        message: 'Payment could not be initialised. Please try again.',
        recoverable: true,
      });
      return;
    }
    setState({ phase: 'ready', clientSecret: parsed.data.clientSecret });
  }

  if (stripePromise === null) {
    return (
      <div
        role="alert"
        data-testid="payment-unavailable"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        Payment is temporarily unavailable (missing Stripe configuration). Please
        try again later.
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div
        role="alert"
        data-testid="payment-error"
        className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        <p>{state.message}</p>
        {state.recoverable ? (
          <button
            type="button"
            onClick={() => void startPayment()}
            className="w-fit rounded-md border border-red-300 px-4 py-2 text-xs font-medium hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Try again
          </button>
        ) : (
          <a
            href={listingHref}
            className="w-fit rounded-md border border-red-300 px-4 py-2 text-xs font-medium hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Pick your dates again
          </a>
        )}
      </div>
    );
  }

  if (state.phase === 'ready') {
    const options: StripeElementsOptions = {
      clientSecret: state.clientSecret,
      appearance: { theme: 'stripe' },
    };
    return (
      <Elements stripe={stripePromise} options={options}>
        <CheckoutForm bookingId={bookingId} />
      </Elements>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void startPayment()}
      disabled={state.phase === 'creating'}
      data-testid="pay-button"
      className="w-fit rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {state.phase === 'creating' ? 'Starting payment…' : 'Pay now'}
    </button>
  );
}

/**
 * The card form rendered inside <Elements>. Uses Stripe's Payment Element (a
 * cross-origin iframe that collects the card) and confirms the PaymentIntent
 * with a return_url back to the confirmation route. On success Stripe redirects
 * there; only synchronous errors (declined card, validation) come back inline.
 */
function CheckoutForm({ bookingId }: { bookingId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return; // Stripe.js still loading.

    setSubmitting(true);
    setError(null);

    const returnUrl = `${window.location.origin}/bookings/${encodeURIComponent(
      bookingId,
    )}/confirmed`;

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    // We only reach here if there was an IMMEDIATE error (card declined,
    // incomplete fields). On success Stripe redirects to return_url, so this
    // code does not run in the happy path.
    if (result.error) {
      setError(
        result.error.message ??
          'We could not process that card. Please check the details and try again.',
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="payment-form"
      className="flex flex-col gap-4 rounded-xl border border-gray-200 p-5"
    >
      <PaymentElement />

      {error && (
        <p
          role="alert"
          data-testid="card-error"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        data-testid="confirm-payment-button"
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
}
