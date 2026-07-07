/**
 * In-process domain event (BC-3) — the Stripe webhook reported the payment
 * failed. Published on the Nest CQRS `EventBus` after the mark-failed transaction
 * commits; a thin `@EventsHandler` reacts by invoking the compensating saga path.
 *
 * Payload is primitives ONLY (a paymentId string).
 */
export class PaymentFailedEvent {
  constructor(public readonly paymentId: string) {}
}
