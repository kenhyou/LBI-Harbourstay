import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { BookingSummary, CreateBookingRequest } from '@harbourstay/shared';
import { CreateBookingCommand } from '@/booking/application/commands/create-booking.command';
import { GetBookingQuery } from '@/booking/application/queries/get-booking.query';

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

  /** The guest's own booking, or `null` if unknown/not theirs (presenter → 404). */
  getById(guestId: string, id: string): Promise<BookingSummary | null> {
    return this.queryBus.execute(new GetBookingQuery(id, guestId));
  }
}
