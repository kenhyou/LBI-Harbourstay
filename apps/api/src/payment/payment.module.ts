import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { BookingModule } from '@/booking/booking.module';
import { IdentityModule } from '@/identity/identity.module';
import { OutboxModule } from '@/shared/outbox/outbox.module';

import { PaymentController } from '@/payment/presenters/http/payment.controller';
import { WebhookController } from '@/payment/presenters/http/webhook.controller';
import { PaymentService } from '@/payment/application/services/payment.service';
import { BookingCheckoutSaga } from '@/payment/application/booking-checkout.saga';

import { PaymentGatewayPort } from '@/payment/application/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '@/payment/application/ports/payment.repository.port';
import { ProcessedWebhookEventRepositoryPort } from '@/payment/application/ports/processed-webhook-event.repository.port';
import { PaymentBookingQueryPort } from '@/payment/application/ports/payment-booking.query.port';
import { PaymentLookupPort } from '@/payment/application/ports/payment-lookup.port';
import { ExpiredBookingScanPort } from '@/payment/application/ports/expired-booking-scan.port';

import { StripePaymentAdapter } from '@/payment/infra/adapters/stripe-payment.adapter';
import { PaymentRepository } from '@/payment/infra/repositories/payment.repository';
import { ProcessedWebhookEventRepository } from '@/payment/infra/repositories/processed-webhook-event.repository';
import { PaymentBookingQuery } from '@/payment/infra/queries/payment-booking.query';
import { PaymentLookupQuery } from '@/payment/infra/queries/payment-lookup.query';
import { ExpiredBookingScanQuery } from '@/payment/infra/queries/expired-booking-scan.query';

import { CreatePaymentIntentHandler } from '@/payment/application/commands/handlers/create-payment-intent.command.handler';
import { HandleStripeWebhookHandler } from '@/payment/application/commands/handlers/handle-stripe-webhook.command.handler';
import { PaymentSucceededHandler } from '@/payment/application/events/handlers/payment-succeeded.handler';
import { PaymentFailedHandler } from '@/payment/application/events/handlers/payment-failed.handler';
import { HoldExpiryJob } from '@/payment/application/jobs/hold-expiry.job';

const commandHandlers = [CreatePaymentIntentHandler, HandleStripeWebhookHandler];
const eventHandlers = [PaymentSucceededHandler, PaymentFailedHandler];

/**
 * BC-3 Payment Confirmation (+ the BC-4 Stripe ACL). Binds every port to its impl
 * exactly once. Imports:
 * - `BookingModule` (exports `BookingRepositoryPort` — the saga confirms/expires
 *   the Booking) and `InventoryModule` (exports `HoldRepositoryPort` — the saga
 *   commits/releases the Hold). One-directional: neither imports Payment → no cycle.
 * - `OutboxModule` (exports `OutboxPort` — the saga enqueues `BookingConfirmed`).
 * - `IdentityModule` (exports `JwtCookieGuard` for the pay endpoint).
 * `TransactionManagerPort` comes from the global `TransactionModule`.
 *
 * The webhook marks the Payment then publishes an in-process `PaymentSucceeded`/
 * `PaymentFailed` event; the thin `@EventsHandler`s invoke the saga in its own txn.
 * `HoldExpiryJob` runs on the schedule (`ScheduleModule` in AppModule).
 */
@Module({
  imports: [
    CqrsModule,
    PrismaModule,
    InventoryModule,
    BookingModule,
    IdentityModule,
    OutboxModule,
  ],
  controllers: [PaymentController, WebhookController],
  providers: [
    PaymentService,
    BookingCheckoutSaga,
    HoldExpiryJob,
    { provide: PaymentGatewayPort, useClass: StripePaymentAdapter },
    { provide: PaymentRepositoryPort, useClass: PaymentRepository },
    {
      provide: ProcessedWebhookEventRepositoryPort,
      useClass: ProcessedWebhookEventRepository,
    },
    { provide: PaymentBookingQueryPort, useClass: PaymentBookingQuery },
    { provide: PaymentLookupPort, useClass: PaymentLookupQuery },
    { provide: ExpiredBookingScanPort, useClass: ExpiredBookingScanQuery },
    ...commandHandlers,
    ...eventHandlers,
  ],
})
export class PaymentModule {}
