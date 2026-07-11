import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentService } from '@/payment/application/services/payment.service';

/**
 * BC-3 Stripe webhook receiver. UNGUARDED (Stripe can't send our cookie) — trust
 * comes from the SIGNATURE, verified in the ACL over the RAW body. `rawBody` is
 * populated by `NestFactory.create(App, { rawBody: true })` (see main.ts); the
 * JSON parser is untouched for every other route.
 *
 * Always answers fast: a handled/duplicate/ignored event → 200; a verification or
 * handling failure → 400 (Stripe will retry). The dedup ledger makes retries safe.
 */
// Exempt from the global rate limiter: Stripe legitimately BURSTS webhooks (an event
// plus its automatic retries) and retries from Stripe's IPs, so a throttle would drop
// real events and cause missed confirmations. This endpoint is not protected by a
// limiter but by STRIPE SIGNATURE VERIFICATION over the raw body (see below) — an
// unauthenticated caller can't forge a valid event, and the dedup ledger makes the
// retries idempotent.
@SkipThrottle()
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly payments: PaymentService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async stripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    try {
      await this.payments.handleWebhook(req.rawBody, signature);
    } catch {
      // Bad signature / unknown intent / transient failure → 400 so Stripe retries.
      throw new BadRequestException('Webhook verification or handling failed');
    }

    return { received: true };
  }
}
