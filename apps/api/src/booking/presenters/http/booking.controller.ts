import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  cancelBookingRequest,
  createBookingRequest,
  type AuthUser,
  type BookingDetail,
  type BookingSummary,
  type CancelBookingRequest,
  type CancelBookingResponse,
  type CreateBookingRequest,
  type MyBookingsResponse,
} from '@harbourstay/shared';
import { ZodValidationPipe } from '@/shared/pipes/zod-validation.pipe';
import { BookingService } from '@/booking/application/services/booking.service';
import { BookingExceptionFilter } from '@/booking/presenters/http/filters/booking-exception.filter';
import { JwtCookieGuard } from '@/identity/presenters/http/guards/jwt-cookie.guard';
import { CurrentUser } from '@/identity/presenters/http/decorators/current-user.decorator';

/**
 * BC-1 HTTP surface. Every route is auth-guarded: the guest identity is taken from
 * the session cookie (`@CurrentUser`), NEVER from the body/params. Bodies are
 * validated against the shared contracts; domain rule breaks are mapped to statuses
 * by `BookingExceptionFilter` (overbooking → 409, invalid state → 409,
 * over-capacity → 422, not-found → 404).
 *
 * The controller has NO path prefix so it can host both `/bookings*` and the
 * guest-scoped `/me/bookings` under one class; each route declares its full path.
 */
@ApiTags('bookings')
@Controller()
@UseGuards(JwtCookieGuard)
@UseFilters(BookingExceptionFilter)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post('bookings')
  @HttpCode(HttpStatus.CREATED)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Place a hold and create a PendingPayment booking (Partnership seam).',
  })
  @ApiCreatedResponse({ description: 'The pending-payment booking summary.' })
  @ApiConflictResponse({ description: 'Dates overlap an existing hold or are blocked.' })
  @ApiUnprocessableEntityResponse({ description: 'Party size exceeds listing capacity.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  create(
    @CurrentUser() user: AuthUser,
    // Scope the Zod pipe to the body only — a method-level pipe would also
    // (wrongly) validate the `@CurrentUser` object against the request schema.
    @Body(new ZodValidationPipe(createBookingRequest)) body: CreateBookingRequest,
  ): Promise<BookingSummary> {
    return this.bookings.create(user.id, body);
  }

  @Get('me/bookings')
  @ApiCookieAuth()
  @ApiOperation({ summary: "List the current guest's own bookings (newest first)." })
  @ApiOkResponse({ description: 'The guest\'s bookings as full detail read models.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  listMine(@CurrentUser() user: AuthUser): Promise<MyBookingsResponse> {
    return this.bookings.listMine(user.id);
  }

  @Get('bookings/:id')
  @ApiCookieAuth()
  @ApiOperation({ summary: "Read one of the current guest's own bookings." })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiOkResponse({ description: 'The full booking detail read model.' })
  @ApiNotFoundResponse({ description: 'No such booking owned by the current guest.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  async getById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<BookingDetail> {
    const booking = await this.bookings.getById(user.id, id);
    if (!booking) {
      // 404 (not 403) whether the id is unknown OR owned by another guest — never
      // reveal the existence of someone else's booking.
      throw new NotFoundException(`Booking ${id} not found`);
    }
    return booking;
  }

  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Cancel one of the current guest\'s bookings within policy.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiOkResponse({ description: 'The cancellation outcome (status, cancelledAt, refundAmount).' })
  @ApiConflictResponse({ description: 'The booking cannot be cancelled in its current state / policy window.' })
  @ApiNotFoundResponse({ description: 'No such booking owned by the current guest.' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated.' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelBookingRequest)) body: CancelBookingRequest,
  ): Promise<CancelBookingResponse> {
    // Ownership + the 404-no-leak are enforced inside the handler (it throws
    // BookingNotFoundException → 404 for both unknown and not-owned bookings).
    return this.bookings.cancel(user.id, id, body.reason);
  }
}
