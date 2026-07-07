import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { CreatePaymentIntentResponse } from '@harbourstay/shared';
import { CreatePaymentIntentCommand } from '@/payment/application/commands/create-payment-intent.command';
import { PaymentGatewayPort } from '@/payment/application/ports/payment-gateway.port';
import { PaymentRepositoryPort } from '@/payment/application/ports/payment.repository.port';
import { PaymentBookingQueryPort } from '@/payment/application/ports/payment-booking.query.port';
import { Payment } from '@/payment/domain/models/payment.model';
import { Money } from '@/payment/domain/vo/money.vo';
import { BookingNotPayableException } from '@/payment/domain/exceptions/booking-not-payable.exception';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';

/**
 * Create a Stripe PaymentIntent for a booking and open a `Pending` Payment.
 * Orchestration only:
 *   1. load the payable booking (ownership-checked against the caller's guestId)
 *   2. guard: it must still be `PendingPayment`
 *   3. create the intent via the Stripe ACL (amount = the frozen priceSnapshot)
 *   4. persist a `Pending` Payment referencing the intent
 *   5. return the client secret + our internal paymentId
 *
 * Ownership: an unknown OR not-owned booking reads as `BookingNotFoundException`
 * (→ 404) — the existence of another guest's booking is never revealed.
 */
@CommandHandler(CreatePaymentIntentCommand)
export class CreatePaymentIntentHandler
  implements ICommandHandler<CreatePaymentIntentCommand, CreatePaymentIntentResponse>
{
  constructor(
    private readonly gateway: PaymentGatewayPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly bookings: PaymentBookingQueryPort,
  ) {}

  async execute(
    command: CreatePaymentIntentCommand,
  ): Promise<CreatePaymentIntentResponse> {
    const booking = await this.bookings.findPayableBooking(command.bookingId);
    if (!booking || booking.guestId !== command.guestId) {
      throw new BookingNotFoundException(command.bookingId);
    }
    if (booking.status !== 'PendingPayment') {
      throw new BookingNotPayableException(command.bookingId, booking.status);
    }

    const { intentId, clientSecret } = await this.gateway.createIntent(
      booking.bookingId,
      booking.amount,
      booking.currency,
    );

    const payment = Payment.create({
      bookingId: booking.bookingId,
      amount: Money.create(booking.amount, booking.currency),
      stripePaymentIntentId: intentId,
    });
    await this.payments.save(payment);

    return { clientSecret, paymentId: payment.id };
  }
}
