// KEN'S FILL FILE — written by Claude at Ken's request (no React experience yet).
// Recorded as a fill-file opt-out in docs/build/PROGRESS.md. Kept heavily commented
// so it reads as a React primer; the S5 frontend learning goal rolls forward.
//
// The guest-facing "Cancel booking" confirm dialog. Mounted by
// app/account/bookings/[id]/page.tsx only when the booking is still cancellable
// (PendingPayment | Confirmed). Its executable spec is apps/web/e2e/cancel-booking.spec.ts.

// 'use client' marks this a CLIENT component: it ships JS to the browser and may use
// state + event handlers + browser APIs. (RSC pages render on the server and can't.)
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelBookingResponse, type BookingDetail } from '@harbourstay/shared';
import { formatPrice } from '@/lib/format';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A client-side refund estimate — UX only. The SERVER is authoritative on confirm. */
interface RefundPreview {
  cancellable: boolean;
  refundAmount: number; // minor units (cents)
  message: string;
}

/**
 * Mirror of the backend CancellationPolicy tiers, for messaging only. If this ever
 * disagrees with the server (e.g. clock skew at a boundary), the server wins — we
 * only ever SHOW this; we act on the API response.
 */
function previewRefund(booking: BookingDetail, now: Date): RefundPreview {
  if (booking.status === 'PendingPayment') {
    return {
      cancellable: true,
      refundAmount: 0,
      message: 'No payment has been taken yet — nothing to refund.',
    };
  }
  // checkIn is a 'YYYY-MM-DD' calendar date; compare at UTC midnight.
  const checkIn = new Date(`${booking.checkIn}T00:00:00Z`);
  const gapMs = checkIn.getTime() - now.getTime();

  if (gapMs >= 7 * DAY_MS) {
    return {
      cancellable: true,
      refundAmount: booking.priceSnapshot,
      message: `You'll be refunded ${formatPrice(booking.priceSnapshot)} — a full refund.`,
    };
  }
  if (gapMs >= 2 * DAY_MS) {
    const half = Math.floor(booking.priceSnapshot / 2); // floor: never over-refund
    return {
      cancellable: true,
      refundAmount: half,
      message: `You'll be refunded ${formatPrice(half)} — 50%, since check-in is under 7 days away.`,
    };
  }
  return {
    cancellable: false,
    refundAmount: 0,
    message: 'This booking is within 48 hours of check-in.',
  };
}

export interface CancelBookingDialogProps {
  booking: BookingDetail;
}

export function CancelBookingDialog({ booking }: CancelBookingDialogProps) {
  // `useRouter().refresh()` re-runs the SERVER component for this route, so after a
  // successful cancel the page re-fetches and re-renders in its Cancelled state.
  const router = useRouter();

  // useState = a value React remembers between renders; calling the setter re-renders.
  const [open, setOpen] = useState(false); // is the modal showing?
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [submitting, setSubmitting] = useState(false); // POST in flight?
  const [error, setError] = useState<string | null>(null); // server refusal message

  // useRef = a mutable handle that survives renders WITHOUT causing one. We use two:
  // the trigger (to restore focus to it on close) and the dialog surface (to focus
  // it on open) — basic modal a11y so keyboard/screen-reader users aren't stranded.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // useEffect runs AFTER render, in the browser only. When the modal opens, move
  // focus into it; on close, hand focus back to the trigger that opened it.
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  function handleOpen() {
    // Compute the preview at open time (not during render) so `new Date()` never
    // causes a server/client hydration mismatch.
    setPreview(previewRefund(booking, new Date()));
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (submitting) return; // don't let the guest dismiss mid-request
    setOpen(false);
  }

  // Escape closes the dialog — the keyboard equivalent of clicking the backdrop.
  function handleDialogKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') handleClose();
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      // Same-origin call → the httpOnly auth cookie is attached automatically.
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(booking.id)}/cancel`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}), // only an optional `reason` accepted; none here
        },
      );

      if (res.status === 401) {
        // Session expired — bounce to login, come back to this page after.
        window.location.assign(`/login?next=/account/bookings/${booking.id}`);
        return;
      }
      if (res.status === 409) {
        // The server's policy refused (too late / wrong state) — it is authoritative.
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'This booking can no longer be cancelled.';
        setError(message);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      // 200 — validate the shape and trust the server. We don't need to read the
      // amount here; the refreshed page renders the cancelled state + refund.
      cancelBookingResponse.parse(await res.json());
      setOpen(false);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="cancel-booking-trigger"
        onClick={handleOpen}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Cancel booking
      </button>

      {/* `open && (...)` — render the modal only while open (false on first paint on
          both server and client, so no hydration mismatch). The outer div is just the
          backdrop; the accessible dialog role lives on the card it frames. */}
      {open && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleClose} // click the backdrop to dismiss
        >
          {/* stopPropagation: clicks inside the card must NOT bubble to the backdrop.
              tabIndex={-1} makes the card programmatically focusable (for focus-on-open)
              without adding it to the Tab order. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cancel-dialog-title" className="text-lg font-semibold">
              Cancel this booking?
            </h2>

            <p
              data-testid="cancel-refund-preview"
              className="mt-2 text-sm text-gray-600"
            >
              {preview.message}
            </p>

            {!preview.cancellable && (
              <p
                data-testid="cancel-not-allowed"
                className="mt-2 text-sm font-medium text-red-700"
              >
                This booking can no longer be cancelled.
              </p>
            )}

            {error && (
              <p
                data-testid="cancel-error"
                role="alert"
                className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                data-testid="cancel-dismiss"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Keep booking
              </button>
              <button
                type="button"
                data-testid="cancel-confirm"
                onClick={handleConfirm}
                // Disabled when the preview says "too late" or a request is in flight —
                // this is what the negative Playwright path asserts.
                disabled={!preview.cancellable || submitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Cancelling…' : 'Cancel booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
