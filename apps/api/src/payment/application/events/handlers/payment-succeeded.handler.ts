import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentSucceededEvent } from '@/payment/domain/events/payment-succeeded.event';
import { BookingCheckoutSaga } from '@/payment/application/booking-checkout.saga';

/**
 * Thin trigger: on the in-process `PaymentSucceeded` event, invoke the saga's
 * confirm path. Keeps the saga itself framework-light (no `@EventsHandler` on the
 * saga) and unit-testable with mocked ports.
 */
@EventsHandler(PaymentSucceededEvent)
export class PaymentSucceededHandler
  implements IEventHandler<PaymentSucceededEvent>
{
  constructor(private readonly saga: BookingCheckoutSaga) {}

  async handle(event: PaymentSucceededEvent): Promise<void> {
    await this.saga.onPaymentSucceeded(event.paymentId);
  }
}
