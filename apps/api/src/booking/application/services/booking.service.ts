import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  BookingDetail,
  BookingSummary,
  CancelBookingResponse,
  CreateBookingRequest,
  MyBookingsResponse,
} from '@harbourstay/shared';
import { CreateBookingCommand } from '@/booking/application/commands/create-booking.command';
import { CancelBookingCommand } from '@/booking/application/commands/cancel-booking.command';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';
import { MyBookingsQuery } from '@/booking/application/queries/my-bookings.query';

/**
 * Thin CommandBus/QueryBus facade for BC-1. The controller talks only to this; it
 * holds no logic beyond dispatching with the authenticated `guestId`.
 */
@Injectable()
export class BookingService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  create(
    guestId: string,
    body: CreateBookingRequest,
  ): Promise<BookingSummary> {
    return this.commandBus.execute(
      new CreateBookingCommand(
        guestId,
        body.listingId,
        body.checkIn,
        body.checkOut,
        body.partySize,
      ),
    );
  }

  /** The guest's own booking detail, or `null` if unknown/not theirs (presenter → 404). */
  getById(guestId: string, id: string): Promise<BookingDetail | null> {
    return this.queryBus.execute(new GetBookingQuery(id, guestId));
  }

  /** The current guest's bookings, newest first. */
  listMine(guestId: string): Promise<MyBookingsResponse> {
    return this.queryBus.execute(new MyBookingsQuery(guestId));
  }

  /** Cancel the guest's own booking within policy; returns the cancellation outcome. */
  cancel(
    guestId: string,
    id: string,
    reason?: string,
  ): Promise<CancelBookingResponse> {
    return this.commandBus.execute(
      new CancelBookingCommand(id, guestId, reason),
    );
  }
}
