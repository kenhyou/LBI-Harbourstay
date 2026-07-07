import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  BookingNotPayableError,
  PaymentApiError,
  PaymentAuthRequiredError,
  PaymentBookingNotFoundError,
  createPaymentIntent,
} from '@/lib/api/payments';

/**
 * Cookie-forwarding bridge for `POST /bookings/:id/pay`. The browser calls this
 * SAME-ORIGIN route (so the httpOnly auth cookie rides along automatically); it
 * reads that cookie via next/headers, forwards it verbatim to the cross-origin
 * API (ownership is enforced there from the cookie, never the body — there is no
 * body), and maps the documented statuses to clean JSON:
 *   201 → the CreatePaymentIntentResponse ({ clientSecret, paymentId })
 *   401 → { error } (client redirects to /login?next=)
 *   404 → { error } (unknown booking / not the caller's)
 *   409 → { error, code: 'not-payable' } (hold lapsed / already resolved)
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const intent = await createPaymentIntent(id, cookieHeader);
    return NextResponse.json(intent, { status: 201 });
  } catch (err) {
    if (err instanceof PaymentAuthRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof PaymentBookingNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof BookingNotPayableError) {
      return NextResponse.json(
        { error: err.message, code: 'not-payable' },
        { status: 409 },
      );
    }
    if (err instanceof PaymentApiError) {
      return NextResponse.json(
        { error: 'Unable to start payment right now' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'Unable to start payment right now' },
      { status: 502 },
    );
  }
}
