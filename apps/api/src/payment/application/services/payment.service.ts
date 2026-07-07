import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { CreatePaymentIntentResponse } from '@harbourstay/shared';
import { CreatePaymentIntentCommand } from '@/payment/application/commands/create-payment-intent.command';
import { HandleStripeWebhookCommand } from '@/payment/application/commands/handle-stripe-webhook.command';

/**
 * Thin CommandBus facade for BC-3. Controllers talk only to this; it holds no
 * logic beyond dispatching the authenticated `guestId` / the raw webhook bytes.
 */
@Injectable()
export class PaymentService {
  constructor(private readonly commandBus: CommandBus) {}

  createIntent(
    bookingId: string,
    guestId: string,
  ): Promise<CreatePaymentIntentResponse> {
    return this.commandBus.execute(
      new CreatePaymentIntentCommand(bookingId, guestId),
    );
  }

  handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    return this.commandBus.execute(
      new HandleStripeWebhookCommand(rawBody, signature),
    );
  }
}
