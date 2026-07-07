import { z } from 'zod';

/**
 * Contract for the S4 Payment slice (BC-4 Payments).
 * DTO/transport shape only, not a domain VO — the web app parses this response
 * and hands `clientSecret` to Stripe.js to render the Payment Element.
 *
 * Deliberately SMALL: most S4 complexity is backend, not contract. What stays
 * OUT of the Shared Kernel, and why:
 *  - The raw Stripe webhook event: vendor-shaped, signature-verified in the
 *    Stripe Anti-Corruption Layer; letting it in would leak Stripe vocabulary
 *    inward. Infra concern, not a shared DTO.
 *  - The `BookingConfirmed` event payload: a backend-internal domain event
 *    (Booking → Outbox → Notifications), primitives only, owned by the api
 *    domain layer; it never crosses the web↔api boundary.
 *  - The Stripe publishable key: a public build-time env var on the web app
 *    (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), not an API response field.
 *  - Confirmation reuses `bookingSummary` (status flips to `Confirmed`) via
 *    `GET /bookings/:id` — no new response DTO for it.
 */

/**
 * Response body for `POST /bookings/:id/pay`. The backend creates a Stripe
 * PaymentIntent (test mode) and returns its `clientSecret` for the frontend to
 * complete payment, plus our internal `paymentId` so the frontend can
 * poll/correlate confirmation.
 */
export const createPaymentIntentResponse = z.object({
  clientSecret: z.string().min(1),
  paymentId: z.string().uuid(),
});

export type CreatePaymentIntentResponse = z.infer<
  typeof createPaymentIntentResponse
>;
