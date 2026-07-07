import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentFailedEvent } from '@/payment/domain/events/payment-failed.event';
import { BookingCheckoutSaga } from '@/payment/application/booking-checkout.saga';

/**
 * Thin trigger: on the in-process `PaymentFailed` event, invoke the saga's
 * compensation path (release the hold + expire the booking).
 */
@EventsHandler(PaymentFailedEvent)
export class PaymentFailedHandler implements IEventHandler<PaymentFailedEvent> {
  constructor(private readonly saga: BookingCheckoutSaga) {}

  async handle(event: PaymentFailedEvent): Promise<void> {
    await this.saga.onPaymentFailed(event.paymentId);
  }
}
