import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentGatewayPort,
  type TranslatedPaymentEvent,
} from '@/payment/application/ports/payment-gateway.port';

/**
 * BC-4 Money Movement — the Stripe Anti-Corruption Layer (test mode only). The
 * ONLY place the `stripe` SDK, webhook signature verification, and client secrets
 * exist. Reads `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` from config. It
 * translates Stripe's shape into BC-3's `TranslatedPaymentEvent` (primitives) so
 * no vendor vocabulary leaks inward, and never returns a Stripe object outward.
 */
@Injectable()
export class StripePaymentAdapter extends PaymentGatewayPort {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    super();
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    const webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    this.webhookSecret = webhookSecret;
    // No explicit apiVersion — pin to the SDK's default for reproducibility.
    this.stripe = new Stripe(secretKey);
  }

  async createIntent(
    bookingId: string,
    amount: number,
    currency: string,
  ): Promise<{ intentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      // Correlate the intent back to our booking without leaking Stripe inward.
      metadata: { bookingId },
      automatic_payment_methods: { enabled: true },
    });
    if (!intent.client_secret) {
      throw new Error('Stripe did not return a client secret');
    }
    return { intentId: intent.id, clientSecret: intent.client_secret };
  }

  /**
   * Verify the signature FIRST (`constructEvent` throws on mismatch), then map the
   * Stripe event type to a BC-3 outcome. Any event we don't act on is `'ignored'`.
   */
  verifyAndParse(rawBody: Buffer, signature: string): TranslatedPaymentEvent {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    const object = event.data.object as { id?: string };
    const paymentIntentId = object.id ?? '';

    switch (event.type) {
      case 'payment_intent.succeeded':
        return { eventId: event.id, type: 'succeeded', paymentIntentId };
      case 'payment_intent.payment_failed':
        return { eventId: event.id, type: 'failed', paymentIntentId };
      default:
        return { eventId: event.id, type: 'ignored', paymentIntentId };
    }
  }
}
