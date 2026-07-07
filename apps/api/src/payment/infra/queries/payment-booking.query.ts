import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  PaymentBookingQueryPort,
  type PayableBooking,
} from '@/payment/application/ports/payment-booking.query.port';

/**
 * Read impl of `PaymentBookingQueryPort` (BC-3). Projects the `booking` row into
 * the minimal payable shape for Create-PaymentIntent — no aggregate. Currency is
 * USD for the MVP (single-currency; booking stores minor units only).
 */
@Injectable()
export class PaymentBookingQuery extends PaymentBookingQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPayableBooking(bookingId: string): Promise<PayableBooking | null> {
    const row = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, guestId: true, priceSnapshot: true, status: true },
    });
    if (!row) {
      return null;
    }
    return {
      bookingId: row.id,
      guestId: row.guestId,
      amount: row.priceSnapshot,
      currency: 'USD',
      status: row.status,
    };
  }
}
