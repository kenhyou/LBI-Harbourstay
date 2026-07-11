import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainException } from '@/shared/exceptions/domain.exception';
import { InvalidListingStateException } from '@/inventory/domain/exceptions/invalid-listing-state.exception';
import { InvalidListingDetailsException } from '@/inventory/domain/exceptions/invalid-listing-details.exception';
import { ListingNotFoundException } from '@/inventory/domain/exceptions/listing-not-found.exception';
import { OverlappingBlockException } from '@/inventory/domain/exceptions/overlapping-block.exception';
import { BlockNotFoundException } from '@/inventory/domain/exceptions/block-not-found.exception';

/**
 * Maps the `Listing` domain exceptions to HTTP status codes at the presenter
 * boundary — the domain itself stays framework-free. The mapping IS the API
 * contract for error paths:
 *
 *   - InvalidListingStateException  → 409 (illegal publish/unpublish transition)
 *   - OverlappingBlockException     → 409 (S6b: new block overlaps an existing one)
 *   - ListingNotFoundException      → 404 (unknown OR not-owned — the no-leak gate)
 *   - BlockNotFoundException        → 404 (S6b: unblock a block id not on the listing)
 *   - InvalidListingDetailsException→ 422 (empty title / capacity < 1 reaching the
 *                                          domain; Zod normally catches these at 400)
 *
 * Anything unmapped falls through as 400 — a domain failure is always a
 * client-visible rule break, never a 500. (`Money`'s negative-price guard and the
 * `InvalidDateRangeException` both throw before the Zod contract would let a bad
 * value through, so those paths don't normally surface here.)
 */
@Catch(DomainException)
export class ListingExceptionFilter implements ExceptionFilter {
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
      exception instanceof InvalidListingStateException ||
      exception instanceof OverlappingBlockException
    ) {
      return HttpStatus.CONFLICT; // 409
    }
    if (
      exception instanceof ListingNotFoundException ||
      exception instanceof BlockNotFoundException
    ) {
      return HttpStatus.NOT_FOUND; // 404
    }
    if (exception instanceof InvalidListingDetailsException) {
      return HttpStatus.UNPROCESSABLE_ENTITY; // 422
    }
    return HttpStatus.BAD_REQUEST; // 400
  }
}
