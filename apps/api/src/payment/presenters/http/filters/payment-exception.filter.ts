import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '@/shared/exceptions/domain.exception';
import { PaymentNotFoundException } from '@/payment/domain/exceptions/payment-not-found.exception';
import { InvalidPaymentStateException } from '@/payment/domain/exceptions/invalid-payment-state.exception';
import { BookingNotPayableException } from '@/payment/domain/exceptions/booking-not-payable.exception';
import { BookingNotFoundException } from '@/booking/domain/exceptions/booking-not-found.exception';

/**
 * Maps BC-3 (and the BC-1 not-found that surfaces through the pay endpoint) domain
 * exceptions to HTTP statuses at the presenter boundary; the domain stays
 * framework-free. Anything unmapped falls through as `400` — a domain failure is a
 * client-visible rule break, never a 500.
 *
 * Mappings: unknown/not-owned booking or payment → 404; conflicting payment
 * transition or non-payable booking → 409.
 */
@Catch(DomainException)
export class PaymentExceptionFilter implements ExceptionFilter {
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
      exception instanceof PaymentNotFoundException ||
      exception instanceof BookingNotFoundException
    ) {
      return HttpStatus.NOT_FOUND; // 404
    }
    if (
      exception instanceof InvalidPaymentStateException ||
      exception instanceof BookingNotPayableException
    ) {
      return HttpStatus.CONFLICT; // 409
    }
    return HttpStatus.BAD_REQUEST; // 400
  }
}
