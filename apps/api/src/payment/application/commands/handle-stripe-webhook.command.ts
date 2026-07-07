/**
 * Command for `POST /webhooks/stripe`. Carries the UNTOUCHED raw body Buffer (the
 * signature is computed over exact bytes) and the `stripe-signature` header. The
 * ACL verifies + translates; the application never sees Stripe's shape.
 */
export class HandleStripeWebhookCommand {
  constructor(
    public readonly rawBody: Buffer,
    public readonly signature: string,
  ) {}
}
