/**
 * The result of translating a verified Stripe webhook into BC-3's vocabulary. The
 * ACL strips ALL Stripe-specific fields — this shape carries only primitives BC-3
 * understands. `type` is `'ignored'` for events we don't act on (the handler skips
 * them). `paymentIntentId` resolves the Payment; `eventId` is the dedup key.
 */
export interface TranslatedPaymentEvent {
  /** Stripe `event.id` — the idempotency key for the dedup ledger. */
  eventId: string;
  /** Which BC-3 outcome this event maps to. */
  type: 'succeeded' | 'failed' | 'ignored';
  /** The Stripe PaymentIntent id the event concerns. */
  paymentIntentId: string;
}

/**
 * BC-4 Money Movement — the Anti-Corruption Layer over Stripe, expressed as a port
 * OWNED by BC-3. The adapter (`StripePaymentAdapter`) is the ONLY place the Stripe
 * SDK, signature verification, and client secrets exist. The port speaks
 * PRIMITIVES at the boundary; no Stripe object ever leaks inward.
 */
export abstract class PaymentGatewayPort {
  /**
   * Create a Stripe PaymentIntent (test mode) for a booking and return its client
   * secret (for the frontend Payment Element) plus the opaque intent id.
   * @param bookingId correlation id (stored in Stripe metadata)
   * @param amount minor units (cents)
   * @param currency ISO 4217 (lowercased for Stripe by the adapter)
   */
  abstract createIntent(
    bookingId: string,
    amount: number,
    currency: string,
  ): Promise<{ intentId: string; clientSecret: string }>;

  /**
   * Verify the webhook signature and translate the event into BC-3's vocabulary.
   * MUST throw if the signature does not verify (no translation of unverified
   * input). `rawBody` is the untouched request body Buffer.
   */
  abstract verifyAndParse(
    rawBody: Buffer,
    signature: string,
  ): TranslatedPaymentEvent;
}
