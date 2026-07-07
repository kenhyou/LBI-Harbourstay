/**
 * In-process domain event (BC-3) — the Stripe webhook confirmed the payment.
 * Published on the Nest CQRS `EventBus` AFTER the mark-succeeded transaction
 * commits; a thin `@EventsHandler` reacts by invoking the `BookingCheckoutSaga`.
 *
 * Payload is primitives ONLY (a paymentId string) — no VO, no Stripe object. This
 * is the trigger that keeps the saga framework-light and unit-testable.
 */
export class PaymentSucceededEvent {
  constructor(public readonly paymentId: string) {}
}
