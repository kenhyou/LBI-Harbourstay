import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '@/shared/exceptions/domain.exception';
import { InvalidBookingStateException } from '@/booking/domain/exceptions/invalid-booking-state.exception';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';
import { InvalidDateRangeException } from '@/booking/domain/exceptions/invalid-date-range.exception';
import { PartySizeExceedsCapacityException } from '@/booking/domain/exceptions/party-size-exceeds-capacity.exception';
import { OverlappingHoldException } from '@/inventory/domain/exceptions/overlapping-hold.exception';
import { DatesNotAvailableException } from '@/inventory/domain/exceptions/dates-not-available.exception';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { InvalidHoldStateException } from '@/inventory/domain/exceptions/invalid-hold-state.exception';

/**
 * Maps the S3 domain exceptions (both BC-1 Booking and the BC-2 Availability
 * exceptions that surface through the Create-Booking seam) to HTTP status codes
 * at the presenter boundary. The domain stays framework-free. Anything not mapped
 * falls through as `400` — a domain failure is a client-visible rule break, never
 * a 500.
 *
 * Key mappings (DoD): overbooking conflict → 409; blocked dates → 409;
 * over-capacity → 422; bad date range → 400.
 */
@Catch(DomainException)
export class BookingExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(exception);
    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }

  private statusFor(exception: DomainException): number {
    if (
      exception instanceof OverlappingHoldException ||
      exception instanceof DatesNotAvailableException ||
      exception instanceof InvalidBookingStateException ||
      exception instanceof InvalidHoldStateException
    ) {
      return HttpStatus.CONFLICT; // 409
    }
    if (exception instanceof PartySizeExceedsCapacityException) {
      return HttpStatus.UNPROCESSABLE_ENTITY; // 422
    }
    if (
      exception instanceof ListingNotFoundException ||
      exception instanceof BookingNotFoundException
    ) {
      return HttpStatus.NOT_FOUND; // 404
    }
    if (exception instanceof InvalidDateRangeException) {
      return HttpStatus.BAD_REQUEST; // 400
    }
    return HttpStatus.BAD_REQUEST; // 400
  }
}
